import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { getExerciseIndex } from './ExerciseLibraryService';
import { importParsedCSV } from './CSVImport';
import { normalizeAliasKey, resolveCanonicalExerciseName } from '../data/exerciseAliases';

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) dp[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function norm(s) { return normalizeAliasKey(resolveCanonicalExerciseName(s)); }

function toIsoDay(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeSetTypeToIronlog(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return 'normal';
  if (t === 'working') return 'normal';
  if (t === 'warmup') return 'warmup';
  if (t === 'dropset') return 'drop';
  if (t === 'amrap') return 'amrap';
  if (t === 'failure') return 'failure';
  return 'normal';
}

function normalizeSetTypeToOpenWeight(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'warmup') return 'warmup';
  if (t === 'drop') return 'dropset';
  if (t === 'amrap') return 'amrap';
  if (t === 'failure') return 'failure';
  return 'working';
}

function flattenOpenWeightLogs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.workoutLogs)) return raw.workoutLogs;
  if (Array.isArray(raw.workouts)) return raw.workouts;
  if (raw.date && Array.isArray(raw.exercises)) return [raw];
  return [];
}

async function buildMatcher() {
  const exerciseIndex = await getExerciseIndex() || [];
  const lib = exerciseIndex.map((exercise) => ({
    ...exercise,
    _norm: norm(exercise.name),
    _aliasNorms: [norm(exercise.name), ...(Array.isArray(exercise.aliases) ? exercise.aliases.map(norm) : [])].filter(Boolean),
  }));
  const cache = {};
  return (rawName) => {
    const n = norm(rawName);
    if (!n) return null;
    if (cache[n]) return cache[n];

    const exact = lib.find((exercise) => exercise._aliasNorms.includes(n));
    if (exact) {
      cache[n] = { exercise: exact, matchType: 'exact' };
      return cache[n];
    }

    let best = null;
    let bestSim = 0;
    for (const ex of lib) {
      const dist = lev(n, ex._norm);
      if (dist > 3) continue;
      const sim = 1 - dist / Math.max(n.length, ex._norm.length, 1);
      if (sim >= 0.8 && sim > bestSim) {
        bestSim = sim;
        best = ex;
      }
    }

    if (best) {
      cache[n] = { exercise: best, matchType: 'fuzzy', original: rawName };
      return cache[n];
    }

    cache[n] = {
      exercise: { name: resolveCanonicalExerciseName(rawName), isCustom: true, id: n.replace(/\s+/g, '_') },
      matchType: 'custom',
      original: rawName,
    };
    return cache[n];
  };
}

export async function pickAndParseOpenWeight() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const rawText = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: 'utf8' });
  const payload = JSON.parse(rawText);
  const logs = flattenOpenWeightLogs(payload);
  if (!logs.length) throw new Error('No workout logs found in OpenWeight file.');

  const matchEx = await buildMatcher();
  const sessions = {};

  for (const log of logs) {
    const day = toIsoDay(log?.date);
    if (!day) continue;
    const workoutName = String(log?.name || 'Workout').trim() || 'Workout';
    const key = `${day}||${workoutName}`;
    if (!sessions[key]) {
      sessions[key] = {
        date: day,
        workoutName,
        exercises: {},
      };
    }

    const exercises = Array.isArray(log?.exercises) ? log.exercises : [];
    for (const exLog of exercises) {
      const rawName = String(exLog?.exercise?.name || exLog?.name || '').trim();
      if (!rawName) continue;
      if (!sessions[key].exercises[rawName]) {
        sessions[key].exercises[rawName] = { rawName, sets: [] };
      }
      const sets = Array.isArray(exLog?.sets) ? exLog.sets : [];
      for (const set of sets) {
        sessions[key].exercises[rawName].sets.push({
          weight: Number(set?.weight || 0),
          reps: Number(set?.reps || 0),
          rpe: Number.isFinite(Number(set?.rpe)) ? Number(set?.rpe) : null,
          rir: Number.isFinite(Number(set?.rir)) ? Number(set?.rir) : null,
          note: set?.notes || null,
          type: normalizeSetTypeToIronlog(set?.type),
          durationSeconds: Number(set?.durationSeconds || 0) || 0,
          distance: Number(set?.distance || 0) || 0,
          distanceUnit: set?.distanceUnit || null,
        });
      }
    }
  }

  const sessionList = Object.values(sessions);
  const allExNames = [...new Set(sessionList.flatMap((s) => Object.keys(s.exercises)))];
  const matchResults = {};
  allExNames.forEach((name) => { matchResults[name] = matchEx(name); });
  const totalSets = sessionList.reduce((acc, session) => (
    acc + Object.values(session.exercises).reduce((sum, ex) => sum + ex.sets.length, 0)
  ), 0);

  return {
    format: 'openweight',
    sessionList,
    matchResults,
    preview: {
      workouts: sessionList.length,
      exercises: allExNames.length,
      sets: totalSets,
      fuzzyMatches: allExNames.filter((n) => matchResults[n]?.matchType === 'fuzzy'),
      customExercises: allExNames.filter((n) => matchResults[n]?.matchType === 'custom'),
    },
  };
}

export async function importParsedOpenWeight(parsed) {
  return importParsedCSV(parsed);
}

export function buildOpenWeightBundleFromHistory(history = []) {
  const workoutLogs = [...history]
    .slice()
    .reverse()
    .map((session) => {
      const exercises = (session?.exercises || []).map((ex, exIdx) => ({
        exercise: {
          name: ex?.name || 'Exercise',
          equipment: ex?.equipment || undefined,
          category: ex?.muscleGroup || undefined,
          musclesWorked: Array.isArray(ex?.primaryMuscles) ? ex.primaryMuscles : undefined,
          'ironlog:exerciseId': ex?.exerciseId || ex?.name || null,
        },
        order: exIdx + 1,
        notes: ex?.note || undefined,
        sets: (ex?.sets || []).map((set) => {
          const out = {
            reps: Number(set?.reps || 0),
            rpe: Number.isFinite(Number(set?.rpe)) ? Number(set.rpe) : undefined,
            rir: Number.isFinite(Number(set?.rir)) ? Number(set.rir) : undefined,
            type: normalizeSetTypeToOpenWeight(set?.type),
            notes: set?.note || undefined,
            targetReps: Number.isFinite(Number(set?.targetReps)) ? Number(set.targetReps) : undefined,
            targetWeight: Number.isFinite(Number(set?.targetWeight)) ? Number(set.targetWeight) : undefined,
            durationSeconds: Number(set?.durationSeconds || 0) || undefined,
            distance: Number(set?.distance || 0) || undefined,
            distanceUnit: set?.distanceUnit || undefined,
          };
          const weight = Number(set?.weight || 0);
          if (weight > 0) {
            out.weight = weight;
            out.unit = 'kg';
          }
          if (!Number.isFinite(out.reps) || out.reps <= 0) delete out.reps;
          if (out.targetWeight !== undefined && out.targetWeight <= 0) delete out.targetWeight;
          return out;
        }),
      }));

      const date = session?.date || new Date().toISOString();
      return {
        date,
        name: session?.dayName || session?.planName || 'Workout',
        notes: session?.notes || undefined,
        durationSeconds: Number(session?.duration || 0) || undefined,
        exercises,
        'ironlog:sessionId': session?.id || null,
      };
    });

  return {
    openweight: {
      schema: 'https://openweight.org/schemas/workout-log.schema.json',
      exportedAt: new Date().toISOString(),
      source: 'IRONLOG',
      appVersion: Constants.expoConfig?.version || '1.1.0',
    },
    workoutLogs,
    'ironlog:metadata': {
      generatedBy: 'IRONLOG',
      localFirst: true,
    },
  };
}

export async function exportOpenWeightBundleAndShare(history = []) {
  const bundle = buildOpenWeightBundleFromHistory(history);
  const filePath = `${FileSystem.cacheDirectory}ironlog_openweight_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(bundle, null, 2), { encoding: 'utf8' });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(filePath, {
    mimeType: 'application/json',
    dialogTitle: 'Export IRONLOG OpenWeight Data',
  });
  return bundle;
}
