
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildExerciseMap } from '../domain/intelligence/muscleContributionEngine';
import { EXERCISES } from '../data/exerciseLibrary';
import { setHapticsEnabled } from '../services/hapticsEngine';
import {
  buildWeeklySummary,
  computeStreaks,
  evaluateMilestones,
} from '../domain/intelligence/engagementEngine';
import { computeConsistencyMetrics } from '../domain/intelligence/performanceEngine';
import { buildReadinessSuggestions } from '../domain/intelligence/recoveryReadinessEngine';
import {
  buildDefaultNotificationCandidates,
  scheduleSmartNotification,
} from '../services/notificationScheduler';
import {
  configureBackupPassphrase,
  createRollbackSnapshot,
  loadBackupConfig,
  loadBackupStatus,
  loadNotificationSettings,
  queueBackup,
  runBackupNow,
  saveBackupConfig,
  saveNotificationSettings,
  setBackupDirtyFlag,
} from '../services/backupService';
import { DEFAULT_BACKUP_CONFIG, DEFAULT_BACKUP_STATUS, DEFAULT_NOTIFICATION_SETTINGS } from '../services/backupConstants';
import {
  clearDriveOAuthClientId,
  connectGoogleDrive,
  disconnectGoogleDrive,
  getDriveConnectionStatus,
  hydrateDriveOAuthConfig,
  saveDriveOAuthClientId,
  setDriveBackupFolder,
  setDriveSyncMode,
} from '../services/googleDriveService';
import { cancelBackupJob, scheduleBackupJob } from '../services/BackupScheduler';
import {
  SQLITE_MIGRATION_MARKER_KEY,
} from '../domain/storage/trainingDatabase';
import {
  addHistorySessionToDb,
  clearHistoryInDb,
  loadTrainingSnapshot,
  migrateLegacyAsyncStorageToSQLite,
  replaceTrainingSnapshot,
  saveBodyWeightToDb,
  savePlansToDb,
} from '../domain/storage/trainingRepository';
import { getExerciseIndex } from '../services/ExerciseLibraryService';

function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function normalizeMuscleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '_');
}

function resolveSessionPrimaryMuscle(exercise) {
  const values = [];
  if (Array.isArray(exercise?.primaryMuscles)) values.push(...exercise.primaryMuscles);
  else if (exercise?.primaryMuscles) values.push(exercise.primaryMuscles);
  if (exercise?.primaryMuscle) values.push(exercise.primaryMuscle);
  if (exercise?.primary) values.push(exercise.primary);
  if (exercise?.muscle) values.push(exercise.muscle);
  if (exercise?.target) values.push(exercise.target);
  if (exercise?.targetMuscle) values.push(exercise.targetMuscle);
  return values.find((value) => String(value || '').trim()) || 'other';
}

function hasEntryToday(list = [], field = 'date') {
  const today = new Date().toISOString().slice(0, 10);
  return (Array.isArray(list) ? list : []).some((item) => String(item?.[field] || '').slice(0, 10) === today);
}

async function buildIndexUpdatesForSession(session) {
  if (!session?.exercises || !session?.date) return null;
  const pairs = await AsyncStorage.multiGet([
    '@ironlog/pr_index', '@ironlog/volume_index', '@ironlog/lastPerformance',
  ]);
  const prIndex = pairs[0][1] ? JSON.parse(pairs[0][1]) : {};
  const volumeIndex = pairs[1][1] ? JSON.parse(pairs[1][1]) : {};
  const lastPerf = pairs[2][1] ? JSON.parse(pairs[2][1]) : {};

  const dateStr = session.date.split('T')[0];
  const weekKey = isoWeekKey(session.date);

  for (const ex of session.exercises) {
    if (!ex.name || !ex.sets) continue;
    const exId = ex.exerciseId || ex.name;
    const workingSets = ex.sets.filter(s => s.type !== 'warmup');

    lastPerf[exId] = {
      date: dateStr,
      workoutId: session.id,
      sets: workingSets.map(s => ({
        weight: s.weight, reps: s.reps,
        type: s.type || 'normal', rpe: s.rpe || null,
      })),
    };

    if (!session.isDeload) {
      const prSets = ex.sets.filter(s =>
        ['normal', 'failure', 'amrap'].includes(s.type || 'normal')
      );
      if (!prIndex[exId]) prIndex[exId] = [];
      for (const s of prSets) {
        if (!s.weight || !s.reps) continue;
        const e1rm = Math.round(s.weight * (1 + s.reps / 30) * 10) / 10;
        prIndex[exId].push({ date: dateStr, weight: s.weight, reps: s.reps, e1rm });
      }
      prIndex[exId].sort((a, b) => a.date.localeCompare(b.date));

      if (workingSets.length) {
        const muscle = resolveSessionPrimaryMuscle(ex);
        const normalized = normalizeMuscleKey(muscle);
        if (!volumeIndex[weekKey]) volumeIndex[weekKey] = {};
        volumeIndex[weekKey][normalized] = (volumeIndex[weekKey][normalized] || 0) + workingSets.length;
      }
    }
  }

  return [
    ['@ironlog/pr_index', JSON.stringify(prIndex)],
    ['@ironlog/volume_index', JSON.stringify(volumeIndex)],
    ['@ironlog/lastPerformance', JSON.stringify(lastPerf)],
  ];
}

const HEAVY = new Set([
  'Weighted Pull-Up', 'Weighted Pull-Up or Lat Pulldown',
  'Romanian Deadlift', 'Bulgarian Split Squat', 'DB Shrugs', 'Incline Smith Press',
  'Barbell Shrugs', 'Deadlift', 'Back Squat', 'Front Squat',
]);

export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

const DEFAULT_GYM_PROFILE = {
  id: 'default',
  name: 'Standard',
  barWeight: 20,
  plates: [20, 15, 10, 5, 2.5, 1.25].map(w => ({ weight: w, quantity: 2 })),
  isDefault: true,
};
const HAPTICS_RECOVERY_MIGRATION_KEY = '@ironlog/hapticsRecoveryMigrationV1';
const MANUAL_RECOVERY_INPUT_KEY = '@ironlog/manualRecoveryInput';
const MILESTONE_UNLOCKS_KEY = '@ironlog/milestoneUnlocks';

export function AppContextProvider({ children }) {
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [pb, setPb] = useState({});
  const [bodyWeight, setBodyWeight] = useState([]);
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [settings, setSettings] = useState({
    weightUnit: 'kg', defaultRestNormal: 120, defaultRestHeavy: 180, barWeight: 20,
    effortTracking: 'off', keepAwake: true, warmupScheme: 'standard', hapticFeedback: true,
    goalMode: 'hypertrophy',
    completedWorkoutCount: 0, lastRatePromptCount: 0, neverAskToRate: false,
  });
  const [gymProfiles, setGymProfiles] = useState([DEFAULT_GYM_PROFILE]);
  const [activeGymProfileId, setActiveGymProfileIdState] = useState('default');
  const [initialized, setInitialized] = useState(false);
  const [onboardingComplete, setOnboardingCompleteState] = useState(false);
  const [exerciseMap, setExerciseMap] = useState({});
  const [manualRecoveryInput, setManualRecoveryInput] = useState(null);
  const [milestoneUnlocks, setMilestoneUnlocks] = useState({});
  const [latestMilestones, setLatestMilestones] = useState([]);
  const [engagementSnapshot, setEngagementSnapshot] = useState({
    streaks: { training: { current: 0, longest: 0 }, logging: { current: 0, longest: 0 }, bodyweight: { current: 0, longest: 0 } },
    weeklySummary: null,
  });
   const [backupConfig, setBackupConfigState] = useState(DEFAULT_BACKUP_CONFIG);
   const [backupStatus, setBackupStatusState] = useState(DEFAULT_BACKUP_STATUS);
   const [notificationSettings, setNotificationSettingsState] = useState(DEFAULT_NOTIFICATION_SETTINGS);
   const appStateRef = useRef(AppState.currentState);

  useEffect(() => { init(); }, []);
  useEffect(() => {
    setHapticsEnabled(settings?.hapticFeedback !== false);
  }, [settings?.hapticFeedback]);

  const refreshBackupState = async () => {
    const [config, status, notifications, drive] = await Promise.all([
      loadBackupConfig(),
      loadBackupStatus(),
      loadNotificationSettings(),
      getDriveConnectionStatus(),
    ]);
    const nextStatus = {
      ...status,
      enabled: config.enabled,
      driveLinked: drive.linked,
      driveConfigured: drive.configured,
      driveEmail: drive.email || null,
      driveRedirectUri: drive.redirectUri || null,
      driveConfigMessage: drive.reason || null,
      driveFolderId: drive.folderId || null,
      driveFolderName: drive.folderName || null,
      driveMode: drive.mode || 'appdata',
    };
    setBackupConfigState(config);
    setBackupStatusState(nextStatus);
    setNotificationSettingsState(notifications);
    return { config, status: nextStatus, notifications };
  };

  const flagDirty = async (reason) => {
    setBackupStatusState((prev) => ({ ...prev, dirty: true, queuedReason: reason }));
    try {
      const nextStatus = await setBackupDirtyFlag(reason);
      setBackupStatusState(nextStatus);
    } catch (e) {
      console.warn('Backup dirty flag error:', e);
    }
  };

  const queueAutoBackup = async (reason, delayMs) => {
    try {
      const config = await loadBackupConfig();
      if (!config.enabled || !config.passphraseConfigured) return;
      await queueBackup(reason);
      const scheduled = await scheduleBackupJob(reason, delayMs);
      if (!scheduled) {
        await runBackupNow({ reason, syncToDrive: true });
      }
      await refreshBackupState();
    } catch (e) {
      console.warn('Auto backup scheduling failed:', e);
    }
  };

  const init = async () => {
    try {
      await hydrateDriveOAuthConfig().catch(() => '');
      const keys = [
        'ironlog_plans',
        'ironlog_history',
        'ironlog_pb',
        'ironlog_bw',
        'ironlog_notes',
        'ironlog_settings',
        '@ironlog/gymProfiles',
        '@ironlog/activeGymProfileId',
        '@ironlog/onboardingComplete',
        'ironlog_exerciseMap',
        HAPTICS_RECOVERY_MIGRATION_KEY,
        SQLITE_MIGRATION_MARKER_KEY,
        MANUAL_RECOVERY_INPUT_KEY,
        MILESTONE_UNLOCKS_KEY,
      ];
      const vals = await AsyncStorage.multiGet(keys);
      const map = Object.fromEntries(vals.map(([k, v]) => [k, v ? JSON.parse(v) : null]));
      if (map.ironlog_plans) setPlans(map.ironlog_plans);
      if (map.ironlog_history) setHistory(map.ironlog_history);
      if (map.ironlog_pb) setPb(map.ironlog_pb);
      if (map.ironlog_bw) setBodyWeight(map.ironlog_bw);
      if (map.ironlog_notes) setExerciseNotes(map.ironlog_notes);
      let loadedSettings = settings;
      if (map.ironlog_settings) {
        loadedSettings = { ...settings, ...map.ironlog_settings };
        setSettings(loadedSettings);
      }
      if (!map[HAPTICS_RECOVERY_MIGRATION_KEY]) {
        // One-time recovery: force haptics back on for affected installs.
        loadedSettings = { ...loadedSettings, hapticFeedback: true };
        setSettings(loadedSettings);
        await AsyncStorage.multiSet([
          ['ironlog_settings', JSON.stringify(loadedSettings)],
          [HAPTICS_RECOVERY_MIGRATION_KEY, JSON.stringify(true)],
        ]);
      }
      if (map['@ironlog/gymProfiles'] && map['@ironlog/gymProfiles'].length > 0) {
        setGymProfiles(map['@ironlog/gymProfiles']);
      } else {
        // Seed default using barWeight from settings
        const defaultProfile = { ...DEFAULT_GYM_PROFILE, barWeight: loadedSettings.barWeight || 20 };
        setGymProfiles([defaultProfile]);
        await AsyncStorage.setItem('@ironlog/gymProfiles', JSON.stringify([defaultProfile]));
      }
      if (map['@ironlog/activeGymProfileId']) {
        setActiveGymProfileIdState(map['@ironlog/activeGymProfileId']);
      }
      if (map['@ironlog/onboardingComplete']) {
        setOnboardingCompleteState(true);
      }
      if (map[MANUAL_RECOVERY_INPUT_KEY]) setManualRecoveryInput(map[MANUAL_RECOVERY_INPUT_KEY]);
      if (map[MILESTONE_UNLOCKS_KEY]) setMilestoneUnlocks(map[MILESTONE_UNLOCKS_KEY]);

      let sqliteMigrated = !!map[SQLITE_MIGRATION_MARKER_KEY];
      if (!sqliteMigrated) {
        try {
          sqliteMigrated = await migrateLegacyAsyncStorageToSQLite();
        } catch (migrationError) {
          // Keep legacy state active if migration fails; never wipe user data.
          console.warn('SQLite migration skipped:', migrationError);
          sqliteMigrated = false;
        }
      }

      if (sqliteMigrated) {
        const snapshot = await loadTrainingSnapshot();
        setPlans(snapshot.plans || []);
        setHistory(snapshot.history || []);
        setBodyWeight(snapshot.bodyWeight || []);
        if (!map[MILESTONE_UNLOCKS_KEY]) {
          const computed = evaluateMilestones({ history: snapshot.history || [], milestoneState: {} });
          setMilestoneUnlocks(computed.state);
          await AsyncStorage.setItem(MILESTONE_UNLOCKS_KEY, JSON.stringify(computed.state));
        }
      }

      const libraryIndex = await getExerciseIndex().catch(() => null);
      let emap = map.ironlog_exerciseMap;
      if (!emap || Object.keys(emap).length === 0 || sqliteMigrated) {
        emap = buildExerciseMap(libraryIndex || EXERCISES);
        await AsyncStorage.setItem('ironlog_exerciseMap', JSON.stringify(emap));
      }
      setExerciseMap(emap);
      await refreshBackupState();

    } catch (e) { console.warn('Init error:', e); }
    setInitialized(true);
  };

  useEffect(() => {
    const streaks = computeStreaks({ history, bodyWeight });
    const weeklySummary = buildWeeklySummary({ history, bodyWeight });
    setEngagementSnapshot({ streaks, weeklySummary });
  }, [history, bodyWeight]);

  useEffect(() => {
    if (!initialized || notificationSettings?.enabled !== true) return;
    const run = async () => {
      const consistency = computeConsistencyMetrics({ history, activePlan: plans?.[0], bodyWeight });
      const recoverySuggestions = manualRecoveryInput?.soreness >= 4
        ? ['Soreness is elevated today. Keep loading conservative and prioritize recovery.']
        : buildReadinessSuggestions({ readiness: {} });
      const candidates = buildDefaultNotificationCandidates({
        settings: notificationSettings,
        workoutsLast7d: consistency.workoutsLast7d,
        bodyweightLoggingConsistency: consistency.bodyweightLoggingConsistency,
        recoverySuggestions,
        streaks: engagementSnapshot.streaks,
        newMilestones: latestMilestones,
        history,
        bodyWeightEntries: bodyWeight,
        backupStatus,
        activePlan: plans?.[0] || null,
      });
      const chosen = await scheduleSmartNotification({
        settings: notificationSettings,
        activePlan: plans?.[0] || null,
        alreadyActionedTopics: [
          ...(hasEntryToday(history, 'date') ? ['training', 'streak'] : []),
          ...(hasEntryToday(bodyWeight, 'date') ? ['bodyweight'] : []),
        ],
        updateSettings: async (nextSettings) => {
          const next = await saveNotificationSettings(nextSettings);
          setNotificationSettingsState(next);
          return next;
        },
        candidates,
      });
      if (chosen && latestMilestones.length) setLatestMilestones([]);
    };
    run().catch(() => {});
  }, [initialized, history.length, bodyWeight.length, manualRecoveryInput, notificationSettings, plans, engagementSnapshot.streaks, latestMilestones, backupStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = /inactive|background/.test(appStateRef.current || '');
      const enteringBackground = /inactive|background/.test(nextState);
      if (enteringBackground) {
        if (backupStatus.dirty && backupConfig.enabled && backupConfig.autoBackupOnBackground && backupConfig.passphraseConfigured) {
          queueAutoBackup('app_background', 60000).catch((error) => console.warn('Background backup queue failed:', error));
        }
      }
      if (wasBackgrounded && nextState === 'active') {
        cancelBackupJob().catch(() => {});
        refreshBackupState().catch(() => {});
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [backupConfig.autoBackupOnBackground, backupConfig.enabled, backupConfig.passphraseConfigured, backupStatus.dirty]);

  const save = async (key, value, reason = 'data_changed') => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      if (reason) await flagDirty(reason);
    } catch (e) {
      console.warn(e);
    }
  };

  const savePlans = async (v) => {
    setPlans(v);
    try {
      await savePlansToDb(v);
    } catch (e) {
      console.warn('savePlans SQLite error:', e);
    }
    await save('ironlog_plans', v, 'plans_changed');
  };
  const addHistory = async (entry) => {
    const h = [entry, ...history].slice(0, 200);
    setHistory(h);
    const nextMilestones = evaluateMilestones({ history: h, milestoneState: milestoneUnlocks });
    setMilestoneUnlocks(nextMilestones.state);
    setLatestMilestones(nextMilestones.unlocked);
    try {
      await addHistorySessionToDb(entry);
      const indexPairs = await buildIndexUpdatesForSession(entry);
      const storageWrite = [['ironlog_history', JSON.stringify(h)], ...(indexPairs || [])];
      storageWrite.push([MILESTONE_UNLOCKS_KEY, JSON.stringify(nextMilestones.state)]);
      await AsyncStorage.multiSet(storageWrite);
      await flagDirty('workout_completion');
      if (backupConfig.enabled && backupConfig.autoBackupOnWorkoutCompletion && backupConfig.passphraseConfigured) {
        queueAutoBackup('workout_completion', 5000).catch((error) => console.warn('Workout backup queue failed:', error));
      }
    } catch (e) {
      console.warn('addHistory index error:', e);
      await save('ironlog_history', h, 'workout_completion');
    }
    return { unlockedMilestones: nextMilestones.unlocked };
  };
  const clearHistory = async () => {
    try {
      if (backupConfig.passphraseConfigured) {
        await createRollbackSnapshot();
      }
    } catch (e) {
      console.warn('Rollback snapshot before clearHistory failed:', e);
    }
    setHistory([]);
    try {
      await clearHistoryInDb();
    } catch (e) {
      console.warn('clearHistory SQLite error:', e);
    }
    await AsyncStorage.multiRemove(['ironlog_history', '@ironlog/pr_index', '@ironlog/volume_index', '@ironlog/lastPerformance']);
    await flagDirty('history_cleared');
  };
  const updatePb = async (key, val) => {
    const n = { ...pb, [key]: val }; setPb(n); await save('ironlog_pb', n, 'pb_changed');
  };
  const clearPbs = async () => { setPb({}); await AsyncStorage.removeItem('ironlog_pb'); await flagDirty('pb_cleared'); };
  const logBodyWeight = async (entry) => {
    const bw = [entry, ...bodyWeight].slice(0, 365);
    setBodyWeight(bw);
    try {
      await saveBodyWeightToDb(bw);
    } catch (e) {
      console.warn('saveBodyWeight SQLite error:', e);
    }
    await save('ironlog_bw', bw, 'body_weight_changed');
  };
  const saveExerciseNotes = async (exName, note) => {
    const n = { ...exerciseNotes, [exName]: note };
    setExerciseNotes(n); await save('ironlog_notes', n, 'notes_changed');
  };
  const updateSettings = async (s) => { setSettings(s); await save('ironlog_settings', s, 'settings_changed'); };
  const saveManualRecovery = async (entry) => {
    const payload = {
      soreness: Number(entry?.soreness || 0),
      sleepQuality: Number(entry?.sleepQuality || 0),
      energy: Number(entry?.energy || 0),
      notes: entry?.notes || '',
      recordedAt: entry?.recordedAt || new Date().toISOString(),
    };
    setManualRecoveryInput(payload);
    await AsyncStorage.setItem(MANUAL_RECOVERY_INPUT_KEY, JSON.stringify(payload));
    await flagDirty('manual_recovery_changed');
    return payload;
  };

  const completeOnboarding = async () => {
    setOnboardingCompleteState(true);
    try {
      await AsyncStorage.setItem('@ironlog/onboardingComplete', 'true');
      await flagDirty('onboarding_changed');
    } catch (e) { console.warn(e); }
  };
  const resetOnboarding = async () => {
    setOnboardingCompleteState(false);
    try {
      await AsyncStorage.removeItem('@ironlog/onboardingComplete');
      await flagDirty('onboarding_changed');
    } catch (e) { console.warn(e); }
  };

  const saveGymProfiles = async (profiles) => {
    setGymProfiles(profiles);
    try {
      await AsyncStorage.setItem('@ironlog/gymProfiles', JSON.stringify(profiles));
      await flagDirty('gym_profiles_changed');
    } catch (e) { console.warn(e); }
  };
  const setActiveGymProfileId = async (id) => {
    setActiveGymProfileIdState(id);
    try {
      await AsyncStorage.setItem('@ironlog/activeGymProfileId', JSON.stringify(id));
      await flagDirty('gym_profiles_changed');
    } catch (e) { console.warn(e); }
  };

  const reloadFromStorage = async () => {
    await init();
  };

  const getAllData = () => ({
    plans,
    history,
    pb,
    bodyWeight,
    exerciseNotes,
    settings,
    gymProfiles,
    activeGymProfileId,
    onboardingComplete,
    backupConfig,
    backupStatus,
    notificationSettings,
    manualRecoveryInput,
    milestoneUnlocks,
    engagementSnapshot,
  });

  const updateBackupPreferences = async (patch) => {
    const next = await saveBackupConfig({ ...backupConfig, ...(patch || {}) });
    setBackupConfigState(next);
    await refreshBackupState();
    return next;
  };

  const updateNotificationPreferences = async (patch) => {
    const next = await saveNotificationSettings({ ...notificationSettings, ...(patch || {}) });
    setNotificationSettingsState(next);
    await flagDirty('notification_settings_changed');
    return next;
  };

  const setupBackupPassphrase = async (passphrase) => {
    const result = await configureBackupPassphrase(passphrase, { ...backupConfig, enabled: true });
    await refreshBackupState();
    return result;
  };

  const unlinkDriveBackup = async () => {
    await disconnectGoogleDrive();
    await refreshBackupState();
  };

  const linkDriveBackup = async (options = {}) => {
    const result = await connectGoogleDrive(options);
    await refreshBackupState();
    return result;
  };

  const updateDriveBackupFolder = async (folderName) => {
    const result = await setDriveBackupFolder(folderName);
    await refreshBackupState();
    return result;
  };

  const updateDriveSyncMode = async (mode) => {
    const result = await setDriveSyncMode(mode);
    await refreshBackupState();
    return result;
  };

  const runManualBackup = async (options = {}) => {
    const result = await runBackupNow({ reason: 'manual', syncToDrive: true, ...options });
    await refreshBackupState();
    return result;
  };

  const saveDriveOAuthClient = async (clientId) => {
    await saveDriveOAuthClientId(clientId);
    await refreshBackupState();
  };

  const clearDriveOAuthClient = async () => {
    await clearDriveOAuthClientId();
    await refreshBackupState();
  };

  const restoreData = async (data) => {
    if (data.plans) { setPlans(data.plans); await save('ironlog_plans', data.plans); }
    if (data.history) { setHistory(data.history); await save('ironlog_history', data.history); }
    if (data.pb) { setPb(data.pb); await save('ironlog_pb', data.pb); }
    if (data.bodyWeight) { setBodyWeight(data.bodyWeight); await save('ironlog_bw', data.bodyWeight); }
    if (data.exerciseNotes) { setExerciseNotes(data.exerciseNotes); await save('ironlog_notes', data.exerciseNotes); }
    if (data.settings) { setSettings(data.settings); await save('ironlog_settings', data.settings); }
    if (data.manualRecoveryInput) {
      setManualRecoveryInput(data.manualRecoveryInput);
      await AsyncStorage.setItem(MANUAL_RECOVERY_INPUT_KEY, JSON.stringify(data.manualRecoveryInput));
    }
    if (data.milestoneUnlocks) {
      setMilestoneUnlocks(data.milestoneUnlocks);
      await AsyncStorage.setItem(MILESTONE_UNLOCKS_KEY, JSON.stringify(data.milestoneUnlocks));
    }
    if (data.gymProfiles?.length) {
      setGymProfiles(data.gymProfiles);
      await AsyncStorage.setItem('@ironlog/gymProfiles', JSON.stringify(data.gymProfiles));
    }
    if (data.activeGymProfileId) {
      setActiveGymProfileIdState(data.activeGymProfileId);
      await AsyncStorage.setItem('@ironlog/activeGymProfileId', JSON.stringify(data.activeGymProfileId));
    }
    if (typeof data.onboardingComplete === 'boolean') {
      setOnboardingCompleteState(data.onboardingComplete);
      if (data.onboardingComplete) await AsyncStorage.setItem('@ironlog/onboardingComplete', 'true');
      else await AsyncStorage.removeItem('@ironlog/onboardingComplete');
    }
    try {
      await replaceTrainingSnapshot({
        plans: data.plans || plans,
        history: data.history || history,
        bodyWeight: data.bodyWeight || bodyWeight,
        bodyMeasurements: data.bodyMeasurements || [],
        customExercises: data.customExercises || [],
      });
    } catch (e) {
      console.warn('restoreData SQLite error:', e);
    }
    await refreshBackupState();
  };

  const activeGymProfile = gymProfiles.find(p => p.id === activeGymProfileId) || gymProfiles[0] || DEFAULT_GYM_PROFILE;

  return (
    <AppContext.Provider value={{
      plans, history, pb, bodyWeight, exerciseNotes, settings, initialized,
      manualRecoveryInput, milestoneUnlocks, engagementSnapshot,
      onboardingComplete, completeOnboarding, resetOnboarding,
      gymProfiles, activeGymProfileId, activeGymProfile,
      exerciseMap, backupConfig, backupStatus, notificationSettings,
      savePlans, addHistory, clearHistory, updatePb, clearPbs,
      logBodyWeight, saveExerciseNotes, updateSettings,
      saveManualRecovery,
      saveGymProfiles, setActiveGymProfileId,
      getAllData, restoreData, reloadFromStorage,
      refreshBackupState, updateBackupPreferences, updateNotificationPreferences,
      setupBackupPassphrase, runManualBackup, linkDriveBackup, unlinkDriveBackup, updateDriveBackupFolder, updateDriveSyncMode,
      saveDriveOAuthClient, clearDriveOAuthClient,
      isHeavy: (name) => HEAVY.has(name),
    }}>
      {children}
    </AppContext.Provider>
  );
}
