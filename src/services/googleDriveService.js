import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { exchangeCodeAsync, fetchUserInfoAsync, refreshAsync, revokeAsync, TokenResponse } from 'expo-auth-session';
import {
  BACKUP_DRIVE_TOKEN_SECURE_KEY,
  GOOGLE_DISCOVERY,
  GOOGLE_DRIVE_SCOPES,
} from './backupConstants';

WebBrowser.maybeCompleteAuthSession();

const DEFAULT_DRIVE_FOLDER_NAME = 'IRONLOG Backups';
const DRIVE_MODE_FOLDER = 'folder';
const DRIVE_MODE_APPDATA = 'appdata';
const DRIVE_OAUTH_ANDROID_CLIENT_ID_KEY = '@ironlog/googleDriveAndroidClientId';
let runtimeDriveClientId = '';

function readExpoExtraValue(key) {
  const value =
    Constants?.expoConfig?.extra?.[key]
    ?? Constants?.manifest?.extra?.[key]
    ?? '';
  return String(value || '').trim();
}

function getGoogleClientId() {
  const candidates = [
    runtimeDriveClientId,
    readExpoExtraValue('googleDriveAndroidClientId'),
    readExpoExtraValue('googleDriveClientId'),
    readExpoExtraValue('googleDriveWebClientId'),
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_WEB_CLIENT_ID,
  ];
  return candidates.find((value) => String(value || '').trim()) || '';
}

export async function hydrateDriveOAuthConfig() {
  const stored = await AsyncStorage.getItem(DRIVE_OAUTH_ANDROID_CLIENT_ID_KEY);
  runtimeDriveClientId = String(stored || '').trim();
  return runtimeDriveClientId;
}

export async function saveDriveOAuthClientId(clientId) {
  const normalized = String(clientId || '').trim();
  if (!normalized) throw new Error('Client ID cannot be empty.');
  runtimeDriveClientId = normalized;
  await AsyncStorage.setItem(DRIVE_OAUTH_ANDROID_CLIENT_ID_KEY, normalized);
  return normalized;
}

export async function clearDriveOAuthClientId() {
  runtimeDriveClientId = '';
  await AsyncStorage.removeItem(DRIVE_OAUTH_ANDROID_CLIENT_ID_KEY);
}

function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: 'ironlog',
    path: 'oauth',
  });
}

function escapeDriveQueryLiteral(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getStoredDriveToken() {
  const raw = await SecureStore.getItemAsync(BACKUP_DRIVE_TOKEN_SECURE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function saveStoredDriveToken(token) {
  await SecureStore.setItemAsync(BACKUP_DRIVE_TOKEN_SECURE_KEY, JSON.stringify(token));
}

async function clearStoredDriveToken() {
  await SecureStore.deleteItemAsync(BACKUP_DRIVE_TOKEN_SECURE_KEY);
}

async function getFreshToken() {
  const token = await getStoredDriveToken();
  if (!token) return null;
  const tokenResponse = new TokenResponse(token);
  if (!tokenResponse.shouldRefresh() || !token.refreshToken) {
    return tokenResponse;
  }
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('Google Drive backup is not configured on this build.');
  }
  const refreshed = await refreshAsync({
    clientId,
    refreshToken: token.refreshToken,
    scopes: GOOGLE_DRIVE_SCOPES,
  }, GOOGLE_DISCOVERY);
  const nextToken = {
    ...token,
    ...refreshed.getRequestConfig(),
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || token.refreshToken,
    expiresIn: refreshed.expiresIn,
    issuedAt: refreshed.issuedAt,
    idToken: refreshed.idToken || token.idToken,
  };
  await saveStoredDriveToken(nextToken);
  return new TokenResponse(nextToken);
}

async function authorizedFetch(url, options = {}, accessTokenOverride = null) {
  let accessToken = accessTokenOverride;
  if (!accessToken) {
    const token = await getFreshToken();
    accessToken = token?.accessToken;
  }
  if (!accessToken) {
    throw new Error('Google Drive is not connected.');
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Drive request failed with ${response.status}`);
  }
  return response;
}

async function findFolderByName(accessToken, folderName) {
  const safeName = escapeDriveQueryLiteral(folderName);
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents and name='${safeName}'`
  );
  const response = await authorizedFetch(
    `https://www.googleapis.com/drive/v3/files?fields=files(id,name,createdTime)&q=${q}`,
    {},
    accessToken
  );
  const payload = await response.json();
  const folders = Array.isArray(payload?.files) ? payload.files : [];
  return folders[0] || null;
}

async function createFolder(accessToken, folderName) {
  const response = await authorizedFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,createdTime',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
      }),
    },
    accessToken
  );
  return response.json();
}

async function ensureBackupFolder(accessToken, folderName) {
  const requestedName = String(folderName || '').trim() || DEFAULT_DRIVE_FOLDER_NAME;
  const existing = await findFolderByName(accessToken, requestedName);
  if (existing?.id) {
    return { id: existing.id, name: existing.name || requestedName };
  }
  const created = await createFolder(accessToken, requestedName);
  if (!created?.id) throw new Error('Could not create Drive backup folder.');
  return { id: created.id, name: created.name || requestedName };
}

async function pruneRemoteBackups(retentionCount) {
  const snapshots = await listDriveSnapshots();
  const removable = snapshots.filter((snapshot) => !snapshot.isRollback).slice(retentionCount);
  await Promise.all(removable.map(async (snapshot) => {
    await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${snapshot.remoteFileId || snapshot.driveFileId}`, {
      method: 'DELETE',
    });
  }));
}

export function getDriveConfiguration() {
  const clientId = getGoogleClientId();
  const configuredFrom = runtimeDriveClientId
    ? 'device_override'
    : readExpoExtraValue('googleDriveAndroidClientId') || readExpoExtraValue('googleDriveClientId') || readExpoExtraValue('googleDriveWebClientId')
      ? 'app_config'
      : (process.env.EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_DRIVE_WEB_CLIENT_ID)
        ? 'env'
        : null;
  return {
    configured: !!clientId,
    clientId,
    redirectUri: getRedirectUri(),
    configuredFrom,
    expectedEnv:
      'Set Google OAuth Android Client ID in-app, or configure EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID',
  };
}

export async function isDriveBackupAvailable() {
  const config = getDriveConfiguration();
  if (!config.configured) return false;
  const token = await getStoredDriveToken();
  return !!token?.accessToken;
}

export async function getDriveConnectionStatus() {
  const config = getDriveConfiguration();
  const token = await getStoredDriveToken();
  return {
    configured: config.configured,
    linked: !!token?.accessToken,
    email: token?.email || null,
    connectedAt: token?.connectedAt || null,
    redirectUri: config.redirectUri,
    folderId: token?.driveFolderId || null,
    folderName: token?.driveFolderName || null,
    mode: token?.driveMode || (token?.driveFolderId ? DRIVE_MODE_FOLDER : DRIVE_MODE_APPDATA),
    configuredFrom: config.configuredFrom || null,
    reason: config.configured ? null : `Google Drive OAuth client missing. ${config.expectedEnv}.`,
  };
}

export async function connectGoogleDrive(options = {}) {
  const { configured, clientId, redirectUri } = getDriveConfiguration();
  if (!configured) {
    throw new Error('Google Drive backup is not configured on this build. Set EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID first.');
  }

  const request = await AuthSession.loadAsync({
    clientId,
    scopes: GOOGLE_DRIVE_SCOPES,
    redirectUri,
    responseType: 'code',
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  }, GOOGLE_DISCOVERY);

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type !== 'success' || !result.params?.code) {
    return { connected: false, cancelled: result.type !== 'success' };
  }

  const tokenResponse = await exchangeCodeAsync({
    clientId,
    code: result.params.code,
    redirectUri,
    extraParams: {
      code_verifier: request.codeVerifier || '',
    },
  }, GOOGLE_DISCOVERY);

  let email = null;
  try {
    const user = await fetchUserInfoAsync({ accessToken: tokenResponse.accessToken }, {
      userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    });
    email = user?.email || null;
  } catch (_) {
    // Ignore user-info failures; Drive backup can still work.
  }

  const mode = options.mode === DRIVE_MODE_APPDATA ? DRIVE_MODE_APPDATA : DRIVE_MODE_FOLDER;
  let selectedFolder = null;
  if (mode === DRIVE_MODE_FOLDER) {
    selectedFolder = await ensureBackupFolder(tokenResponse.accessToken, options.folderName || DEFAULT_DRIVE_FOLDER_NAME);
  }

  const nextToken = {
    ...tokenResponse.getRequestConfig(),
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken || null,
    expiresIn: tokenResponse.expiresIn,
    issuedAt: tokenResponse.issuedAt,
    idToken: tokenResponse.idToken || null,
    email,
    connectedAt: new Date().toISOString(),
    driveFolderId: selectedFolder?.id || null,
    driveFolderName: selectedFolder?.name || null,
    driveMode: mode,
  };
  await saveStoredDriveToken(nextToken);
  return {
    connected: true,
    email,
    connectedAt: nextToken.connectedAt,
    folderId: selectedFolder?.id || null,
    folderName: selectedFolder?.name || null,
    mode,
  };
}

export async function setDriveBackupFolder(folderName) {
  const normalized = String(folderName || '').trim();
  if (!normalized) throw new Error('Folder name cannot be empty.');
  const fresh = await getFreshToken();
  if (!fresh?.accessToken) throw new Error('Google Drive is not connected.');
  const selectedFolder = await ensureBackupFolder(fresh.accessToken, normalized);
  const token = await getStoredDriveToken();
  const nextToken = {
    ...(token || {}),
    ...(fresh.getRequestConfig ? fresh.getRequestConfig() : {}),
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken || token?.refreshToken || null,
    driveFolderId: selectedFolder.id,
    driveFolderName: selectedFolder.name,
    driveMode: DRIVE_MODE_FOLDER,
  };
  await saveStoredDriveToken(nextToken);
  return selectedFolder;
}

export async function setDriveSyncMode(mode) {
  const normalized = mode === DRIVE_MODE_APPDATA ? DRIVE_MODE_APPDATA : DRIVE_MODE_FOLDER;
  const token = await getStoredDriveToken();
  if (!token?.accessToken) throw new Error('Google Drive is not connected.');
  let folderId = token.driveFolderId || null;
  let folderName = token.driveFolderName || null;
  if (normalized === DRIVE_MODE_FOLDER && !folderId) {
    const fresh = await getFreshToken();
    const selected = await ensureBackupFolder(fresh?.accessToken, DEFAULT_DRIVE_FOLDER_NAME);
    folderId = selected.id;
    folderName = selected.name;
  }
  const nextToken = {
    ...token,
    driveMode: normalized,
    driveFolderId: normalized === DRIVE_MODE_FOLDER ? folderId : null,
    driveFolderName: normalized === DRIVE_MODE_FOLDER ? folderName : null,
  };
  await saveStoredDriveToken(nextToken);
  return { mode: normalized, folderId: nextToken.driveFolderId || null, folderName: nextToken.driveFolderName || null };
}

export async function disconnectGoogleDrive() {
  const token = await getStoredDriveToken();
  if (token?.refreshToken) {
    try {
      await revokeAsync({
        token: token.refreshToken,
        clientId: getGoogleClientId(),
      }, GOOGLE_DISCOVERY);
    } catch (_) {
      // Ignore revoke failures; local disconnect still succeeds.
    }
  }
  await clearStoredDriveToken();
}

export async function uploadSnapshotToDrive(record, container, options = {}) {
  const token = await getStoredDriveToken();
  const mode = token?.driveMode || (token?.driveFolderId ? DRIVE_MODE_FOLDER : DRIVE_MODE_APPDATA);
  let folderId = token?.driveFolderId || null;
  let folderName = token?.driveFolderName || DEFAULT_DRIVE_FOLDER_NAME;
  if (mode === DRIVE_MODE_FOLDER && !folderId) {
    const selected = await setDriveBackupFolder(folderName);
    folderId = selected.id;
    folderName = selected.name;
  }

  const metadata = {
    name: `${record.snapshotId}.ironlog.json`,
    ...(mode === DRIVE_MODE_FOLDER ? { parents: [folderId] } : { parents: ['appDataFolder'] }),
    mimeType: 'application/json',
    appProperties: {
      snapshotId: record.snapshotId,
      createdAt: record.createdAt,
      isRollback: record.isRollback ? '1' : '0',
      dataHash: record.dataHash || '',
    },
  };
  const boundary = `ironlog-boundary-${Date.now()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(container),
    `--${boundary}--`,
  ].join('\r\n');

  const response = await authorizedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,parents', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const uploaded = await response.json();
  if (options.retentionCount) {
    await pruneRemoteBackups(options.retentionCount);
  }
  return {
    driveFileId: uploaded.id,
    remoteFileId: uploaded.id,
    remote: true,
    syncedAt: new Date().toISOString(),
    driveFolderId: folderId,
    driveFolderName: folderName,
    driveMode: mode,
  };
}

export async function listDriveSnapshots() {
  const token = await getStoredDriveToken();
  const mode = token?.driveMode || (token?.driveFolderId ? DRIVE_MODE_FOLDER : DRIVE_MODE_APPDATA);
  let response;
  if (mode === DRIVE_MODE_FOLDER) {
    const folderId = token?.driveFolderId;
    if (!folderId) return [];
    const q = encodeURIComponent(`trashed=false and '${escapeDriveQueryLiteral(folderId)}' in parents`);
    response = await authorizedFetch(
      `https://www.googleapis.com/drive/v3/files?fields=files(id,name,createdTime,appProperties,parents)&q=${q}`
    );
  } else {
    response = await authorizedFetch(
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,createdTime,appProperties)&q=trashed=false"
    );
  }
  const payload = await response.json();
  return (payload.files || [])
    .map((file) => ({
      snapshotId: file.appProperties?.snapshotId || file.id,
      createdAt: file.appProperties?.createdAt || file.createdTime,
      driveFileId: file.id,
      remoteFileId: file.id,
      source: 'drive',
      local: false,
      remote: true,
      isRollback: file.appProperties?.isRollback === '1',
      dataHash: file.appProperties?.dataHash || null,
      localUri: null,
      driveFolderId: token?.driveFolderId || null,
      driveFolderName: token?.driveFolderName || null,
      driveMode: mode,
    }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function downloadDriveSnapshot(fileId) {
  const response = await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return response.json();
}
