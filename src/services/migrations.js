
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISES } from '../data/exerciseLibrary';
import { EXERCISE_ID_MAP } from '../data/exerciseMapping';
import { resolveCanonicalExerciseName } from '../data/exerciseAliases';

const SCHEMA_VERSION_KEY = '@ironlog/schemaVersion';
const MIGRATION_ERRORS_KEY = '@ironlog/migrationErrors';
const CURRENT_VERSION = 11;

// old key helpers
const OLD_HISTORY_KEY = 'ironlog_history';
const OLD_BW_KEY = 'ironlog_bw';

async function logError(migration, err) {
  try {
    const existing = await AsyncStorage.getItem(MIGRATION_ERRORS_KEY);
    const errors = existing ? JSON.parse(existing) : [];
    errors.push({ migration, error: err.message, date: new Date().toISOString() });
    await AsyncStorage.setItem(MIGRATION_ERRORS_KEY, JSON.stringify(errors));
  } catch (_) {}
}

// v0→v1: initial schema setup
async function migrate0to1() {
}

// v1→v2: convert warmup boolean on sets to set.type
async function migrate1to2() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const updated = history.map(session => ({
    ...session,
    exercises: (session.exercises || []).map(ex => ({
      ...ex,
      sets: (ex.sets || []).map(s => ({
        ...s,
        type: s.isWarmup ? 'warmup' : (s.type || 'normal'),
        isWarmup: undefined,
      })),
    })),
  }));
  await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
}

// v2→v3: add supersetGroup: null to all workout exercises
async function migrate2to3() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const updated = history.map(session => ({
    ...session,
    exercises: (session.exercises || []).map(ex => ({
      supersetGroup: null,
      ...ex,
    })),
  }));
  await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
}

// v3→v4: migrate body weight entries to BodyMeasurements format
async function migrate3to4() {
  const raw = await AsyncStorage.getItem(OLD_BW_KEY);
  if (!raw) return;
  const bwEntries = JSON.parse(raw);
  const measurements = bwEntries.map((e, i) => ({
    id: `bw_migrated_${i}`,
    date: e.date || new Date().toISOString(),
    weight: e.weight || null,
    bodyFat: null, chest: null, waist: null, hips: null,
    leftArm: null, rightArm: null, leftThigh: null, rightThigh: null,
    leftCalf: null, rightCalf: null, shoulders: null, neck: null,
    notes: '',
  }));
  await AsyncStorage.setItem('@ironlog/bodyMeasurements', JSON.stringify(measurements));
  // keep old key for backward compat with existing BW chart
}

// v4→v5: add previousSets, targetWeight, targetReps to all sets
async function migrate4to5() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const updated = history.map(session => ({
    ...session,
    exercises: (session.exercises || []).map(ex => ({
      ...ex,
      previousSets: ex.previousSets !== undefined ? ex.previousSets : null,
      sets: (ex.sets || []).map(s => ({
        id: s.id || `s_${Math.random().toString(36).slice(2)}`,
        rpe: s.rpe !== undefined ? s.rpe : null,
        rir: s.rir !== undefined ? s.rir : null,
        completed: s.completed !== undefined ? s.completed : true,
        targetWeight: s.targetWeight !== undefined ? s.targetWeight : null,
        targetReps: s.targetReps !== undefined ? s.targetReps : null,
        ...s,
      })),
    })),
  }));
  await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
}

// v5→v6: add isDeload to all sessions
async function migrate5to6() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const updated = history.map(s => ({ isDeload: false, rating: null, ...s }));
  await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
}

// v6→v7: create empty index structures
async function migrate6to7() {
  const pairs = [
    ['@ironlog/pr_index', '{}'],
    ['@ironlog/volume_index', '{}'],
    ['@ironlog/lastPerformance', '{}'],
  ];
  // only set if not already present
  const existing = await AsyncStorage.multiGet(pairs.map(p => p[0]));
  const toSet = pairs.filter((_, i) => existing[i][1] === null);
  if (toSet.length) await AsyncStorage.multiSet(toSet);
}

// v7→v8: rebuild all indexes from full history
// runs AFTER all schema migrations so set.type and isDeload are already correct
async function migrate7to8() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const prIndex = {};
  const volumeIndex = {};
  const lastPerf = {};

  for (const session of history) {
    if (!session.exercises || !session.date) continue;
    const dateStr = session.date.split('T')[0];
    // ISO week key
    const d = new Date(session.date);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    const weekKey = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;

    for (const ex of session.exercises) {
      if (!ex.name || !ex.sets) continue;
      const exId = ex.exerciseId || ex.name;
      const workingSets = ex.sets.filter(s => s.type !== 'warmup');

      // lastPerformance — overwrite with most recent (history is newest-first)
      if (!lastPerf[exId]) {
        lastPerf[exId] = {
          date: dateStr,
          workoutId: session.id,
          sets: workingSets.map(s => ({ weight: s.weight, reps: s.reps, type: s.type || 'normal', rpe: s.rpe || null })),
        };
      }

      // pr_index — only normal/failure/amrap sets
      const prSets = ex.sets.filter(s => ['normal', 'failure', 'amrap'].includes(s.type || 'normal'));
      if (prSets.length && !session.isDeload) {
        if (!prIndex[exId]) prIndex[exId] = [];
        for (const s of prSets) {
          if (!s.weight || !s.reps) continue;
          const e1rm = Math.round(s.weight * (1 + s.reps / 30) * 10) / 10;
          prIndex[exId].push({ date: dateStr, weight: s.weight, reps: s.reps, e1rm });
        }
      }

      // volume_index — working sets to primary muscle, skip deload
      if (!session.isDeload && workingSets.length) {
        // primaryMuscle comes from exerciseId lookup — for migrated data use muscle field
        const muscle = (ex.primaryMuscles && ex.primaryMuscles[0]) || ex.primary || ex.muscle || 'other';
        const normalized = muscle.toLowerCase().replace(/\s+/g, '_');
        if (!volumeIndex[weekKey]) volumeIndex[weekKey] = {};
        volumeIndex[weekKey][normalized] = (volumeIndex[weekKey][normalized] || 0) + workingSets.length;
      }
    }
  }

  // Sort pr_index entries by date ascending
  for (const id of Object.keys(prIndex)) {
    prIndex[id].sort((a, b) => a.date.localeCompare(b.date));
  }

  await AsyncStorage.multiSet([
    ['@ironlog/pr_index', JSON.stringify(prIndex)],
    ['@ironlog/volume_index', JSON.stringify(volumeIndex)],
    ['@ironlog/lastPerformance', JSON.stringify(lastPerf)],
  ]);
}

// v8→v9: add note: null to all sets that lack it
async function migrate8to9() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  const updated = history.map(session => ({
    ...session,
    exercises: (session.exercises || []).map(ex => ({
      ...ex,
      sets: (ex.sets || []).map(s => ({
        ...s,
        note: s.note !== undefined ? s.note : null,
      })),
    })),
  }));
  await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
}

// v9→v10: wipe out legacy custom exercises since they duplicate program templates
async function migrate9to10() {
  await AsyncStorage.multiRemove([
    '@ironlog/customExercises',
    '@ironlog/exerciseLibrary',
    '@ironlog/exerciseIndex',
    'ironlog_exerciseMap'
  ]);
}

// v10→v11: fix empty primaryMuscles in history from past bug

async function migrate10to11() {
  const raw = await AsyncStorage.getItem(OLD_HISTORY_KEY);
  if (!raw) return;
  const history = JSON.parse(raw);
  let changed = false;

  const updated = history.map(session => {
    if (!session.exercises) return session;
    const mappedExercises = session.exercises.map(ex => {
      if (!ex.primaryMuscles || ex.primaryMuscles.length === 0) {
        const mappedId = EXERCISE_ID_MAP[ex.name];
        const canonicalName = resolveCanonicalExerciseName(ex.name);
        const libMatch = mappedId
          ? EXERCISES.find((item) => item.id === mappedId)
          : EXERCISES.find((item) => resolveCanonicalExerciseName(item.name) === canonicalName || item.name === ex.name);
        if (libMatch && libMatch.primaryMuscles) {
          changed = true;
          return { ...ex, primaryMuscles: libMatch.primaryMuscles };
        }
      }
      return ex;
    });
    return { ...session, exercises: mappedExercises };
  });

  if (changed) {
    await AsyncStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(updated));
  }
}

const MIGRATIONS = [
  null,          // placeholder so index = version number
  migrate0to1,
  migrate1to2,
  migrate2to3,
  migrate3to4,
  migrate4to5,
  migrate5to6,
  migrate6to7,
  migrate7to8,
  migrate8to9,
  migrate9to10,
  migrate10to11,
];

export async function runMigrations(onProgress) {
  const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  let currentVersion = raw ? parseInt(raw, 10) : 0;
  if (currentVersion >= CURRENT_VERSION) return false; // nothing to do

  for (let v = currentVersion + 1; v <= CURRENT_VERSION; v++) {
    onProgress && onProgress(v, CURRENT_VERSION);
    try {
      await MIGRATIONS[v]();
      await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(v));
    } catch (e) {
      await logError(`v${v - 1}->v${v}`, e);
      // skip and continue — never crash
    }
  }
  return true; // migrations ran
}

export async function getSchemaVersion() {
  const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
  return raw ? parseInt(raw, 10) : 0;
}
