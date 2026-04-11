
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExerciseIndex } from '../services/ExerciseLibraryService';
import { normalizeAliasKey, resolveCanonicalExerciseName } from '../data/exerciseAliases';

function lev(a, b) {
  const m = a.length, n = b.length;
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

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function detectFormat(headers) {
  const h = headers.map(x => x.toLowerCase().trim());
  if (h.includes('set order')) return 'strong';
  if (h.includes('start_time') || h.includes('exercise_title')) return 'hevy';
  return 'ironlog';
}

export async function pickAndParseCSV() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', '*/*'] });
  if (result.canceled || !result.assets?.[0]) return null;

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV appears empty');

  const headers = parseCSVLine(lines[0]);
  const format = detectFormat(headers);

  const exerciseIndex = await getExerciseIndex() || [];
  const lib = exerciseIndex.map((exercise) => ({
    ...exercise,
    _norm: norm(exercise.name),
    _aliasNorms: [norm(exercise.name), ...(Array.isArray(exercise.aliases) ? exercise.aliases.map(norm) : [])].filter(Boolean),
  }));

  const matchCache = {};
  function matchEx(rawName) {
    const n = norm(rawName);
    if (matchCache[n]) return matchCache[n];

    const exact = lib.find((exercise) => exercise._aliasNorms.includes(n));
    if (exact) return (matchCache[n] = { exercise: exact, matchType: 'exact' });

    let best = null, bestSim = 0;
    for (const ex of lib) {
      const dist = lev(n, ex._norm);
      if (dist > 3) continue;
      const sim = 1 - dist / Math.max(n.length, ex._norm.length, 1);
      if (sim >= 0.8 && sim > bestSim) { bestSim = sim; best = ex; }
    }
    if (best) return (matchCache[n] = { exercise: best, matchType: 'fuzzy', original: rawName });

    const customName = resolveCanonicalExerciseName(rawName);
    const customEx = { name: customName, isCustom: true, id: n.replace(/\s+/g, '_') };
    return (matchCache[n] = { exercise: customEx, matchType: 'custom', original: rawName });
  }

  const sessions = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    let date, workoutName, exerciseName, weight, reps, rpe, notes;

    if (format === 'strong' || format === 'ironlog') {
      [date, workoutName, exerciseName, , weight, reps, rpe, , , notes] = cols;
    } else {
      // Hevy: build from header map
      const hi = Object.fromEntries(headers.map((h, idx) => [h.toLowerCase().trim(), cols[idx]]));
      date = (hi.start_time || '').split('T')[0] || hi.date || '';
      workoutName = hi.title || '';
      exerciseName = hi.exercise_title || hi.exercise_name || '';
      weight = hi.weight_kg || hi.weight || '0';
      reps = hi.reps || '0';
      rpe = hi.rpe || '';
      notes = hi.notes || '';
    }

    if (!date || !exerciseName) continue;
    const key = date + '||' + (workoutName || 'Workout');
    if (!sessions[key]) sessions[key] = { date, workoutName: workoutName || 'Workout', exercises: {} };
    if (!sessions[key].exercises[exerciseName]) sessions[key].exercises[exerciseName] = { rawName: exerciseName, sets: [] };
    sessions[key].exercises[exerciseName].sets.push({
      weight: parseFloat(weight) || 0,
      reps: parseInt(reps) || 0,
      rpe: rpe ? parseFloat(rpe) : null,
      note: notes || null,
      type: 'normal',
    });
  }

  const sessionList = Object.values(sessions);
  const allExNames = [...new Set(sessionList.flatMap(s => Object.keys(s.exercises)))];
  const matchResults = {};
  allExNames.forEach(name => { matchResults[name] = matchEx(name); });

  const totalSets = sessionList.reduce((a, s) =>
    a + Object.values(s.exercises).reduce((b, e) => b + e.sets.length, 0), 0);

  return {
    sessionList,
    matchResults,
    format,
    preview: {
      workouts: sessionList.length,
      exercises: allExNames.length,
      sets: totalSets,
      fuzzyMatches: allExNames.filter(n => matchResults[n].matchType === 'fuzzy'),
      customExercises: allExNames.filter(n => matchResults[n].matchType === 'custom'),
    },
  };
}

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function importParsedCSV(parsed) {
  const { sessionList, matchResults } = parsed;

  const raw = await AsyncStorage.getItem('ironlog_history');
  const existing = raw ? JSON.parse(raw) : [];
  const existingKeys = new Set(existing.map(h => (h.date?.split('T')[0] || '') + '||' + (h.dayName || '')));

  const newSessions = [];
  for (const session of sessionList) {
    const key = session.date + '||' + session.workoutName;
    if (existingKeys.has(key)) continue;
    const exercises = Object.values(session.exercises).map(ex => {
      const m = matchResults[ex.rawName];
      const r = m.exercise;
      return {
        name: resolveCanonicalExerciseName(r.name),
        exerciseId: r.exerciseId || r.id || r.name,
        primaryMuscles: r.primaryMuscles || [],
        isCustom: r.isCustom || false,
        sets: ex.sets,
      };
    });
    newSessions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      date: session.date + 'T00:00:00.000Z',
      dayName: session.workoutName,
      duration: 0,
      sets: exercises.reduce((a, e) => a + e.sets.length, 0),
      exercises,
    });
  }

  if (newSessions.length === 0) return 0;

  const merged = [...newSessions, ...existing].slice(0, 500);

  // Rebuild indexes
  const prIndex = {}, volumeIndex = {}, lastPerf = {};
  for (const session of merged) {
    const dateStr = session.date.split('T')[0];
    const weekKey = isoWeek(session.date);
    for (const ex of (session.exercises || [])) {
      const exId = ex.exerciseId || ex.name;
      const working = (ex.sets || []).filter(s => s.type !== 'warmup');
      lastPerf[exId] = { date: dateStr, sets: working };
      if (!session.isDeload) {
        if (!prIndex[exId]) prIndex[exId] = [];
        for (const s of working) {
          if (!s.weight || !s.reps) continue;
          prIndex[exId].push({ date: dateStr, weight: s.weight, reps: s.reps, e1rm: Math.round(s.weight * (1 + s.reps / 30) * 10) / 10 });
        }
        prIndex[exId].sort((a, b) => a.date.localeCompare(b.date));
        if (working.length) {
          const muscle = (ex.primaryMuscles?.[0] || 'other').toLowerCase().replace(/\s+/g, '_');
          if (!volumeIndex[weekKey]) volumeIndex[weekKey] = {};
          volumeIndex[weekKey][muscle] = (volumeIndex[weekKey][muscle] || 0) + working.length;
        }
      }
    }
  }

  await AsyncStorage.multiSet([
    ['ironlog_history', JSON.stringify(merged)],
    ['@ironlog/pr_index', JSON.stringify(prIndex)],
    ['@ironlog/volume_index', JSON.stringify(volumeIndex)],
    ['@ironlog/lastPerformance', JSON.stringify(lastPerf)],
  ]);

  return newSessions.length;
}
