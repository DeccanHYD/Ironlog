import { buildExerciseProfile, normalizeText, resolveExerciseProfile } from './exerciseProfileEngine';

export const FINE_MUSCLES = [
  'upperChest',
  'midChest',
  'lowerChest',
  'lats',
  'upperBack',
  'traps',
  'spinalErectors',
  'frontDelts',
  'sideDelts',
  'rearDelts',
  'bicepsLong',
  'bicepsShort',
  'brachialis',
  'tricepsLong',
  'tricepsLateral',
  'tricepsMedial',
  'forearms',
  'upperAbs',
  'lowerAbs',
  'obliques',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
];

export const MUSCLE_GROUPS = {
  chest: ['upperChest', 'midChest', 'lowerChest'],
  back: ['lats', 'upperBack', 'traps', 'spinalErectors'],
  shoulders: ['frontDelts', 'sideDelts', 'rearDelts'],
  arms: ['bicepsLong', 'bicepsShort', 'brachialis', 'tricepsLong', 'tricepsLateral', 'tricepsMedial', 'forearms'],
  core: ['upperAbs', 'lowerAbs', 'obliques'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
};

const FAMILY_TEMPLATES = {
  incline_press: { upperChest: 0.36, midChest: 0.18, frontDelts: 0.2, tricepsLong: 0.08, tricepsLateral: 0.1, tricepsMedial: 0.08 },
  decline_press: { lowerChest: 0.38, midChest: 0.2, tricepsLong: 0.08, tricepsLateral: 0.16, tricepsMedial: 0.1, frontDelts: 0.08 },
  horizontal_press: { midChest: 0.38, upperChest: 0.16, frontDelts: 0.16, tricepsLong: 0.08, tricepsLateral: 0.14, tricepsMedial: 0.08 },
  chest_fly: { midChest: 0.46, upperChest: 0.22, lowerChest: 0.14, frontDelts: 0.1, bicepsLong: 0.08 },
  vertical_press: { frontDelts: 0.34, sideDelts: 0.22, tricepsLong: 0.16, tricepsLateral: 0.14, tricepsMedial: 0.08, upperChest: 0.06 },
  vertical_pull: { lats: 0.42, upperBack: 0.16, bicepsLong: 0.12, bicepsShort: 0.12, brachialis: 0.08, forearms: 0.1 },
  horizontal_pull: { upperBack: 0.3, lats: 0.26, rearDelts: 0.12, traps: 0.1, bicepsLong: 0.08, bicepsShort: 0.08, brachialis: 0.06 },
  shrug: { traps: 0.56, upperBack: 0.22, forearms: 0.08, spinalErectors: 0.14 },
  rear_delt: { rearDelts: 0.46, upperBack: 0.22, traps: 0.12, sideDelts: 0.12, bicepsShort: 0.08 },
  lateral_raise: { sideDelts: 0.58, frontDelts: 0.14, rearDelts: 0.12, traps: 0.16 },
  front_raise: { frontDelts: 0.62, upperChest: 0.16, sideDelts: 0.12, traps: 0.1 },
  biceps_curl: { bicepsLong: 0.24, bicepsShort: 0.28, brachialis: 0.22, forearms: 0.26 },
  hammer_curl: { brachialis: 0.32, bicepsLong: 0.2, bicepsShort: 0.18, forearms: 0.3 },
  triceps_pushdown: { tricepsLateral: 0.38, tricepsMedial: 0.32, tricepsLong: 0.18, forearms: 0.12 },
  triceps_overhead: { tricepsLong: 0.42, tricepsLateral: 0.26, tricepsMedial: 0.2, frontDelts: 0.12 },
  squat: { quads: 0.36, glutes: 0.2, adductors: 0.12, spinalErectors: 0.1, hamstrings: 0.12, calves: 0.1 },
  lunge: { quads: 0.28, glutes: 0.24, hamstrings: 0.14, adductors: 0.14, calves: 0.08, abductors: 0.12 },
  hinge: { hamstrings: 0.28, glutes: 0.26, spinalErectors: 0.2, adductors: 0.1, upperBack: 0.08, forearms: 0.08 },
  leg_extension: { quads: 0.78, adductors: 0.12, calves: 0.1 },
  leg_curl: { hamstrings: 0.66, glutes: 0.12, calves: 0.08, adductors: 0.14 },
  calf_raise: { calves: 0.84, hamstrings: 0.08, quads: 0.08 },
  core_crunch: { upperAbs: 0.44, lowerAbs: 0.24, obliques: 0.32 },
  leg_raise: { lowerAbs: 0.4, upperAbs: 0.24, obliques: 0.36 },
  plank: { upperAbs: 0.26, lowerAbs: 0.22, obliques: 0.18, spinalErectors: 0.16, glutes: 0.1, frontDelts: 0.08 },
};

const LIBRARY_GROUP_MAP = {
  chest: { midChest: 0.5, upperChest: 0.3, lowerChest: 0.2 },
  shoulders: { frontDelts: 0.34, sideDelts: 0.34, rearDelts: 0.32 },
  back: { upperBack: 0.42, lats: 0.34, traps: 0.14, spinalErectors: 0.1 },
  'middle back': { upperBack: 0.6, traps: 0.25, spinalErectors: 0.15 },
  'lower back': { spinalErectors: 0.72, upperBack: 0.12, glutes: 0.16 },
  lats: { lats: 0.76, upperBack: 0.16, bicepsShort: 0.08 },
  traps: { traps: 0.74, upperBack: 0.18, rearDelts: 0.08 },
  trap: { traps: 0.74, upperBack: 0.18, rearDelts: 0.08 },
  quadriceps: { quads: 0.78, adductors: 0.12, calves: 0.1 },
  quads: { quads: 0.78, adductors: 0.12, calves: 0.1 },
  hamstrings: { hamstrings: 0.68, glutes: 0.18, adductors: 0.14 },
  glutes: { glutes: 0.62, hamstrings: 0.18, abductors: 0.2 },
  calves: { calves: 0.9, hamstrings: 0.1 },
  adductors: { adductors: 0.78, quads: 0.12, hamstrings: 0.1 },
  abductors: { abductors: 0.72, glutes: 0.28 },
  'front delts': { frontDelts: 0.76, sideDelts: 0.14, upperChest: 0.1 },
  'side delts': { sideDelts: 0.78, frontDelts: 0.12, rearDelts: 0.1 },
  'rear delts': { rearDelts: 0.74, upperBack: 0.18, traps: 0.08 },
  'rotator cuff': { rearDelts: 0.28, sideDelts: 0.16, frontDelts: 0.16, upperBack: 0.12, traps: 0.1, forearms: 0.18 },
  biceps: { bicepsLong: 0.28, bicepsShort: 0.32, brachialis: 0.2, forearms: 0.2 },
  'biceps long head': { bicepsLong: 0.6, bicepsShort: 0.16, brachialis: 0.1, forearms: 0.14 },
  'biceps short head': { bicepsShort: 0.6, bicepsLong: 0.16, brachialis: 0.1, forearms: 0.14 },
  brachialis: { brachialis: 0.56, bicepsLong: 0.18, bicepsShort: 0.14, forearms: 0.12 },
  triceps: { tricepsLong: 0.34, tricepsLateral: 0.34, tricepsMedial: 0.24, forearms: 0.08 },
  'triceps long head': { tricepsLong: 0.62, tricepsLateral: 0.2, tricepsMedial: 0.1, frontDelts: 0.08 },
  'triceps lateral head': { tricepsLateral: 0.62, tricepsLong: 0.2, tricepsMedial: 0.1, forearms: 0.08 },
  'triceps medial head': { tricepsMedial: 0.58, tricepsLateral: 0.2, tricepsLong: 0.14, forearms: 0.08 },
  forearms: { forearms: 0.82, brachialis: 0.18 },
  lat: { lats: 0.76, upperBack: 0.16, bicepsShort: 0.08 },
  'lower back': { spinalErectors: 0.72, upperBack: 0.12, glutes: 0.16 },
  abdominals: { upperAbs: 0.42, lowerAbs: 0.32, obliques: 0.26 },
  'upper abs': { upperAbs: 0.64, lowerAbs: 0.18, obliques: 0.18 },
  'lower abs': { lowerAbs: 0.62, upperAbs: 0.18, obliques: 0.2 },
  obliques: { obliques: 0.74, upperAbs: 0.14, lowerAbs: 0.12 },
  core: { upperAbs: 0.34, lowerAbs: 0.28, obliques: 0.2, spinalErectors: 0.18 },
};

const ANCHOR_OVERRIDES = {
  barbellbenchpress: { upperChest: 0.18, midChest: 0.42, frontDelts: 0.14, tricepsLong: 0.08, tricepsLateral: 0.1, tricepsMedial: 0.08 },
  inclinebarbellbenchpress: { upperChest: 0.36, midChest: 0.16, frontDelts: 0.18, tricepsLong: 0.08, tricepsLateral: 0.12, tricepsMedial: 0.1 },
  dumbbellbenchpress: { upperChest: 0.2, midChest: 0.38, frontDelts: 0.14, tricepsLong: 0.08, tricepsLateral: 0.1, tricepsMedial: 0.1 },
  barbelloverheadpress: { frontDelts: 0.34, sideDelts: 0.22, tricepsLong: 0.16, tricepsLateral: 0.14, tricepsMedial: 0.08, upperChest: 0.06 },
  barbellbentoverrow: { upperBack: 0.3, lats: 0.28, rearDelts: 0.1, traps: 0.12, bicepsShort: 0.08, brachialis: 0.06, spinalErectors: 0.06 },
  barbellfullsquat: { quads: 0.38, glutes: 0.2, adductors: 0.12, hamstrings: 0.1, spinalErectors: 0.1, calves: 0.1 },
  barbelldeadlift: { hamstrings: 0.24, glutes: 0.22, spinalErectors: 0.22, upperBack: 0.12, traps: 0.1, forearms: 0.1 },
  romaniandeadlift: { hamstrings: 0.3, glutes: 0.26, spinalErectors: 0.2, adductors: 0.1, forearms: 0.06, upperBack: 0.08 },
  latpulldown: { lats: 0.46, upperBack: 0.16, bicepsLong: 0.12, bicepsShort: 0.1, brachialis: 0.08, forearms: 0.08 },
  pullup: { lats: 0.42, upperBack: 0.18, bicepsLong: 0.12, bicepsShort: 0.12, brachialis: 0.08, forearms: 0.08 },
  legpress: { quads: 0.42, glutes: 0.2, adductors: 0.14, hamstrings: 0.12, calves: 0.12 },
  legextension: { quads: 0.82, adductors: 0.1, calves: 0.08 },
  legcurlmachine: { hamstrings: 0.72, glutes: 0.1, calves: 0.08, adductors: 0.1 },
  standingcalfraise: { calves: 0.88, hamstrings: 0.06, quads: 0.06 },
  seatedcalfraise: { calves: 0.9, hamstrings: 0.1 },
};

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];
  return [value];
}

function normalizeContributionMap(map) {
  const cleaned = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    if (!FINE_MUSCLES.includes(key)) return;
    cleaned[key] = (cleaned[key] || 0) + Number(value || 0);
  });
  const total = Object.values(cleaned).reduce((sum, value) => sum + value, 0);
  if (!total) return {};
  const normalized = {};
  Object.entries(cleaned).forEach(([key, value]) => {
    normalized[key] = value / total;
  });
  return normalized;
}

function mergeWeightedMaps(parts) {
  const merged = {};
  parts.forEach(({ weight, map }) => {
    Object.entries(map || {}).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + (value * weight);
    });
  });
  return normalizeContributionMap(merged);
}

function extractLibraryHints(exercise) {
  return [
    ...toArray(exercise?.primaryMuscles),
    ...toArray(exercise?.primaryMuscle),
    ...toArray(exercise?.primary),
    ...toArray(exercise?.muscle),
    ...toArray(exercise?.target),
    ...toArray(exercise?.targetMuscle),
    ...toArray(exercise?.bodyPart),
    ...toArray(exercise?.secondaryMuscles),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function buildLibraryMap(exercise) {
  const merged = {};
  extractLibraryHints(exercise).forEach((hint) => {
    const mapping = LIBRARY_GROUP_MAP[hint];
    if (!mapping) return;
    Object.entries(mapping).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + value;
    });
  });
  return normalizeContributionMap(merged);
}

function getAnchorOverride(exercise) {
  const raw = normalizeText(exercise?.name).replace(/[^a-z0-9]+/g, '');
  return ANCHOR_OVERRIDES[raw] ? normalizeContributionMap(ANCHOR_OVERRIDES[raw]) : null;
}

function getFallbackDisplayGroup(exercise, profile) {
  const joined = extractLibraryHints(exercise).join(' ');
  if (joined.includes('chest')) return 'chest';
  if (joined.includes('back') || joined.includes('lats') || joined.includes('traps')) return 'back';
  if (joined.includes('shoulder') || joined.includes('delt') || joined.includes('rotator cuff')) return 'shoulders';
  if (joined.includes('biceps') || joined.includes('triceps') || joined.includes('forearm')) return 'arms';
  if (joined.includes('quad') || joined.includes('hamstring') || joined.includes('glute') || joined.includes('calf')) return 'legs';
  if (joined.includes('adductor') || joined.includes('abductor')) return 'legs';
  if (joined.includes('ab') || joined.includes('oblique') || profile?.lane === 'core') return 'core';
  return profile?.primaryRegion || 'general';
}

export function buildExerciseContribution(exercise, profileCatalog = null) {
  const safeExercise = exercise || {};
  const profile = resolveExerciseProfile(safeExercise, profileCatalog);
  const anchor = getAnchorOverride(safeExercise);
  const template = normalizeContributionMap(FAMILY_TEMPLATES[profile.family] || {});
  const library = buildLibraryMap(safeExercise);

  let contributions = {};
  let source = 'fallback';
  let confidence = 0.34;

  if (anchor) {
    contributions = anchor;
    source = 'anchor_override';
    confidence = 0.93;
  } else if (Object.keys(template).length && Object.keys(library).length) {
    contributions = mergeWeightedMaps([{ weight: 0.72, map: template }, { weight: 0.28, map: library }]);
    source = 'family_plus_library';
    confidence = Math.min(0.88, Math.max(profile.confidence, 0.74));
  } else if (Object.keys(template).length) {
    contributions = template;
    source = 'family_template';
    confidence = Math.max(profile.confidence, 0.68);
  } else if (Object.keys(library).length) {
    contributions = library;
    source = 'library_expansion';
    confidence = 0.54;
  }

  const sorted = Object.entries(contributions).sort((a, b) => b[1] - a[1]);
  return {
    exerciseId: safeExercise.exerciseId || safeExercise.id || safeExercise.name || 'unknown_exercise',
    exerciseName: safeExercise.name || 'Unknown Exercise',
    profile,
    source,
    confidence,
    contributions,
    primaryMuscles: sorted.filter(([, value]) => value >= 0.16).map(([key]) => key),
    displayFallbackGroup: confidence < 0.55 ? getFallbackDisplayGroup(safeExercise, profile) : null,
  };
}

export function buildExerciseContributionCatalog(exercises = [], profileCatalog = null) {
  const byId = {};
  const byName = {};
  exercises.forEach((exercise) => {
    if (!exercise) return;
    const result = buildExerciseContribution(exercise, profileCatalog);
    byId[result.exerciseId] = result;
    byName[normalizeText(result.exerciseName)] = result;
  });
  return { byId, byName };
}

export function resolveExerciseContribution(exercise, contributionCatalog = null, profileCatalog = null) {
  const id = exercise?.exerciseId || exercise?.id || exercise?.name;
  const nameKey = normalizeText(exercise?.name);
  if (contributionCatalog?.byId?.[id]) return contributionCatalog.byId[id];
  if (contributionCatalog?.byName?.[nameKey]) return contributionCatalog.byName[nameKey];
  return buildExerciseContribution(exercise, profileCatalog);
}

export function buildExerciseMap(exercises = []) {
  const result = {};
  exercises.forEach((exercise) => {
    if (!exercise) return;
    const profile = buildExerciseProfile(exercise);
    const contribution = buildExerciseContribution(exercise);
    result[exercise.name] = {
      patternKey: profile.family,
      contribution: contribution.contributions,
      confidence: contribution.confidence,
      displayFallbackGroup: contribution.displayFallbackGroup,
      primaryMuscles: contribution.primaryMuscles,
      profile,
    };
  });
  return result;
}

export function aggregateByGroups(muscleMap = {}) {
  const grouped = {};
  Object.entries(MUSCLE_GROUPS).forEach(([group, keys]) => {
    grouped[group] = keys.reduce((sum, key) => sum + (muscleMap[key] || 0), 0);
  });
  return grouped;
}
