const ALIAS_ENTRIES = [
  ['pullups', 'Pull-Up'],
  ['pushups', 'Push-Up'],
  ['weighted pull ups', 'Weighted Pull-Up'],
  ['weighted pullup', 'Weighted Pull-Up'],
  ['seated cable rows', 'Seated Cable Row'],
  ['leg extensions', 'Leg Extension'],
  ['hammer curls', 'Hammer Curl'],
  ["worlds greatest stretch", "World's Greatest Stretch"],
  ['world’s greatest stretch', "World's Greatest Stretch"],
  ['bench press smith machine', 'Bench Press - Smith Machine'],
  ['smith machine bench press', 'Bench Press - Smith Machine'],
  ['incline bench press smith machine', 'Incline Bench Press - Smith Machine'],
  ['smith machine incline bench press', 'Incline Bench Press - Smith Machine'],
  ['squat smith machine', 'Squat - Smith Machine'],
  ['smith machine squat', 'Squat - Smith Machine'],
  ['barbell hack squat', 'Hack Squat - Barbell'],
  ['rear delt row barbell', 'Rear Delt Row - Barbell'],
  ['barbell rear delt row', 'Rear Delt Row - Barbell'],
];

export const EXERCISE_ALIAS_MAP = ALIAS_ENTRIES.reduce((acc, [key, canonical]) => {
  acc[key] = canonical;
  return acc;
}, {});

export function normalizeAliasKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveCanonicalExerciseName(value) {
  const key = normalizeAliasKey(value);
  return EXERCISE_ALIAS_MAP[key] || String(value || '').trim();
}

