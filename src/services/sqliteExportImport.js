import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTrainingSnapshot, replaceTrainingSnapshot } from '../domain/storage/trainingRepository';

export const SQLITE_EXPORT_SCHEMA = 'IRONLOG_SQLITE_EXPORT_V1';

const LEGACY_MIRROR_KEYS = {
  plans: 'ironlog_plans',
  history: 'ironlog_history',
  bodyWeight: 'ironlog_bw',
  bodyMeasurements: '@ironlog/bodyMeasurements',
  customExercises: '@ironlog/customExercises',
};

const SQLITE_APP_STATE_KEYS = [
  'ironlog_settings',
  'ironlog_pb',
  'ironlog_notes',
  '@ironlog/gymProfiles',
  '@ironlog/activeGymProfileId',
  '@ironlog/onboardingComplete',
  '@ironlog/manualRecoveryInput',
  '@ironlog/milestoneUnlocks',
  '@ironlog/backupConfig',
  '@ironlog/backupStatus',
  '@ironlog/notificationSettings',
];

function countRows(payload = {}) {
  return {
    plans: Array.isArray(payload.plans) ? payload.plans.length : 0,
    history: Array.isArray(payload.history) ? payload.history.length : 0,
    bodyWeight: Array.isArray(payload.bodyWeight) ? payload.bodyWeight.length : 0,
    bodyMeasurements: Array.isArray(payload.bodyMeasurements) ? payload.bodyMeasurements.length : 0,
    customExercises: Array.isArray(payload.customExercises) ? payload.customExercises.length : 0,
  };
}

function parseMaybeJson(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

export async function buildSQLiteExportBundle() {
  const snapshot = await loadTrainingSnapshot();
  const appStatePairs = await AsyncStorage.multiGet(SQLITE_APP_STATE_KEYS);
  const appState = Object.fromEntries(
    appStatePairs
      .filter(([key, raw]) => key && raw != null)
      .map(([key, raw]) => [key, parseMaybeJson(raw)])
  );
  return {
    schema: SQLITE_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version || '1.1.0',
    payload: snapshot,
    appState,
    counts: countRows(snapshot),
  };
}

export async function exportSQLiteBundleAndShare() {
  const bundle = await buildSQLiteExportBundle();
  const filePath = `${FileSystem.cacheDirectory}ironlog_sqlite_export_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(bundle, null, 2), { encoding: 'utf8' });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(filePath, {
    mimeType: 'application/json',
    dialogTitle: 'Export IRONLOG SQLite Data',
  });
  return bundle;
}

export async function pickSQLiteBundleFile() {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: 'utf8' });
  return JSON.parse(raw);
}

export function validateSQLiteBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, reason: 'Bundle is empty or malformed.' };
  }
  if (bundle.schema !== SQLITE_EXPORT_SCHEMA) {
    return { valid: false, reason: 'Unsupported export schema.' };
  }
  if (!bundle.payload || typeof bundle.payload !== 'object') {
    return { valid: false, reason: 'Missing export payload.' };
  }
  if (bundle.appState != null && typeof bundle.appState !== 'object') {
    return { valid: false, reason: 'Invalid app state block.' };
  }
  return {
    valid: true,
    counts: bundle.counts || countRows(bundle.payload),
    appStateKeys: bundle.appState ? Object.keys(bundle.appState).length : 0,
    exportedAt: bundle.exportedAt || null,
    appVersion: bundle.appVersion || null,
  };
}

export async function importSQLiteBundle(bundle, { mirrorLegacy = true } = {}) {
  const validation = validateSQLiteBundle(bundle);
  if (!validation.valid) throw new Error(validation.reason || 'Invalid SQLite export bundle.');

  const payload = bundle.payload || {};
  await replaceTrainingSnapshot({
    plans: payload.plans || [],
    history: payload.history || [],
    bodyWeight: payload.bodyWeight || [],
    bodyMeasurements: payload.bodyMeasurements || [],
    customExercises: payload.customExercises || [],
  });

  if (mirrorLegacy) {
    const pairs = [
      [LEGACY_MIRROR_KEYS.plans, JSON.stringify(payload.plans || [])],
      [LEGACY_MIRROR_KEYS.history, JSON.stringify(payload.history || [])],
      [LEGACY_MIRROR_KEYS.bodyWeight, JSON.stringify(payload.bodyWeight || [])],
      [LEGACY_MIRROR_KEYS.bodyMeasurements, JSON.stringify(payload.bodyMeasurements || [])],
      [LEGACY_MIRROR_KEYS.customExercises, JSON.stringify(payload.customExercises || [])],
    ];
    await AsyncStorage.multiSet(pairs);
  }

  if (bundle.appState && typeof bundle.appState === 'object') {
    const statePairs = Object.entries(bundle.appState)
      .filter(([key]) => SQLITE_APP_STATE_KEYS.includes(key))
      .map(([key, value]) => [key, JSON.stringify(value)]);
    if (statePairs.length) {
      await AsyncStorage.multiSet(statePairs);
    }
  }

  return validation;
}
