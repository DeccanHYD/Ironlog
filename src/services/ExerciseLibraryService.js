
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISES as BUNDLED_EXERCISES } from '../data/exerciseLibrary';
import { EXERCISE_LIBRARY_ADDITIONS } from '../data/exerciseLibraryAdditions';
import { EXERCISE_ID_MAP } from '../data/exerciseMapping';
import { resolveCanonicalExerciseName, normalizeAliasKey } from '../data/exerciseAliases';
import {
  deleteCustomExerciseFromDb,
  upsertCustomExerciseToDb,
} from '../domain/storage/trainingRepository';
import { resolveExerciseYoutubeMeta } from '../utils/exerciseVideoLinks';

const LIBRARY_KEY = '@ironlog/exerciseLibrary';
const INDEX_KEY = '@ironlog/exerciseIndex';
const FETCH_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const VALID_EQUIPMENT = new Set(['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Band', 'Conditioning', 'Other']);
const VALID_TRACKING = new Set(['weight_reps', 'duration', 'duration_distance']);

const LEGACY_EXERCISE_ID_ALIASES = {
  pullups: 'pull_up',
  pushups: 'push_up',
  seated_cable_rows: 'seated_cable_row',
  leg_extensions: 'leg_extension',
  hammer_curls: 'hammer_curl',
  weighted_pull_ups: 'weighted_pull_up',
  smith_machine_bench_press: 'longhaul_bench_press_smith_machine',
  smith_machine_incline_bench_press: 'incline_bench_press_smith_machine',
  smith_machine_squat: 'longhaul_squat_smith_machine',
  barbell_hack_squat: 'longhaul_hack_squat_barbell',
  barbell_rear_delt_row: 'longhaul_rear_delt_row_barbell',
};

const REQUIRED_CANONICAL_EXERCISES = [
  { id: 'cable_fly', name: 'Cable Fly', primaryMuscle: 'Chest', equipment: 'Cable', trackingType: 'weight_reps' },
  { id: 'cable_fly_low_to_high', name: 'Cable Fly Low to High', primaryMuscle: 'Upper Chest', equipment: 'Cable', trackingType: 'weight_reps' },
  { id: 'cable_fly_high_to_low', name: 'Cable Fly High to Low', primaryMuscle: 'Lower Chest', equipment: 'Cable', trackingType: 'weight_reps' },
  { id: 'machine_chest_press', name: 'Machine Chest Press', primaryMuscle: 'Chest', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'machine_incline_chest_press', name: 'Machine Incline Chest Press', primaryMuscle: 'Upper Chest', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'chest_supported_row', name: 'Chest-Supported Row', primaryMuscle: 'Upper Back', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'chest_supported_dumbbell_row', name: 'Chest-Supported Dumbbell Row', primaryMuscle: 'Upper Back', equipment: 'Dumbbell', trackingType: 'weight_reps' },
  { id: 'seal_row', name: 'Seal Row', primaryMuscle: 'Upper Back', equipment: 'Barbell', trackingType: 'weight_reps' },
  { id: 'pendlay_row', name: 'Pendlay Row', primaryMuscle: 'Upper Back', equipment: 'Barbell', trackingType: 'weight_reps' },
  { id: 'meadows_row', name: 'Meadows Row', primaryMuscle: 'Upper Back', equipment: 'Barbell', trackingType: 'weight_reps' },
  { id: 'assisted_pullup_machine', name: 'Assisted Pull-Up Machine', primaryMuscle: 'Lats', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'cable_lateral_raise_single_arm', name: 'Cable Lateral Raise (Single Arm)', primaryMuscle: 'Side Delts', equipment: 'Cable', trackingType: 'weight_reps' },
  { id: 'machine_lateral_raise', name: 'Machine Lateral Raise', primaryMuscle: 'Side Delts', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'reverse_pec_deck', name: 'Reverse Pec Deck', primaryMuscle: 'Rear Delts', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', primaryMuscle: 'Quads', equipment: 'Dumbbell', trackingType: 'weight_reps' },
  { id: 'belt_squat', name: 'Belt Squat', primaryMuscle: 'Quads', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'safety_bar_squat', name: 'Safety Bar Squat', primaryMuscle: 'Quads', equipment: 'Barbell', trackingType: 'weight_reps' },
  { id: 'nordic_hamstring_curl', name: 'Nordic Hamstring Curl', primaryMuscle: 'Hamstrings', equipment: 'Bodyweight', trackingType: 'weight_reps' },
  { id: 'tibialis_raise', name: 'Tibialis Raise', primaryMuscle: 'Calves', equipment: 'Bodyweight', trackingType: 'weight_reps' },
  { id: 'tibialis_raise_machine', name: 'Tibialis Raise (Machine)', primaryMuscle: 'Calves', equipment: 'Machine', trackingType: 'weight_reps' },
  { id: 'ski_erg', name: 'Ski Erg', primaryMuscle: 'Conditioning', equipment: 'Conditioning', trackingType: 'duration_distance' },
];

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function normalizeCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'strength';
  if (raw.includes('weight') || raw.includes('rep')) return 'strength';
  if (raw.includes('distance') || raw.includes('duration') || raw.includes('time')) return 'cardio';
  if (raw.includes('cardio') || raw.includes('conditioning')) return 'cardio';
  if (raw.includes('mobility') || raw.includes('stretch')) return 'mobility';
  if (raw.includes('bodyweight') || raw.includes('calisthenics')) return 'bodyweight';
  if (raw.includes('olympic')) return 'olympic';
  return raw;
}

function normalizePrimaryMuscles(ex) {
  const raw = [
    ...toArray(ex.primaryMuscles),
    ...toArray(ex.primaryMuscle),
    ...toArray(ex.muscle),
    ...toArray(ex.target),
    ...toArray(ex.targetMuscle),
    ...toArray(ex.bodyPart),
    ...toArray(ex.muscleGroup),
  ];
  const seen = new Set();
  const cleaned = [];
  raw.forEach((muscle) => {
    const normalized = String(muscle || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(normalized);
  });
  return cleaned;
}

function normalizeNameSignature(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

// Map free-exercise-db equipment strings to our normalized values
function normalizeEquipment(eq) {
  const map = {
    'barbell': 'Barbell', 'dumbbell': 'Dumbbell', 'cable': 'Cable',
    'machine': 'Machine', 'body only': 'Bodyweight', 'bodyweight': 'Bodyweight',
    'kettlebells': 'Kettlebell', 'bands': 'Band', 'other': 'Other',
    'medicine ball': 'Other', 'exercise ball': 'Other', 'e-z curl bar': 'Barbell',
    'foam roll': 'Other',
  };
  const normalized = map[(eq || '').toLowerCase()] || 'Other';
  return VALID_EQUIPMENT.has(normalized) ? normalized : 'Other';
}

function normalizeMuscleLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  const map = {
    chest: 'Chest',
    'upper chest': 'Upper Chest',
    'mid chest': 'Mid Chest',
    'lower chest': 'Lower Chest',
    lats: 'Lats',
    back: 'Back',
    'upper back': 'Upper Back',
    'middle back': 'Upper Back',
    traps: 'Traps',
    'lower back': 'Spinal Erectors',
    erectors: 'Spinal Erectors',
    shoulders: 'Shoulders',
    'front delts': 'Front Delts',
    'side delts': 'Side Delts',
    'rear delts': 'Rear Delts',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    core: 'Core',
    abdominals: 'Core',
    'upper abs': 'Upper Abs',
    'lower abs': 'Lower Abs',
    obliques: 'Obliques',
    quads: 'Quads',
    quadriceps: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    adductors: 'Adductors',
    abductors: 'Abductors',
    conditioning: 'Conditioning',
  };
  return map[key] || toTitleCase(value);
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeTrackingType(type, name, category) {
  const raw = String(type || '').toLowerCase().trim();
  const signal = `${String(name || '').toLowerCase()} ${String(category || '').toLowerCase()}`;
  if (raw && VALID_TRACKING.has(raw)) return raw;
  if (/(stretch|hold|plank|mobility|isometric)/.test(signal)) return 'duration';
  if (/(bike|erg|run|row|ski|carry|conditioning|distance|cardio|treadmill)/.test(signal)) return 'duration_distance';
  return 'weight_reps';
}

function canonicalizeExerciseRecord(exercise = {}) {
  const originalName = exercise.name;
  const canonicalName = resolveCanonicalExerciseName(originalName);
  const normalizedId = LEGACY_EXERCISE_ID_ALIASES[exercise.id] || exercise.id;
  const primaryMuscles = normalizePrimaryMuscles({
    ...exercise,
    name: canonicalName,
    primaryMuscles: normalizePrimaryMuscles(exercise).map(normalizeMuscleLabel),
  }).map(normalizeMuscleLabel);
  if (normalizeAliasKey(canonicalName).includes('cable hip adduction')) {
    primaryMuscles.splice(0, primaryMuscles.length, 'Adductors');
  }
  if (normalizeAliasKey(canonicalName).includes('air bike')) {
    primaryMuscles.splice(0, primaryMuscles.length, 'Conditioning');
  }

  const category = normalizeCategory(exercise.category || exercise.trackingType);
  const trackingType = normalizeTrackingType(exercise.trackingType, canonicalName, category);
  let equipment = normalizeEquipment(exercise.equipment || exercise.mechanic || '');
  if (canonicalName.toLowerCase().includes('air bike') || canonicalName.toLowerCase().includes('ski erg')) {
    equipment = 'Conditioning';
  }

  const aliases = new Set(toArray(exercise.aliases));
  if (originalName && originalName !== canonicalName) aliases.add(originalName);
  if (normalizedId && normalizedId !== exercise.id) aliases.add(exercise.id);

  return {
    ...exercise,
    id: normalizedId || canonicalName.replace(/[^a-zA-Z0-9]/g, '_'),
    name: canonicalName,
    primaryMuscles,
    primaryMuscle: primaryMuscles[0] || normalizeMuscleLabel(exercise.primaryMuscle || exercise.primary || exercise.muscle),
    equipment,
    category,
    trackingType,
    aliases: Array.from(aliases).filter(Boolean),
  };
}

function applyCanonicalNormalizationAndDedup(exercises = []) {
  const bySignature = new Map();
  exercises.forEach((exercise) => {
    const normalized = canonicalizeExerciseRecord(exercise);
    const signature = normalizeAliasKey(normalized.name);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, normalized);
      return;
    }
    const mergedAliases = new Set([...(existing.aliases || []), ...(normalized.aliases || []), existing.name, normalized.name]);
    const betterEquipment = existing.equipment === 'Other' && normalized.equipment !== 'Other' ? normalized.equipment : existing.equipment;
    const betterTracking = existing.trackingType === 'weight_reps' && normalized.trackingType !== 'weight_reps'
      ? normalized.trackingType
      : existing.trackingType;
    bySignature.set(signature, {
      ...existing,
      aliases: Array.from(mergedAliases).filter(Boolean),
      equipment: betterEquipment,
      trackingType: betterTracking,
      primaryMuscles: existing.primaryMuscles?.length ? existing.primaryMuscles : normalized.primaryMuscles,
      primaryMuscle: existing.primaryMuscle || normalized.primaryMuscle,
    });
  });

  const result = Array.from(bySignature.values());
  const signatureSet = new Set(result.map((exercise) => normalizeAliasKey(exercise.name)));
  REQUIRED_CANONICAL_EXERCISES.forEach((seed) => {
    const signature = normalizeAliasKey(seed.name);
    if (signatureSet.has(signature)) return;
    result.push(canonicalizeExerciseRecord({
      id: seed.id,
      name: seed.name,
      primaryMuscles: [seed.primaryMuscle],
      primaryMuscle: seed.primaryMuscle,
      equipment: seed.equipment,
      trackingType: seed.trackingType,
      category: seed.trackingType,
      instructions: [],
      secondaryMuscles: [],
      isCustom: false,
      source: 'ironlog-canonical',
    }));
    signatureSet.add(signature);
  });

  return result;
}

function buildFromBundled() {
  // Bundled exercises are already in full DB format (auto-generated from free-exercise-db)
  const bundled = BUNDLED_EXERCISES.map(ex => {
    const primaryMuscles = normalizePrimaryMuscles(ex);
    const youtube = resolveExerciseYoutubeMeta(ex);
    return {
      id: ex.id || ex.name.replace(/[^a-zA-Z0-9]/g, '_'),
      name: ex.name,
      force: ex.force || null,
      level: ex.level || 'intermediate',
      mechanic: ex.mechanic || null,
      equipment: ex.equipment || ex.mechanic || null,
      primaryMuscles,
      primaryMuscle: primaryMuscles[0] || null,
      secondaryMuscles: toArray(ex.secondaryMuscles),
      instructions: ex.instructions || (ex.cue ? [ex.cue] : []),
      category: normalizeCategory(ex.category || ex.trackingType),
      trackingType: ex.trackingType || null,
      images: ex.images || [],
      isCustom: false,
      coachingCues: ex.cue ? [ex.cue] : null,
      youtubeLink: youtube.youtubeLink,
      youtubeShortsLink: youtube.youtubeShortsLink,
      youtubeSearchQuery: youtube.youtubeSearchQuery,
      hasBundledYoutubeLink: youtube.hasBundledYoutubeLink,
    };
  });
  return applyCanonicalNormalizationAndDedup(mergeSupplementalExercises(bundled, EXERCISE_LIBRARY_ADDITIONS));
}

function normalizeSupplementalExercise(ex) {
  const primaryMuscles = normalizePrimaryMuscles(ex);
  const youtube = resolveExerciseYoutubeMeta(ex);
  return {
    id: ex.id || ex.name.replace(/[^a-zA-Z0-9]/g, '_'),
    name: ex.name,
    force: ex.force || null,
    level: ex.level || 'intermediate',
    mechanic: ex.mechanic || null,
    equipment: ex.equipment || null,
    primaryMuscles,
    primaryMuscle: primaryMuscles[0] || null,
    secondaryMuscles: toArray(ex.secondaryMuscles),
    instructions: ex.instructions || [],
    category: normalizeCategory(ex.category || ex.trackingType),
    trackingType: ex.trackingType || null,
    images: ex.images || [],
    isCustom: false,
    coachingCues: ex.coachingCues || null,
    youtubeLink: youtube.youtubeLink,
    youtubeShortsLink: youtube.youtubeShortsLink,
    youtubeSearchQuery: youtube.youtubeSearchQuery,
    hasBundledYoutubeLink: youtube.hasBundledYoutubeLink,
    source: ex.source || 'supplemental',
  };
}

function mergeSupplementalExercises(baseExercises, supplementalExercises) {
  const existingById = new Set(baseExercises.map((exercise) => exercise.id));
  const existingByName = new Set(baseExercises.map((exercise) => normalizeNameSignature(exercise.name)));
  const merged = [...baseExercises];

  supplementalExercises.forEach((exercise) => {
    const normalized = normalizeSupplementalExercise(exercise);
    const nameKey = normalizeNameSignature(normalized.name);
    if (existingById.has(normalized.id) || existingByName.has(nameKey)) return;
    existingById.add(normalized.id);
    existingByName.add(nameKey);
    merged.push(normalized);
  });

  return merged;
}

function mergeWithDB(bundled, dbExercises) {
  // Build lookup by db id
  const dbById = {};
  for (const ex of dbExercises) dbById[ex.id] = ex;

  // Build reverse map: dbId → bundled exercise
  const idMapReverse = {};
  for (const [existingName, dbId] of Object.entries(EXERCISE_ID_MAP)) {
    if (dbId) idMapReverse[dbId] = existingName;
  }

  const usedDbIds = new Set();
  const merged = bundled.map(ex => {
    // find db id for this bundled exercise by name lookup
    const dbId = EXERCISE_ID_MAP[ex.name];
    if (dbId && dbById[dbId]) {
      usedDbIds.add(dbId);
      const db = dbById[dbId];
      return {
        ...ex,
        force: db.force || null,
        level: db.level || 'intermediate',
        mechanic: db.mechanic || null,
        equipment: normalizeEquipment(db.equipment) || ex.equipment,
        primaryMuscles: db.primaryMuscles || ex.primaryMuscles,
        secondaryMuscles: db.secondaryMuscles || [],
        instructions: db.instructions || ex.instructions,
        category: db.category || ex.category,
        images: db.images || [],
      };
    }
    return ex;
  });

  // Add remaining db exercises not already merged
  for (const db of dbExercises) {
    if (!usedDbIds.has(db.id)) {
      merged.push({
        id: db.id,
        name: db.name,
        force: db.force || null,
        level: db.level || 'beginner',
        mechanic: db.mechanic || null,
        equipment: normalizeEquipment(db.equipment),
        primaryMuscles: db.primaryMuscles || [],
        secondaryMuscles: db.secondaryMuscles || [],
        instructions: db.instructions || [],
        category: db.category || 'strength',
        images: db.images || [],
        isCustom: false,
        coachingCues: null,
        ...resolveExerciseYoutubeMeta(db),
      });
    }
  }
  return applyCanonicalNormalizationAndDedup(merged);
}

function buildIndex(exercises) {
  return exercises.map(ex => {
    const primaryMuscles = normalizePrimaryMuscles(ex);
    const youtube = resolveExerciseYoutubeMeta(ex);
    const canonical = resolveCanonicalExerciseName(ex.name);
    return {
      id: ex.id,
      name: canonical,
      aliases: Array.from(new Set([...(toArray(ex.aliases)), ex.name].filter(Boolean))),
      primaryMuscles,
      primaryMuscle: primaryMuscles[0] || null,
      secondaryMuscles: toArray(ex.secondaryMuscles),
      equipment: ex.equipment,
      category: normalizeCategory(ex.category || ex.trackingType),
      trackingType: normalizeTrackingType(ex.trackingType, canonical, ex.category) || null,
      bodyPart: ex.bodyPart || null,
      target: ex.target || null,
      level: ex.level,
      force: ex.force,
      mechanic: ex.mechanic,
      isCustom: ex.isCustom || false,
      youtubeLink: ex.youtubeLink || youtube.youtubeLink,
      youtubeShortsLink: ex.youtubeShortsLink || youtube.youtubeShortsLink,
      youtubeSearchQuery: ex.youtubeSearchQuery || youtube.youtubeSearchQuery,
      hasBundledYoutubeLink: ex.hasBundledYoutubeLink === true || youtube.hasBundledYoutubeLink === true,
    };
  });
}

function shouldRebuildIndex(index) {
  if (!Array.isArray(index) || index.length === 0) return true;
  let withMuscles = 0;
  let withNonStrengthCategory = 0;
  let withYoutubeFields = 0;
  let withAliases = 0;

  index.forEach((entry) => {
    const muscles = normalizePrimaryMuscles(entry);
    if (muscles.length > 0) withMuscles += 1;
    const category = normalizeCategory(entry.category || entry.trackingType);
    if (category !== 'strength') withNonStrengthCategory += 1;
    if (entry.youtubeLink || entry.youtubeShortsLink || entry.youtubeSearchQuery) withYoutubeFields += 1;
    if (Array.isArray(entry.aliases) && entry.aliases.length) withAliases += 1;
  });

  const muscleCoverage = withMuscles / index.length;
  const variedCategories = withNonStrengthCategory / index.length;
  const youtubeCoverage = withYoutubeFields / index.length;
  const aliasCoverage = withAliases / index.length;
  const indexIds = new Set(index.map((entry) => entry.id));
  const supplementalCoverage = EXERCISE_LIBRARY_ADDITIONS.filter((entry) => indexIds.has(entry.id)).length;

  // Rebuild stale index generated from old schema where muscles were lost.
  return muscleCoverage < 0.5
    || variedCategories < 0.02
    || youtubeCoverage < 0.95
    || aliasCoverage < 0.6
    || supplementalCoverage < Math.max(8, Math.floor(EXERCISE_LIBRARY_ADDITIONS.length * 0.5));
}

async function rebuildLibraryAndIndexFromBundled() {
  const bundled = buildFromBundled();
  const customRaw = await AsyncStorage.getItem('@ironlog/customExercises');
  const custom = customRaw ? JSON.parse(customRaw) : [];
  const full = [...bundled, ...custom];
  const index = buildIndex(full);
  await AsyncStorage.multiSet([
    [LIBRARY_KEY, JSON.stringify(full)],
    [INDEX_KEY, JSON.stringify(index)],
  ]);
  return index;
}

export async function initExerciseLibrary(onStatus) {
  // Already bootstrapped — instant return
  const existing = await AsyncStorage.getItem(INDEX_KEY);
  if (existing) {
    const parsed = JSON.parse(existing);
    if (!shouldRebuildIndex(parsed)) return parsed;
    return rebuildLibraryAndIndexFromBundled();
  }

  onStatus && onStatus('setting_up');
  const bundled = buildFromBundled();
  const index = buildIndex(bundled);

  // Save bundled exercises immediately — never block on network
  await AsyncStorage.multiSet([
    [LIBRARY_KEY, JSON.stringify(bundled)],
    [INDEX_KEY, JSON.stringify(index)],
  ]);
  onStatus && onStatus('done');

  // Bundled library already contains the full free-exercise-db (873 exercises)
  // No network fetch needed

  return index;
}

async function _fetchAndMerge(bundled) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(FETCH_URL, { signal: controller.signal });
    clearTimeout(tid);
    if (!response.ok) return;
    const dbExercises = await response.json();
    const merged = mergeWithDB(bundled, dbExercises);
    const customRaw = await AsyncStorage.getItem('@ironlog/customExercises');
    const custom = customRaw ? JSON.parse(customRaw) : [];
    const full = [...merged, ...custom];
    const index = buildIndex(full);
    await AsyncStorage.multiSet([
      [LIBRARY_KEY, JSON.stringify(full)],
      [INDEX_KEY, JSON.stringify(index)],
    ]);
  } catch (_) {}
}

export async function getExerciseIndex() {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (shouldRebuildIndex(parsed)) {
    return rebuildLibraryAndIndexFromBundled();
  }
  return parsed;
}

export async function getExerciseById(id) {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  if (!raw) return null;
  const lib = JSON.parse(raw);
  const canonicalId = LEGACY_EXERCISE_ID_ALIASES[id] || id;
  return lib.find((exercise) => exercise.id === canonicalId || toArray(exercise.aliases).includes(id)) || null;
}

export async function getExerciseByName(name) {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  if (!raw) return null;
  const lib = JSON.parse(raw);
  const canonical = resolveCanonicalExerciseName(name);
  const key = normalizeAliasKey(canonical);
  return lib.find((exercise) => {
    if (resolveCanonicalExerciseName(exercise.name) === canonical) return true;
    const aliases = toArray(exercise.aliases).map((alias) => normalizeAliasKey(alias));
    return aliases.includes(key);
  }) || null;
}

export async function saveCustomExercise(exercise) {
  const normalizedExercise = canonicalizeExerciseRecord({ ...exercise, isCustom: true });
  const raw = await AsyncStorage.getItem('@ironlog/customExercises');
  const custom = raw ? JSON.parse(raw) : [];
  const idx = custom.findIndex(e => e.id === normalizedExercise.id);
  if (idx >= 0) custom[idx] = normalizedExercise;
  else custom.push(normalizedExercise);

  // Also update main library and index
  const libRaw = await AsyncStorage.getItem(LIBRARY_KEY);
  const lib = libRaw ? JSON.parse(libRaw) : [];
  const libIdx = lib.findIndex(e => e.id === normalizedExercise.id);
  if (libIdx >= 0) lib[libIdx] = normalizedExercise;
  else lib.push(normalizedExercise);

  const index = buildIndex(lib);
  await AsyncStorage.multiSet([
    ['@ironlog/customExercises', JSON.stringify(custom)],
    [LIBRARY_KEY, JSON.stringify(lib)],
    [INDEX_KEY, JSON.stringify(index)],
  ]);
  upsertCustomExerciseToDb(normalizedExercise).catch((error) => {
    console.warn('Custom exercise SQLite upsert failed:', error);
  });
  return index;
}

export async function deleteCustomExercise(id) {
  const raw = await AsyncStorage.getItem('@ironlog/customExercises');
  const custom = raw ? JSON.parse(raw) : [];
  const updated = custom.filter(e => e.id !== id);

  const libRaw = await AsyncStorage.getItem(LIBRARY_KEY);
  const lib = libRaw ? JSON.parse(libRaw) : [];
  const updatedLib = lib.filter(e => e.id !== id);
  const index = buildIndex(updatedLib);

  await AsyncStorage.multiSet([
    ['@ironlog/customExercises', JSON.stringify(updated)],
    [LIBRARY_KEY, JSON.stringify(updatedLib)],
    [INDEX_KEY, JSON.stringify(index)],
  ]);
  deleteCustomExerciseFromDb(id).catch((error) => {
    console.warn('Custom exercise SQLite delete failed:', error);
  });
  return index;
}

export async function retryLibraryFetch() {
  // Clear index to force re-init on next call
  await AsyncStorage.removeItem(INDEX_KEY);
  await AsyncStorage.removeItem(LIBRARY_KEY);
}
