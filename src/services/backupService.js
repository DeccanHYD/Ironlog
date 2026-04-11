import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {
  ACTIVE_WORKOUT_SESSION_PREFIX,
  BACKUP_CONFIG_KEY,
  BACKUP_DEVICE_ID_KEY,
  BACKUP_INDEX_KEY,
  BACKUP_KEY_MATERIAL_SECURE_KEY,
  BACKUP_LOCAL_DIR_NAME,
  BACKUP_MANAGED_KEYS,
  BACKUP_NOTIFICATION_SETTINGS_KEY,
  BACKUP_QUEUE_KEY,
  BACKUP_RESTOREABLE_DOMAINS,
  BACKUP_STATUS_KEY,
  CURRENT_BACKUP_FORMAT,
  CURRENT_BACKUP_SCHEMA_VERSION,
  DEFAULT_BACKUP_CONFIG,
  DEFAULT_BACKUP_STATUS,
  DEFAULT_NOTIFICATION_SETTINGS,
} from './backupConstants';
import {
  decryptJsonPayload,
  deriveBackupKey,
  encryptJsonPayload,
  fingerprintKey,
  fromBase64,
  randomBytes,
  sha256Hex,
  toBase64,
} from './backupCrypto';
import { downloadDriveSnapshot, isDriveBackupAvailable, listDriveSnapshots, uploadSnapshotToDrive } from './googleDriveService';

const SNAPSHOT_EXTENSION = '.ironlog';
const BACKUP_AAD = 'IRONLOG_LOCAL_BACKUP';

function parseStoredValue(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function inferCountFromRaw(raw) {
  const parsed = parseStoredValue(raw);
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
  return parsed == null ? 0 : 1;
}

function summarizeDomainItems(items) {
  return Object.values(items || {}).reduce((total, rawValue) => total + inferCountFromRaw(rawValue), 0);
}

function normalizeSnapshotRecord(record) {
  return {
    source: 'local',
    local: true,
    remote: false,
    ...record,
  };
}

async function readJsonStorage(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function writeJsonStorage(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}

function getDocumentDirectory() {
  return FileSystem.documentDirectory || '';
}

function getBackupDirectory() {
  return `${getDocumentDirectory()}${BACKUP_LOCAL_DIR_NAME}/`;
}

async function ensureBackupDirectory() {
  const dir = getBackupDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function prepareLocalBackupStorage() {
  return ensureBackupDirectory();
}

async function loadBackupIndex() {
  const index = await readJsonStorage(BACKUP_INDEX_KEY, []);
  return Array.isArray(index) ? index.map(normalizeSnapshotRecord) : [];
}

async function saveBackupIndex(index) {
  const normalized = (Array.isArray(index) ? index : [])
    .map((record) => ({
      ...record,
      source: record.source || (record.remote ? 'drive' : 'local'),
      local: record.local !== false,
      remote: !!record.remote,
    }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return writeJsonStorage(BACKUP_INDEX_KEY, normalized);
}

export async function loadBackupConfig() {
  return {
    ...DEFAULT_BACKUP_CONFIG,
    ...(await readJsonStorage(BACKUP_CONFIG_KEY, {})),
  };
}

export async function saveBackupConfig(nextConfig) {
  const merged = {
    ...DEFAULT_BACKUP_CONFIG,
    ...(await readJsonStorage(BACKUP_CONFIG_KEY, {})),
    ...(nextConfig || {}),
  };
  await writeJsonStorage(BACKUP_CONFIG_KEY, merged);
  return merged;
}

export async function loadBackupStatus() {
  return {
    ...DEFAULT_BACKUP_STATUS,
    ...(await readJsonStorage(BACKUP_STATUS_KEY, {})),
  };
}

export async function saveBackupStatus(nextStatus) {
  const merged = {
    ...DEFAULT_BACKUP_STATUS,
    ...(await readJsonStorage(BACKUP_STATUS_KEY, {})),
    ...(nextStatus || {}),
  };
  await writeJsonStorage(BACKUP_STATUS_KEY, merged);
  return merged;
}

export async function updateBackupStatus(patch) {
  return saveBackupStatus(patch);
}

export async function loadNotificationSettings() {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(await readJsonStorage(BACKUP_NOTIFICATION_SETTINGS_KEY, {})),
  };
}

export async function saveNotificationSettings(nextSettings) {
  const merged = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(await readJsonStorage(BACKUP_NOTIFICATION_SETTINGS_KEY, {})),
    ...(nextSettings || {}),
  };
  await writeJsonStorage(BACKUP_NOTIFICATION_SETTINGS_KEY, merged);
  return merged;
}

export async function getOrCreateDeviceId() {
  const existing = await AsyncStorage.getItem(BACKUP_DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = Crypto.randomUUID();
  await AsyncStorage.setItem(BACKUP_DEVICE_ID_KEY, generated);
  return generated;
}

export async function getManagedStorageMap() {
  const dynamicKeys = (await AsyncStorage.getAllKeys())
    .filter((key) => key.startsWith(ACTIVE_WORKOUT_SESSION_PREFIX))
    .sort();
  const staticKeys = Object.values(BACKUP_MANAGED_KEYS).flat();
  const keys = [...new Set([...staticKeys, ...dynamicKeys])];
  const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
  return Object.fromEntries(pairs.filter(([key, raw]) => key && raw != null));
}

function buildDomainsFromStorage(storageMap) {
  const domains = {};
  Object.entries(BACKUP_MANAGED_KEYS).forEach(([domainId, keys]) => {
    const items = {};
    keys.forEach((key) => {
      if (storageMap[key] != null) items[key] = storageMap[key];
    });
    if (Object.keys(items).length) domains[domainId] = { items };
  });
  const sessionKeys = Object.keys(storageMap).filter((key) => key.startsWith(ACTIVE_WORKOUT_SESSION_PREFIX));
  if (sessionKeys.length) {
    const items = {};
    sessionKeys.forEach((key) => {
      items[key] = storageMap[key];
    });
    domains.sessionRecovery = { items };
  }
  return domains;
}

function buildRecordCounts(domains) {
  const recordCounts = {};
  Object.entries(domains || {}).forEach(([domainId, domain]) => {
    recordCounts[domainId] = summarizeDomainItems(domain.items || {});
  });
  recordCounts.total = Object.values(recordCounts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return recordCounts;
}

export async function getCurrentBackupPreview() {
  const storageMap = await getManagedStorageMap();
  const domains = buildDomainsFromStorage(storageMap);
  const includedDomains = Object.keys(domains);
  const recordCounts = buildRecordCounts(domains);
  const payload = {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    includedDomains,
    domains,
  };
  const dataHash = await sha256Hex(stableStringify(payload));
  return {
    includedDomains,
    recordCounts,
    dataHash,
    excludesMedia: true,
    photoBackupsIncluded: false,
  };
}

async function loadKeyMaterial() {
  const raw = await SecureStore.getItemAsync(BACKUP_KEY_MATERIAL_SECURE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function saveKeyMaterial(value) {
  await SecureStore.setItemAsync(BACKUP_KEY_MATERIAL_SECURE_KEY, JSON.stringify(value));
}

export async function isBackupPassphraseConfigured() {
  const config = await loadBackupConfig();
  return !!config.passphraseConfigured;
}

export async function configureBackupPassphrase(passphrase, overrides = {}) {
  if (!String(passphrase || '').trim()) {
    throw new Error('Passphrase cannot be empty.');
  }
  const saltBytes = await randomBytes(16);
  const keyBytes = await deriveBackupKey(passphrase, saltBytes);
  const keyFingerprint = await fingerprintKey(keyBytes);
  await saveKeyMaterial({
    version: 1,
    key: toBase64(keyBytes),
    salt: toBase64(saltBytes),
    keyFingerprint,
  });
  const config = await saveBackupConfig({
    ...overrides,
    enabled: true,
    passphraseConfigured: true,
    passphraseSalt: toBase64(saltBytes),
    keyFingerprint,
  });
  await saveBackupStatus({ enabled: true });
  return { config, keyFingerprint };
}

export async function verifyBackupPassphrase(passphrase) {
  const config = await loadBackupConfig();
  if (!config.passphraseConfigured || !config.passphraseSalt || !config.keyFingerprint) {
    return false;
  }
  const keyBytes = await deriveBackupKey(passphrase, fromBase64(config.passphraseSalt));
  const fingerprint = await fingerprintKey(keyBytes);
  return fingerprint === config.keyFingerprint;
}

export async function clearBackupPassphrase() {
  await SecureStore.deleteItemAsync(BACKUP_KEY_MATERIAL_SECURE_KEY);
  const config = await saveBackupConfig({
    enabled: false,
    passphraseConfigured: false,
    passphraseSalt: null,
    keyFingerprint: null,
  });
  await saveBackupStatus({ enabled: false, driveLinked: false });
  return config;
}

async function resolveEncryptionBundle(passphrase) {
  if (passphrase) {
    const config = await loadBackupConfig();
    const saltBytes = config.passphraseSalt ? fromBase64(config.passphraseSalt) : await randomBytes(16);
    const keyBytes = await deriveBackupKey(passphrase, saltBytes);
    const keyFingerprint = await fingerprintKey(keyBytes);
    return { keyBytes, saltBytes, keyFingerprint };
  }

  const material = await loadKeyMaterial();
  if (!material?.key || !material?.salt) {
    throw new Error('Backup passphrase is not configured yet.');
  }
  return {
    keyBytes: fromBase64(material.key),
    saltBytes: fromBase64(material.salt),
    keyFingerprint: material.keyFingerprint || null,
  };
}

function snapshotFileName(snapshotId) {
  return `${snapshotId}${SNAPSHOT_EXTENSION}`;
}

async function pruneLocalSnapshots(index, config) {
  const keepLocal = Number(config.localRetentionCount || 8);
  const keepRollbacks = Math.min(3, keepLocal);
  const normal = index.filter((record) => !record.isRollback && record.local !== false);
  const rollback = index.filter((record) => record.isRollback && record.local !== false);
  const removable = [
    ...normal.slice(keepLocal),
    ...rollback.slice(keepRollbacks),
  ];
  if (removable.length) {
    await Promise.all(removable.map(async (record) => {
      if (record.localUri) {
        try {
          await FileSystem.deleteAsync(record.localUri, { idempotent: true });
        } catch (_) {
          // Ignore failed cleanup.
        }
      }
    }));
  }
  const removableIds = new Set(removable.map((record) => record.snapshotId));
  return index.filter((record) => !removableIds.has(record.snapshotId));
}

async function persistSnapshotRecord(record, container) {
  const directory = await ensureBackupDirectory();
  const localUri = `${directory}${snapshotFileName(record.snapshotId)}`;
  await FileSystem.writeAsStringAsync(localUri, JSON.stringify(container), { encoding: 'utf8' });
  const nextRecord = normalizeSnapshotRecord({ ...record, localUri });
  const config = await loadBackupConfig();
  const currentIndex = await loadBackupIndex();
  const updatedIndex = [nextRecord, ...currentIndex.filter((entry) => entry.snapshotId !== nextRecord.snapshotId)];
  const pruned = await pruneLocalSnapshots(updatedIndex, config);
  await saveBackupIndex(pruned);
  await saveBackupStatus({
    lastBackupAt: nextRecord.createdAt,
    lastBackupResult: 'success',
    lastFailure: null,
    rollingVersionCount: pruned.filter((entry) => !entry.isRollback).length,
    lastSnapshotId: nextRecord.snapshotId,
    dirty: false,
    lastDataHash: nextRecord.dataHash,
    enabled: true,
  });
  return nextRecord;
}

export async function listLocalSnapshots(options = {}) {
  const includeRollbacks = options.includeRollbacks !== false;
  const index = await loadBackupIndex();
  return index.filter((record) => includeRollbacks || !record.isRollback);
}

export async function readSnapshotContainer(source) {
  const uri = typeof source === 'string' ? source : source?.localUri || source?.uri;
  if (!uri) throw new Error('No backup file selected.');
  const raw = await FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  if (parsed?.format !== CURRENT_BACKUP_FORMAT || !parsed?.manifest || !parsed?.ciphertext) {
    throw new Error('Invalid IronLog encrypted backup file.');
  }
  return parsed;
}

async function createPayloadFromStorage({ reason, isRollback = false, restoreSourceSnapshotId = null }) {
  const storageMap = await getManagedStorageMap();
  const domains = buildDomainsFromStorage(storageMap);
  const includedDomains = Object.keys(domains);
  const recordCounts = buildRecordCounts(domains);
  const createdAt = new Date().toISOString();
  const deviceId = await getOrCreateDeviceId();
  const appVersion = Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || '1.0.0';
  const payload = {
    format: CURRENT_BACKUP_FORMAT,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAt,
    appVersion,
    deviceId,
    reason,
    isRollback,
    restoreSourceSnapshotId,
    includedDomains,
    recordCounts,
    domains,
  };
  const dataHash = await sha256Hex(stableStringify(payload.domains));
  return { payload, recordCounts, includedDomains, createdAt, deviceId, appVersion, dataHash };
}

async function buildSnapshotContainer({ reason, isRollback = false, restoreSourceSnapshotId = null, passphrase = null }) {
  const { payload, recordCounts, includedDomains, createdAt, deviceId, appVersion, dataHash } = await createPayloadFromStorage({
    reason,
    isRollback,
    restoreSourceSnapshotId,
  });
  const { keyBytes, saltBytes } = await resolveEncryptionBundle(passphrase);
  const encrypted = await encryptJsonPayload(payload, {
    keyBytes,
    saltBytes,
    aad: BACKUP_AAD,
  });
  const snapshotId = `snapshot_${createdAt.replace(/[:.]/g, '-')}_${Crypto.randomUUID()}`;
  const manifest = {
    snapshotId,
    createdAt,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appVersion,
    deviceId,
    payloadChecksum: encrypted.payloadChecksum,
    cipherAlgorithm: 'AES-256-GCM',
    salt: encrypted.salt,
    nonce: encrypted.nonce,
    recordCounts,
    includedDomains,
    driveFileId: null,
    isRollback,
    restoreSourceSnapshotId,
    dataHash,
    reason,
    byteLength: encrypted.byteLength,
  };
  return {
    record: normalizeSnapshotRecord({
      ...manifest,
      source: 'local',
      remote: false,
      local: true,
    }),
    container: {
      format: CURRENT_BACKUP_FORMAT,
      manifest,
      ciphertext: encrypted.ciphertext,
    },
  };
}

export async function createRollbackSnapshot(options = {}) {
  const { record, container } = await buildSnapshotContainer({
    reason: 'rollback_before_restore',
    isRollback: true,
    restoreSourceSnapshotId: options.restoreSourceSnapshotId || null,
    passphrase: options.passphrase || null,
  });
  return persistSnapshotRecord(record, container);
}

export async function queueBackup(reason) {
  const queued = {
    reason,
    queuedAt: new Date().toISOString(),
  };
  await writeJsonStorage(BACKUP_QUEUE_KEY, queued);
  await saveBackupStatus({ queuedReason: reason });
  return queued;
}

export async function clearQueuedBackup() {
  await AsyncStorage.removeItem(BACKUP_QUEUE_KEY);
  await saveBackupStatus({ queuedReason: null });
}

export async function getQueuedBackup() {
  return readJsonStorage(BACKUP_QUEUE_KEY, null);
}

export async function markBackupDirty(reason = 'data_changed') {
  const preview = await getCurrentBackupPreview();
  await saveBackupStatus({
    dirty: true,
    queuedReason: reason,
    lastFailure: null,
    enabled: (await loadBackupConfig()).enabled,
    lastDataHash: preview.dataHash,
  });
  return preview;
}

export async function setBackupDirtyFlag(reason = 'data_changed') {
  return saveBackupStatus({
    dirty: true,
    queuedReason: reason,
    enabled: (await loadBackupConfig()).enabled,
  });
}

export async function validateBackupContainer(container, passphrase) {
  const decrypted = await decryptJsonPayload({
    salt: container.manifest.salt,
    nonce: container.manifest.nonce,
    ciphertext: container.ciphertext,
  }, {
    passphrase,
    aad: BACKUP_AAD,
  });
  return {
    valid: decrypted.payloadChecksum === container.manifest.payloadChecksum,
    payload: decrypted.payload,
    payloadChecksum: decrypted.payloadChecksum,
  };
}

export async function buildRestorePreview(source, passphrase = null) {
  const container = typeof source?.manifest === 'object' ? source : await readSnapshotContainer(source);
  const preview = {
    snapshotId: container.manifest.snapshotId,
    createdAt: container.manifest.createdAt,
    schemaVersion: container.manifest.schemaVersion,
    appVersion: container.manifest.appVersion,
    checksumValid: null,
    recordCounts: container.manifest.recordCounts || {},
    warnings: [],
    duplicateRisk: 'low',
    conflictSummary: null,
    canRestore: false,
    includedDomains: container.manifest.includedDomains || [],
    deviceId: container.manifest.deviceId || null,
    isRollback: !!container.manifest.isRollback,
  };

  const status = await loadBackupStatus();
  if (status.lastBackupAt && String(status.lastBackupAt) > String(container.manifest.createdAt || '')) {
    preview.warnings.push('This backup is older than your latest local snapshot.');
    preview.duplicateRisk = 'medium';
  }

  const currentDeviceId = await getOrCreateDeviceId();
  preview.conflictSummary = currentDeviceId === container.manifest.deviceId
    ? 'Created on this device'
    : 'Created on another device';

  if (passphrase) {
    const validated = await validateBackupContainer(container, passphrase);
    preview.checksumValid = validated.valid;
    preview.canRestore = validated.valid;
    if (!validated.valid) {
      preview.warnings.push('Checksum validation failed. Do not restore this snapshot.');
    }
  }

  return preview;
}

function keysForDomains(domains, currentStorageMap) {
  const keys = new Set();
  domains.forEach((domainId) => {
    (BACKUP_MANAGED_KEYS[domainId] || []).forEach((key) => keys.add(key));
    if (domainId === 'sessionRecovery') {
      Object.keys(currentStorageMap || {}).forEach((key) => {
        if (key.startsWith(ACTIVE_WORKOUT_SESSION_PREFIX)) keys.add(key);
      });
    }
  });
  return [...keys];
}

export async function restoreBackupContainer(source, options = {}) {
  const container = typeof source?.manifest === 'object' ? source : await readSnapshotContainer(source);
  const passphrase = options.passphrase;
  if (!passphrase) throw new Error('Passphrase is required to restore this backup.');

  const validated = await validateBackupContainer(container, passphrase);
  if (!validated.valid) {
    throw new Error('Backup integrity validation failed.');
  }

  const allDomainIds = container.manifest.includedDomains || Object.keys(validated.payload.domains || {});
  const selectedDomains = (options.selectedDomains?.length ? options.selectedDomains : allDomainIds)
    .filter((domainId) => allDomainIds.includes(domainId));

  if (options.createRollback !== false) {
    await createRollbackSnapshot({
      passphrase,
      restoreSourceSnapshotId: container.manifest.snapshotId,
    });
  }

  const currentStorageMap = await getManagedStorageMap();
  const removalKeys = keysForDomains(selectedDomains, currentStorageMap);
  if (removalKeys.length) {
    await AsyncStorage.multiRemove(removalKeys);
  }

  const nextPairs = [];
  selectedDomains.forEach((domainId) => {
    const items = validated.payload.domains?.[domainId]?.items || {};
    Object.entries(items).forEach(([key, rawValue]) => {
      if (rawValue != null) nextPairs.push([key, rawValue]);
    });
  });
  if (nextPairs.length) {
    await AsyncStorage.multiSet(nextPairs);
  }

  await saveBackupStatus({
    lastRestoreAt: new Date().toISOString(),
    lastRestoreResult: 'success',
    lastFailure: null,
  });

  return {
    restoredDomains: selectedDomains,
    snapshotId: container.manifest.snapshotId,
    rollbackCreated: options.createRollback !== false,
  };
}

export async function shareBackupRecord(record) {
  if (!record?.localUri) throw new Error('Local snapshot file is missing.');
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(record.localUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export IRONLOG Encrypted Backup',
  });
  return record.localUri;
}

export async function pickImportedBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

export async function exportPreviewAndShareLatest(options = {}) {
  const record = await runBackupNow({ reason: 'manual_export', syncToDrive: false, passphrase: options.passphrase || null });
  await shareBackupRecord(record);
  return record;
}

export async function runBackupNow(options = {}) {
  const reason = options.reason || 'manual';
  const syncToDrive = options.syncToDrive !== false;
  await queueBackup(reason);
  const config = await loadBackupConfig();
  if (!config.passphraseConfigured && !options.passphrase) {
    throw new Error('Set a backup passphrase before creating encrypted backups.');
  }

  const preview = await getCurrentBackupPreview();
  const status = await loadBackupStatus();
  if (reason !== 'manual' && reason !== 'manual_export' && !status.dirty && preview.dataHash === status.lastDataHash) {
    await clearQueuedBackup();
    return null;
  }

  const { record, container } = await buildSnapshotContainer({
    reason,
    passphrase: options.passphrase || null,
  });
  const persisted = await persistSnapshotRecord(record, container);

  if (syncToDrive && config.driveEnabled && config.enabled && (await isDriveBackupAvailable())) {
    try {
      const remoteRecord = await uploadSnapshotToDrive(persisted, container, { retentionCount: config.retentionCount || 5 });
      const index = await loadBackupIndex();
      const nextIndex = index.map((entry) => entry.snapshotId === persisted.snapshotId ? { ...entry, ...remoteRecord, remote: true } : entry);
      await saveBackupIndex(nextIndex);
      await saveBackupStatus({
        driveLinked: true,
        lastSyncedAt: remoteRecord.syncedAt || new Date().toISOString(),
        rollingVersionCount: nextIndex.filter((entry) => !entry.isRollback).length,
      });
      await clearQueuedBackup();
      return { ...persisted, ...remoteRecord, remote: true };
    } catch (error) {
      await saveBackupStatus({
        lastFailure: `Drive sync failed: ${error.message || error}`,
        lastBackupResult: 'local_only',
      });
    }
  }

  await clearQueuedBackup();
  return persisted;
}

export async function restoreFromLocalSnapshot(record, options) {
  return restoreBackupContainer(await readSnapshotContainer(record), options);
}

export async function importBackupWithPreview(passphrase) {
  const picked = await pickImportedBackupFile();
  if (!picked) return null;
  const container = await readSnapshotContainer(picked.uri);
  const preview = await buildRestorePreview(container, passphrase || null);
  return {
    file: picked,
    container,
    preview,
  };
}

export async function validateLatestBackup(passphrase) {
  const latest = (await listLocalSnapshots({ includeRollbacks: false }))[0];
  if (!latest) return { valid: false, reason: 'No local backups found.' };
  const container = await readSnapshotContainer(latest);
  const preview = await buildRestorePreview(container, passphrase || null);
  return {
    valid: preview.checksumValid !== false,
    preview,
  };
}

export async function refreshBackupHistory() {
  const local = await listLocalSnapshots({ includeRollbacks: true });
  if (await isDriveBackupAvailable()) {
    try {
      const remote = await listDriveSnapshots();
      const localIds = new Set(local.map((record) => record.snapshotId));
      return [
        ...local,
        ...remote.filter((record) => !localIds.has(record.snapshotId)),
      ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    } catch (_) {
      return local;
    }
  }
  return local;
}

export async function fetchRemoteSnapshot(record) {
  if (!record?.remoteFileId && !record?.driveFileId) {
    throw new Error('Remote snapshot identifier is missing.');
  }
  return downloadDriveSnapshot(record.remoteFileId || record.driveFileId);
}

export { BACKUP_RESTOREABLE_DOMAINS };
