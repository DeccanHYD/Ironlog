const ex = (name, exerciseId, sets, reps, equipment) => ({
  name,
  exerciseId,
  sets,
  reps,
  equipment,
});

const day = (name, tag, exercises) => ({
  name,
  tag,
  exercises,
});

const ACCESSORY_POOL = {
  PUSH: [
    ex('Lateral Raise', 'lateral-raise', 4, 15, 'Dumbbell'),
    ex('Cable Fly', 'cable-fly', 3, 15, 'Cable'),
    ex('Tricep Pushdown', 'tricep-pushdown', 3, 12, 'Cable'),
    ex('Overhead Tricep Extension', 'overhead-tricep-extension', 3, 12, 'Cable'),
    ex('Cable Crunch', 'cable-crunch', 3, 15, 'Cable'),
  ],
  PULL: [
    ex('Face Pull', 'face-pull', 3, 15, 'Cable'),
    ex('Seated Cable Row', 'seated-cable-row', 3, 12, 'Cable'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
    ex('Barbell Curl', 'barbell-curl', 3, 10, 'Barbell'),
    ex('Back Extension', 'back-extension', 3, 15, 'Bodyweight'),
  ],
  LEGS: [
    ex('Leg Extension', 'leg-extension', 3, 15, 'Machine'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Walking Lunge', 'walking-lunge', 3, 12, 'Dumbbell'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 12, 'Machine'),
    ex('Hip Thrust', 'hip-thrust', 3, 10, 'Barbell'),
  ],
  UPPER: [
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 3, 10, 'Dumbbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 10, 'Cable'),
    ex('Lateral Raise', 'lateral-raise', 3, 15, 'Dumbbell'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
    ex('Tricep Pushdown', 'tricep-pushdown', 3, 12, 'Cable'),
  ],
  LOWER: [
    ex('Leg Press', 'leg-press', 3, 12, 'Machine'),
    ex('Romanian Deadlift', 'romanian-deadlift', 3, 10, 'Barbell'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Leg Extension', 'leg-extension', 3, 15, 'Machine'),
    ex('Calf Raise', 'calf-raise', 4, 15, 'Machine'),
  ],
  ARMS: [
    ex('EZ-Bar Curl', 'ez-bar-curl', 3, 10, 'Barbell'),
    ex('Incline Dumbbell Curl', 'incline-dumbbell-curl', 3, 12, 'Dumbbell'),
    ex('Tricep Rope Pushdown', 'tricep-rope-pushdown', 3, 12, 'Cable'),
    ex('Skull Crusher', 'skull-crusher', 3, 10, 'Barbell'),
    ex('Wrist Curl', 'wrist-curl', 3, 15, 'Barbell'),
  ],
  CONDITIONING: [
    ex('Air Bike', 'air_bike', 8, 20, 'Conditioning'),
    ex('Running', 'running', 4, 400, 'Conditioning'),
    ex('Spider Crawl', 'spider_crawl', 4, 20, 'Bodyweight'),
    ex('Plank', 'plank', 4, 60, 'Bodyweight'),
    ex('Hanging Leg Raise', 'hanging-leg-raise', 3, 12, 'Bodyweight'),
  ],
  CALI: [
    ex('Push-Up', 'push-up', 4, 15, 'Bodyweight'),
    ex('Pull-Up', 'pull-up', 4, 8, 'Bodyweight'),
    ex('Dips', 'dips', 4, 10, 'Bodyweight'),
    ex('Bodyweight Squat', 'bodyweight-squat', 4, 20, 'Bodyweight'),
    ex('Hollow Hold', 'hollow-hold', 3, 45, 'Bodyweight'),
  ],
};

function detectDayFocus(dayName, dayTag) {
  const text = `${dayName || ''} ${dayTag || ''}`.toUpperCase();
  if (/CALI|BODYWEIGHT/.test(text)) return 'CALI';
  if (/BAND/.test(text)) return 'BAND';
  if (/CONDITION|CARDIO|ENGINE/.test(text)) return 'CONDITIONING';
  if (/PUSH|CHEST|SHOULDER/.test(text)) return 'PUSH';
  if (/PULL|BACK/.test(text)) return 'PULL';
  if (/ARM/.test(text)) return 'ARMS';
  if (/LEG|LOWER|GLUTE|QUAD|HAM/.test(text)) return 'LEGS';
  if (/UPPER/.test(text)) return 'UPPER';
  return 'UPPER';
}

function enrichDayVolume(dayDefinition, allowedEquipment = []) {
  const clonedExercises = dayDefinition.exercises.map((exercise) => ({ ...exercise }));
  const minExercises = 6;
  if (clonedExercises.length >= minExercises) {
    return { ...dayDefinition, exercises: clonedExercises };
  }

  const pool = ACCESSORY_POOL[detectDayFocus(dayDefinition.name, dayDefinition.tag)] || [];
  const allowed = new Set((allowedEquipment || []).map((item) => String(item).toLowerCase()));
  const existingNames = new Set(clonedExercises.map((exercise) => exercise.name.toLowerCase()));

  for (const candidate of pool) {
    if (clonedExercises.length >= minExercises) break;
    if (existingNames.has(candidate.name.toLowerCase())) continue;
    const candidateEquipment = String(candidate.equipment || '').toLowerCase();
    if (candidateEquipment !== 'bodyweight' && allowed.size > 0 && !allowed.has(candidateEquipment)) continue;
    clonedExercises.push({ ...candidate });
    existingNames.add(candidate.name.toLowerCase());
  }

  return { ...dayDefinition, exercises: clonedExercises };
}

const cloneDays = (days, allowedEquipment = []) =>
  days.map((d) =>
    enrichDayVolume({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e })),
    }, allowedEquipment)
  );

export const PROGRAM_TEMPLATE_CATEGORIES = [
  { id: 'BEGINNER', name: 'Beginner', description: 'Simple foundations.', sortOrder: 100 },
  { id: 'STRENGTH', name: 'Strength', description: 'Low-rep progression.', sortOrder: 200 },
  { id: 'HYPERTROPHY', name: 'Hypertrophy', description: 'High-volume growth.', sortOrder: 300 },
  { id: 'AESTHETIC', name: 'Aesthetic', description: 'Physique-focused training.', sortOrder: 400 },
  { id: 'LOWER_BODY_GLUTES', name: 'Lower Body / Glutes', description: 'Leg emphasis.', sortOrder: 500 },
  { id: 'SPECIALIZATION', name: 'Specialization', description: 'Lagging-muscle focus.', sortOrder: 600 },
  { id: 'HOME_MINIMAL', name: 'Home / Minimal Equipment', description: 'Home-friendly plans.', sortOrder: 700 },
  { id: 'BODYWEIGHT_CALISTHENICS', name: 'Bodyweight / Calisthenics', description: 'Bodyweight-first plans.', sortOrder: 800 },
  { id: 'FAT_LOSS_CONDITIONING', name: 'Fat Loss / Conditioning', description: 'Lifting + conditioning.', sortOrder: 900 },
];

const DAY_LIBRARY = {
  FULL_BODY_A: day('FULL BODY A', 'Foundation', [
    ex('Barbell Squat', 'barbell-squat', 3, 8, 'Barbell'),
    ex('Barbell Bench Press', 'barbell-bench-press', 3, 8, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 3, 8, 'Barbell'),
    ex('Plank', 'plank', 3, 45, 'Bodyweight'),
  ]),
  FULL_BODY_B: day('FULL BODY B', 'Foundation', [
    ex('Deadlift', 'deadlift', 3, 5, 'Barbell'),
    ex('Overhead Press', 'overhead-press', 3, 8, 'Barbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 10, 'Cable'),
    ex('Lateral Raise', 'lateral-raise', 2, 15, 'Dumbbell'),
  ]),
  FULL_BODY_C: day('FULL BODY C', 'Foundation', [
    ex('Front Squat', 'front-squat', 3, 6, 'Barbell'),
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 3, 10, 'Dumbbell'),
    ex('Seated Cable Row', 'seated-cable-row', 3, 10, 'Cable'),
    ex('Tricep Pushdown', 'tricep-pushdown', 2, 12, 'Cable'),
  ]),
  MINIMAL_FULL_BODY_A: day('MINIMAL A', 'Efficient full body', [
    ex('Barbell Squat', 'barbell-squat', 3, 5, 'Barbell'),
    ex('Barbell Bench Press', 'barbell-bench-press', 3, 6, 'Barbell'),
    ex('Seated Cable Row', 'seated-cable-row', 3, 8, 'Cable'),
    ex('Plank', 'plank', 3, 45, 'Bodyweight'),
  ]),
  MINIMAL_FULL_BODY_B: day('MINIMAL B', 'Efficient full body', [
    ex('Romanian Deadlift', 'romanian-deadlift', 3, 6, 'Barbell'),
    ex('Overhead Press', 'overhead-press', 3, 6, 'Barbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 8, 'Cable'),
    ex('Hanging Leg Raise', 'hanging-leg-raise', 3, 12, 'Bodyweight'),
  ]),
  UPPER_A: day('UPPER A', 'Upper split', [
    ex('Barbell Bench Press', 'barbell-bench-press', 4, 6, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 4, 6, 'Barbell'),
    ex('Overhead Press', 'overhead-press', 3, 8, 'Barbell'),
    ex('Pull-Up', 'pull-up', 3, 8, 'Bodyweight'),
  ]),
  UPPER_B: day('UPPER B', 'Upper split', [
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 4, 10, 'Dumbbell'),
    ex('Lat Pulldown', 'lat-pulldown', 4, 10, 'Cable'),
    ex('Lateral Raise', 'lateral-raise', 3, 15, 'Dumbbell'),
    ex('Face Pull', 'face-pull', 3, 15, 'Cable'),
  ]),
  LOWER_A: day('LOWER A', 'Lower split', [
    ex('Barbell Squat', 'barbell-squat', 4, 6, 'Barbell'),
    ex('Romanian Deadlift', 'romanian-deadlift', 3, 8, 'Barbell'),
    ex('Leg Press', 'leg-press', 3, 10, 'Machine'),
    ex('Calf Raise', 'calf-raise', 3, 15, 'Machine'),
  ]),
  LOWER_B: day('LOWER B', 'Lower split', [
    ex('Hack Squat', 'hack-squat', 4, 10, 'Machine'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Leg Extension', 'leg-extension', 3, 15, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 12, 'Machine'),
  ]),
  UPPER_POWER: day('UPPER POWER', 'Strength', [
    ex('Barbell Bench Press', 'barbell-bench-press', 4, 5, 'Barbell'),
    ex('Weighted Pull-Up', 'weighted-pull-up', 4, 6, 'Bodyweight'),
    ex('Overhead Press', 'overhead-press', 3, 5, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 3, 6, 'Barbell'),
  ]),
  LOWER_POWER: day('LOWER POWER', 'Strength', [
    ex('Barbell Squat', 'barbell-squat', 4, 4, 'Barbell'),
    ex('Deadlift', 'deadlift', 2, 3, 'Barbell'),
    ex('Leg Curl', 'leg-curl', 3, 10, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 3, 12, 'Machine'),
  ]),
  BARBELL_A: day('WORKOUT A', 'Linear progression', [
    ex('Barbell Squat', 'barbell-squat', 3, 5, 'Barbell'),
    ex('Barbell Bench Press', 'barbell-bench-press', 3, 5, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 3, 5, 'Barbell'),
  ]),
  BARBELL_B: day('WORKOUT B', 'Linear progression', [
    ex('Barbell Squat', 'barbell-squat', 3, 5, 'Barbell'),
    ex('Overhead Press', 'overhead-press', 3, 5, 'Barbell'),
    ex('Deadlift', 'deadlift', 1, 5, 'Barbell'),
  ]),
  BARBELL_C: day('WORKOUT C', 'Linear progression', [
    ex('Front Squat', 'front-squat', 3, 5, 'Barbell'),
    ex('Incline Barbell Press', 'incline-barbell-press', 3, 6, 'Barbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 8, 'Cable'),
  ]),
  PUSH_A: day('PUSH A', 'Push', [
    ex('Barbell Bench Press', 'barbell-bench-press', 4, 8, 'Barbell'),
    ex('Overhead Press', 'overhead-press', 3, 8, 'Barbell'),
    ex('Cable Fly', 'cable-fly', 3, 12, 'Cable'),
    ex('Tricep Pushdown', 'tricep-pushdown', 3, 12, 'Cable'),
  ]),
  PUSH_B: day('PUSH B', 'Push', [
    ex('Incline Barbell Press', 'incline-barbell-press', 4, 8, 'Barbell'),
    ex('Dumbbell Shoulder Press', 'dumbbell-shoulder-press', 3, 10, 'Dumbbell'),
    ex('Lateral Raise', 'lateral-raise', 4, 15, 'Dumbbell'),
    ex('Overhead Tricep Extension', 'overhead-tricep-extension', 3, 12, 'Cable'),
  ]),
  PULL_A: day('PULL A', 'Pull', [
    ex('Deadlift', 'deadlift', 4, 5, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 4, 8, 'Barbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 10, 'Cable'),
    ex('Barbell Curl', 'barbell-curl', 3, 10, 'Barbell'),
  ]),
  PULL_B: day('PULL B', 'Pull', [
    ex('Weighted Pull-Up', 'weighted-pull-up', 4, 6, 'Bodyweight'),
    ex('Seated Cable Row', 'seated-cable-row', 4, 10, 'Cable'),
    ex('Face Pull', 'face-pull', 3, 15, 'Cable'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
  ]),
  LEGS_A: day('LEGS A', 'Legs', [
    ex('Barbell Squat', 'barbell-squat', 4, 8, 'Barbell'),
    ex('Romanian Deadlift', 'romanian-deadlift', 4, 10, 'Barbell'),
    ex('Leg Press', 'leg-press', 3, 12, 'Machine'),
    ex('Calf Raise', 'calf-raise', 4, 15, 'Machine'),
  ]),
  LEGS_B: day('LEGS B', 'Legs', [
    ex('Front Squat', 'front-squat', 4, 6, 'Barbell'),
    ex('Hack Squat', 'hack-squat', 4, 10, 'Machine'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 12, 'Machine'),
  ]),
  CHEST_DAY: day('CHEST', 'Bro split', [
    ex('Barbell Bench Press', 'barbell-bench-press', 4, 8, 'Barbell'),
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 4, 10, 'Dumbbell'),
    ex('Cable Fly', 'cable-fly', 4, 12, 'Cable'),
    ex('Skull Crusher', 'skull-crusher', 3, 10, 'Barbell'),
  ]),
  BACK_DAY: day('BACK', 'Bro split', [
    ex('Weighted Pull-Up', 'weighted-pull-up', 4, 6, 'Bodyweight'),
    ex('Barbell Row', 'barbell-row', 4, 8, 'Barbell'),
    ex('Lat Pulldown', 'lat-pulldown', 4, 10, 'Cable'),
    ex('Seated Cable Row', 'seated-cable-row', 3, 12, 'Cable'),
  ]),
  SHOULDERS_DAY: day('SHOULDERS', 'Bro split', [
    ex('Overhead Press', 'overhead-press', 4, 8, 'Barbell'),
    ex('Dumbbell Shoulder Press', 'dumbbell-shoulder-press', 3, 10, 'Dumbbell'),
    ex('Lateral Raise', 'lateral-raise', 5, 15, 'Dumbbell'),
    ex('Face Pull', 'face-pull', 4, 15, 'Cable'),
  ]),
  ARMS_DAY: day('ARMS', 'Bro split', [
    ex('Barbell Curl', 'barbell-curl', 4, 10, 'Barbell'),
    ex('Hammer Curl', 'hammer-curl', 4, 12, 'Dumbbell'),
    ex('Tricep Pushdown', 'tricep-pushdown', 4, 12, 'Cable'),
    ex('Overhead Tricep Extension', 'overhead-tricep-extension', 3, 12, 'Cable'),
  ]),
  CONDITIONING_DAY: day('CONDITIONING', 'Engine', [
    ex('Air Bike', 'air_bike', 6, 20, 'Conditioning'),
    ex('Reverse Crunch', 'reverse_crunch', 3, 15, 'Bodyweight'),
    ex('Plank', 'plank', 4, 45, 'Bodyweight'),
  ]),
  CALI_PUSH: day('CALI PUSH', 'Calisthenics', [
    ex('Push-Up', 'push-up', 4, 10, 'Bodyweight'),
    ex('Dips', 'dips', 3, 8, 'Bodyweight'),
    ex('Push-Up', 'push-up', 3, 8, 'Bodyweight'),
    ex('Plank', 'plank', 4, 45, 'Bodyweight'),
    ex('Sit-Up', 'situp', 3, 12, 'Bodyweight'),
  ]),
  CALI_PULL: day('CALI PULL', 'Calisthenics', [
    ex('Pull-Up', 'pull-up', 4, 6, 'Bodyweight'),
    ex('Inverted Row', 'inverted-row', 4, 10, 'Bodyweight'),
    ex('Single-Leg Romanian Deadlift', 'single-leg-romanian-deadlift', 3, 10, 'Bodyweight'),
    ex('Hanging Leg Raise', 'hanging_leg_raise', 3, 10, 'Bodyweight'),
    ex('Reverse Crunch', 'reverse_crunch', 3, 12, 'Bodyweight'),
  ]),
  CALI_MIXED: day('CALI MIXED', 'Calisthenics', [
    ex('Bodyweight Squat', 'bodyweight-squat', 4, 15, 'Bodyweight'),
    ex('Split Squat', 'split-squat', 3, 10, 'Bodyweight'),
    ex('Glute Bridge', 'glute-bridge', 3, 15, 'Bodyweight'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 15, 'Bodyweight'),
  ]),
  HOME_DB_UPPER: day('HOME UPPER', 'Dumbbell only', [
    ex('Dumbbell Bench Press', 'dumbbell-bench-press', 4, 10, 'Dumbbell'),
    ex('Dumbbell Shoulder Press', 'dumbbell-shoulder-press', 4, 10, 'Dumbbell'),
    ex('One-Arm Dumbbell Row', 'one-arm-dumbbell-row', 4, 10, 'Dumbbell'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
  ]),
  HOME_DB_LOWER: day('HOME LOWER', 'Dumbbell only', [
    ex('Goblet Squat', 'goblet-squat', 4, 12, 'Dumbbell'),
    ex('Romanian Deadlift', 'romanian-deadlift', 4, 12, 'Dumbbell'),
    ex('Walking Lunge', 'walking-lunge', 3, 10, 'Dumbbell'),
    ex('Plank', 'plank', 3, 60, 'Bodyweight'),
  ]),
  HOME_BENCH_PUSH: day('HOME PUSH', 'Dumbbell + bench', [
    ex('Dumbbell Bench Press', 'dumbbell-bench-press', 4, 10, 'Dumbbell'),
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 4, 10, 'Dumbbell'),
    ex('Dumbbell Shoulder Press', 'dumbbell-shoulder-press', 3, 10, 'Dumbbell'),
    ex('Lateral Raise', 'lateral-raise', 3, 15, 'Dumbbell'),
  ]),
  HOME_BENCH_PULL: day('HOME PULL', 'Dumbbell + bench', [
    ex('One-Arm Dumbbell Row', 'one-arm-dumbbell-row', 4, 10, 'Dumbbell'),
    ex('One-Arm Dumbbell Row', 'one-arm-dumbbell-row', 3, 12, 'Dumbbell'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
    ex('Incline Dumbbell Curl', 'incline-dumbbell-curl', 3, 12, 'Dumbbell'),
  ]),
  GLUTE_QUAD_FOCUS: day('GLUTE + QUAD', 'Lower focus', [
    ex('Barbell Squat', 'barbell-squat', 4, 6, 'Barbell'),
    ex('Leg Press', 'leg-press', 3, 10, 'Machine'),
    ex('Walking Lunge', 'walking-lunge', 3, 10, 'Dumbbell'),
    ex('Leg Extension', 'leg-extension', 2, 15, 'Machine'),
  ]),
  GLUTE_HAM_FOCUS: day('GLUTE + HAM', 'Lower focus', [
    ex('Romanian Deadlift', 'romanian-deadlift', 4, 8, 'Barbell'),
    ex('Hip Thrust', 'hip-thrust', 4, 8, 'Barbell'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 12, 'Machine'),
  ]),
  GLUTE_PUMP_FOCUS: day('GLUTE PUMP', 'Lower focus', [
    ex('Hack Squat', 'hack-squat', 3, 10, 'Machine'),
    ex('Walking Lunge', 'walking-lunge', 3, 12, 'Dumbbell'),
    ex('Hip Thrust', 'hip-thrust', 3, 12, 'Barbell'),
    ex('Leg Curl', 'leg-curl', 2, 15, 'Machine'),
  ]),
  ARNOLD_CHEST_BACK_HEAVY: day('CHEST + BACK (HEAVY)', 'Arnold', [
    ex('Barbell Bench Press', 'barbell-bench-press', 4, 6, 'Barbell'),
    ex('Barbell Row', 'barbell-row', 4, 6, 'Barbell'),
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 3, 8, 'Dumbbell'),
    ex('Lat Pulldown', 'lat-pulldown', 3, 8, 'Cable'),
  ]),
  ARNOLD_SHOULDERS_ARMS_HEAVY: day('SHOULDERS + ARMS (HEAVY)', 'Arnold', [
    ex('Overhead Press', 'overhead-press', 4, 6, 'Barbell'),
    ex('Lateral Raise', 'lateral-raise', 3, 12, 'Dumbbell'),
    ex('Barbell Curl', 'barbell-curl', 3, 8, 'Barbell'),
    ex('Skull Crusher', 'skull-crusher', 3, 8, 'Barbell'),
  ]),
  ARNOLD_LEGS_HEAVY: day('LEGS (HEAVY)', 'Arnold', [
    ex('Barbell Squat', 'barbell-squat', 4, 5, 'Barbell'),
    ex('Romanian Deadlift', 'romanian-deadlift', 3, 8, 'Barbell'),
    ex('Leg Press', 'leg-press', 3, 10, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 12, 'Machine'),
  ]),
  ARNOLD_CHEST_BACK_VOLUME: day('CHEST + BACK (VOLUME)', 'Arnold', [
    ex('Incline Dumbbell Press', 'incline-dumbbell-press', 4, 10, 'Dumbbell'),
    ex('Seated Cable Row', 'seated-cable-row', 4, 10, 'Cable'),
    ex('Cable Fly', 'cable-fly', 3, 12, 'Cable'),
    ex('Face Pull', 'face-pull', 3, 15, 'Cable'),
  ]),
  ARNOLD_SHOULDERS_ARMS_VOLUME: day('SHOULDERS + ARMS (VOLUME)', 'Arnold', [
    ex('Dumbbell Shoulder Press', 'dumbbell-shoulder-press', 3, 10, 'Dumbbell'),
    ex('Lateral Raise', 'lateral-raise', 4, 15, 'Dumbbell'),
    ex('Hammer Curl', 'hammer-curl', 3, 12, 'Dumbbell'),
    ex('Tricep Pushdown', 'tricep-pushdown', 3, 12, 'Cable'),
  ]),
  ARNOLD_LEGS_VOLUME: day('LEGS (VOLUME)', 'Arnold', [
    ex('Hack Squat', 'hack-squat', 4, 10, 'Machine'),
    ex('Leg Curl', 'leg-curl', 3, 12, 'Machine'),
    ex('Leg Extension', 'leg-extension', 3, 15, 'Machine'),
    ex('Standing Calf Raise', 'standing-calf-raise', 4, 15, 'Machine'),
  ]),
  BAND_UPPER: day('BAND UPPER', 'Band only', [
    ex('Push-Up', 'push-up', 4, 15, 'Bodyweight'),
    ex('Band Row', 'band-row', 4, 15, 'Resistance Band'),
    ex('Push-Up', 'push-up', 4, 12, 'Bodyweight'),
    ex('Band Curl', 'band-curl', 3, 15, 'Resistance Band'),
  ]),
  BAND_LOWER: day('BAND LOWER', 'Band only', [
    ex('Band Squat', 'band-squat', 4, 15, 'Resistance Band'),
    ex('Band Squat', 'band-squat', 4, 15, 'Resistance Band'),
    ex('Glute Bridge', 'glute-bridge', 4, 15, 'Bodyweight'),
    ex('Band Calf Raise', 'band-calf-raise', 4, 20, 'Resistance Band'),
  ]),
};

const BLUEPRINTS = {
  FULL_BODY_BEGINNER_3: ['FULL_BODY_A', 'FULL_BODY_B', 'FULL_BODY_C'],
  UPPER_LOWER_4: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'],
  BODYWEIGHT_3: ['CALI_PUSH', 'CALI_PULL', 'CALI_MIXED'],
  UPPER_LOWER_STRENGTH_4: ['UPPER_POWER', 'LOWER_POWER', 'UPPER_B', 'LOWER_B'],
  NOVICE_BARBELL_3: ['BARBELL_A', 'BARBELL_B', 'BARBELL_C'],
  POWERBUILDING_4: ['UPPER_POWER', 'LOWER_POWER', 'PUSH_B', 'LEGS_B'],
  POWERBUILDING_5: ['UPPER_POWER', 'LOWER_POWER', 'PUSH_A', 'PULL_B', 'LEGS_B'],
  HYPERTROPHY_5: ['PUSH_A', 'PULL_A', 'LEGS_A', 'UPPER_B', 'LOWER_B'],
  PPL_5: ['PUSH_A', 'PULL_A', 'LEGS_A', 'PUSH_B', 'PULL_B'],
  PPL_6: ['PUSH_A', 'PULL_A', 'LEGS_A', 'PUSH_B', 'PULL_B', 'LEGS_B'],
  BRO_SPLIT_5: ['CHEST_DAY', 'BACK_DAY', 'SHOULDERS_DAY', 'ARMS_DAY', 'LEGS_A'],
  ARNOLD_6: ['ARNOLD_CHEST_BACK_HEAVY', 'ARNOLD_SHOULDERS_ARMS_HEAVY', 'ARNOLD_LEGS_HEAVY', 'ARNOLD_CHEST_BACK_VOLUME', 'ARNOLD_SHOULDERS_ARMS_VOLUME', 'ARNOLD_LEGS_VOLUME'],
  AESTHETIC_5: ['UPPER_B', 'LOWER_A', 'SHOULDERS_DAY', 'BACK_DAY', 'ARMS_DAY'],
  RECOMP_5: ['UPPER_A', 'LOWER_A', 'CONDITIONING_DAY', 'UPPER_B', 'LOWER_B'],
  UPPER_BIAS_4: ['UPPER_POWER', 'LOWER_A', 'UPPER_B', 'SHOULDERS_DAY'],
  LOWER_FOCUS_4: ['LOWER_A', 'UPPER_B', 'LOWER_B', 'LEGS_B'],
  GLUTES_LEGS_5: ['GLUTE_QUAD_FOCUS', 'UPPER_B', 'GLUTE_HAM_FOCUS', 'GLUTE_PUMP_FOCUS'],
  ATHLETIC_LEGS_4: ['LOWER_POWER', 'CONDITIONING_DAY', 'LEGS_A', 'UPPER_A'],
  ARM_SPECIALIZATION_5: ['ARMS_DAY', 'UPPER_A', 'PULL_B', 'ARMS_DAY', 'LOWER_A'],
  CHEST_SPECIALIZATION_5: ['CHEST_DAY', 'UPPER_A', 'LOWER_A', 'CHEST_DAY', 'UPPER_B'],
  BACK_SPECIALIZATION_5: ['BACK_DAY', 'PULL_A', 'LOWER_A', 'BACK_DAY', 'ARMS_DAY'],
  SHOULDER_SPECIALIZATION_5: ['SHOULDERS_DAY', 'UPPER_A', 'LOWER_A', 'SHOULDERS_DAY', 'PUSH_B'],
  HOME_DB_ONLY_4: ['HOME_DB_UPPER', 'HOME_DB_LOWER', 'HOME_DB_UPPER', 'HOME_DB_LOWER'],
  HOME_DB_BENCH_4: ['HOME_BENCH_PUSH', 'HOME_DB_LOWER', 'HOME_BENCH_PULL', 'HOME_DB_LOWER'],
  BAND_ONLY_4: ['BAND_UPPER', 'BAND_LOWER', 'BAND_UPPER', 'BAND_LOWER'],
  CALISTHENICS_BEGINNER_3: ['CALI_PUSH', 'CALI_PULL', 'CALI_MIXED'],
  CALISTHENICS_STRENGTH_4: ['CALI_PUSH', 'CALI_PULL', 'CALI_MIXED', 'CALI_PULL'],
  FAT_LOSS_HYBRID_5: ['FULL_BODY_A', 'CONDITIONING_DAY', 'FULL_BODY_B', 'CONDITIONING_DAY', 'UPPER_B'],
  INTERFERENCE_AWARE_RECOMP_5: ['UPPER_A', 'CONDITIONING_DAY', 'LOWER_B', 'UPPER_B', 'CONDITIONING_DAY'],
  LIFT_3_CARDIO_2: ['FULL_BODY_A', 'CONDITIONING_DAY', 'FULL_BODY_B', 'CONDITIONING_DAY', 'FULL_BODY_C'],
  ATHLETIC_CONDITIONING_5: ['UPPER_POWER', 'CONDITIONING_DAY', 'LOWER_POWER', 'UPPER_B', 'CONDITIONING_DAY'],
  MINIMAL_FULL_BODY_3: ['MINIMAL_FULL_BODY_A', 'MINIMAL_FULL_BODY_B', 'MINIMAL_FULL_BODY_A'],
};

const buildDays = (blueprintKey, allowedEquipment = []) => cloneDays((BLUEPRINTS[blueprintKey] || []).map((key) => DAY_LIBRARY[key]).filter(Boolean), allowedEquipment);

function deriveTemplateEquipment(template, days = []) {
  const declared = Array.isArray(template.equipment) ? template.equipment : [];
  const set = new Set(declared);
  for (const dayItem of days) {
    for (const exercise of dayItem.exercises || []) {
      if (exercise?.equipment) set.add(exercise.equipment);
    }
  }
  return Array.from(set);
}

function deriveGoalBias(template) {
  const category = String(template.category || '').toUpperCase();
  const goal = String(template.goal || '').toLowerCase();
  if (category === 'STRENGTH' || goal.includes('strong')) return 'strength';
  if (category === 'FAT_LOSS_CONDITIONING' || goal.includes('fat') || goal.includes('conditioning')) return 'fat_loss';
  if (category === 'AESTHETIC' || goal.includes('physique') || goal.includes('proportion')) return 'aesthetics';
  if (category === 'SPECIALIZATION') return 'specialization';
  return 'hypertrophy';
}

function deriveSplitType(template) {
  const name = String(template.name || '').toLowerCase();
  if (name.includes('upper / lower') || name.includes('upper/lower')) return 'upper_lower';
  if (name.includes('push / pull / legs') || name.includes('push/pull/legs')) return 'ppl';
  if (name.includes('bro split')) return 'bro_split';
  if (name.includes('arnold')) return 'arnold';
  if (name.includes('full body')) return 'full_body';
  if (name.includes('calisthenics') || name.includes('bodyweight')) return 'bodyweight';
  if (name.includes('home')) return 'home_split';
  return 'specialized_split';
}

function deriveMinimumEquipment(template) {
  const equipment = Array.isArray(template.equipment) ? template.equipment : [];
  if (equipment.includes('Barbell')) return 'barbell';
  if (equipment.includes('Dumbbell')) return 'dumbbell';
  if (equipment.includes('Resistance Band')) return 'resistance_band';
  if (equipment.includes('Bodyweight')) return 'bodyweight';
  return 'mixed_gym';
}

function deriveRecoveryDemand(template) {
  if (template.daysPerWeek >= 6) return 'high';
  if (template.daysPerWeek >= 5) return 'moderate_high';
  if (template.daysPerWeek >= 4) return 'moderate';
  return 'low';
}

function deriveAdherenceFloor(template) {
  if (template.daysPerWeek >= 6) return 78;
  if (template.daysPerWeek >= 5) return 68;
  if (template.daysPerWeek >= 4) return 58;
  return 45;
}

function deriveSpecializationType(template) {
  const name = String(template.name || '').toLowerCase();
  if (!String(template.category || '').toUpperCase().includes('SPECIALIZATION')) return null;
  if (name.includes('arm')) return 'arms';
  if (name.includes('chest')) return 'chest';
  if (name.includes('back')) return 'back';
  if (name.includes('shoulder')) return 'shoulders';
  return 'general';
}

function deriveProgressionModel(template) {
  const category = String(template.category || '').toUpperCase();
  if (category === 'STRENGTH') return 'linear_progression_with_backoff';
  if (category === 'FAT_LOSS_CONDITIONING') return 'double_progression_conservative';
  return 'double_progression';
}

function deriveDeloadProtocol(template) {
  if (template.daysPerWeek >= 6) return 'every_4_6_weeks_or_2_consecutive_underperformances';
  if (template.daysPerWeek >= 5) return 'every_5_7_weeks_or_2_consecutive_underperformances';
  return 'every_6_8_weeks_or_3_consecutive_underperformances';
}

function deriveEffortTarget(template) {
  const category = String(template.category || '').toUpperCase();
  if (category === 'STRENGTH') return 'RIR 1-3 on compounds, RIR 2-3 on accessories';
  return 'RIR 1-3 on working sets, avoid failure on compounds';
}

function deriveBlockDurationWeeks(template) {
  const category = String(template.category || '').toUpperCase();
  if (category === 'SPECIALIZATION') return 4;
  if (category === 'FAT_LOSS_CONDITIONING') return 6;
  return null;
}

function deriveGuardrailNotes(template) {
  const category = String(template.category || '').toUpperCase();
  if (category === 'SPECIALIZATION') {
    return 'Prioritize target muscle volume, keep non-target work at maintenance, then pivot after block.';
  }
  if (category === 'FAT_LOSS_CONDITIONING') {
    return 'Separate hard conditioning from heavy lower sessions when possible and scale intervals by recovery.';
  }
  if (category === 'HOME_MINIMAL') {
    return 'Only use equipment listed in the plan header.';
  }
  return 'Progress by quality reps first, then load. Deload when performance stalls.';
}

const DEFINITIONS = [
  { id: 'full_body_beginner_3x', name: 'Full Body Beginner (3x/week)', category: 'BEGINNER', description: 'Simple full-body progression.', goal: 'Build base strength and consistency', experienceLevel: 'Beginner', daysPerWeek: 3, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 110, blueprint: 'FULL_BODY_BEGINNER_3' },
  { id: 'minimalist_full_body_23', name: 'Minimalist Full Body (2-3 Day)', category: 'BEGINNER', description: 'Time-efficient full-body essentials.', goal: 'Stay consistent on a busy schedule', experienceLevel: 'Beginner', daysPerWeek: 3, equipment: ['Barbell', 'Cable', 'Bodyweight'], isFeatured: true, sortOrder: 115, blueprint: 'MINIMAL_FULL_BODY_3' },
  { id: 'upper_lower_beginner_4x', name: 'Upper / Lower Beginner (4x/week)', category: 'BEGINNER', description: 'Balanced upper/lower split.', goal: 'Learn movement patterns', experienceLevel: 'Beginner', daysPerWeek: 4, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 120, blueprint: 'UPPER_LOWER_4' },
  { id: 'bodyweight_beginner', name: 'Bodyweight Beginner', category: 'BEGINNER', description: 'No-gym bodyweight basics.', goal: 'Build movement control', experienceLevel: 'Beginner', daysPerWeek: 3, equipment: ['Bodyweight'], isFeatured: false, sortOrder: 130, blueprint: 'BODYWEIGHT_3' },

  { id: 'upper_lower_strength_4x', name: 'Upper / Lower Strength Focus (4x/week)', category: 'STRENGTH', description: 'Power + volume blend.', goal: 'Increase compound lifts', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Barbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 210, blueprint: 'UPPER_LOWER_STRENGTH_4' },
  { id: 'novice_barbell_strength', name: 'Novice Barbell Strength', category: 'STRENGTH', description: 'Linear barbell progression.', goal: 'Progress weekly on core lifts', experienceLevel: 'Beginner', daysPerWeek: 3, equipment: ['Barbell'], isFeatured: true, sortOrder: 220, blueprint: 'NOVICE_BARBELL_3' },
  { id: 'powerbuilding_4_day', name: 'Powerbuilding 4-Day', category: 'STRENGTH', description: 'Strength first, size second.', goal: 'Get stronger while building muscle', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 230, blueprint: 'POWERBUILDING_4' },
  { id: 'powerbuilding_5_day', name: 'Powerbuilding 5-Day', category: 'STRENGTH', description: 'Higher-frequency powerbuilding.', goal: 'Maximize progression volume', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: false, sortOrder: 240, blueprint: 'POWERBUILDING_5' },

  { id: 'pure_hypertrophy_5_day', name: 'Pure Hypertrophy 5-Day', category: 'HYPERTROPHY', description: 'High-volume growth split.', goal: 'Maximize hypertrophy', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 310, blueprint: 'HYPERTROPHY_5' },
  { id: 'ppl_moderate_5x', name: 'Push / Pull / Legs Moderate (5x/week)', category: 'HYPERTROPHY', description: 'Moderate-frequency PPL.', goal: 'Build muscle with recoverable volume', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 320, blueprint: 'PPL_5' },
  { id: 'ppl_classic_6x', name: 'Push / Pull / Legs Classic (6x/week)', category: 'HYPERTROPHY', description: 'Classic high-frequency PPL.', goal: 'Maximum training frequency', experienceLevel: 'Advanced', daysPerWeek: 6, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: false, sortOrder: 330, blueprint: 'PPL_6' },
  { id: 'bro_split_5x', name: 'Bro Split (5x/week)', category: 'HYPERTROPHY', description: 'Single-muscle focus days.', goal: 'Body-part specialization', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: false, sortOrder: 340, blueprint: 'BRO_SPLIT_5' },
  { id: 'arnold_split_6x', name: 'Arnold Split (6x/week)', category: 'HYPERTROPHY', description: 'Classic high-volume pairing split.', goal: 'Increase upper-body density', experienceLevel: 'Advanced', daysPerWeek: 6, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: false, sortOrder: 350, blueprint: 'ARNOLD_6' },

  { id: 'mens_aesthetic_v_taper', name: "Men's Aesthetic V-Taper Program", category: 'AESTHETIC', description: 'Shoulders and lats emphasis.', goal: 'Improve upper-body proportions', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: true, sortOrder: 410, blueprint: 'AESTHETIC_5' },
  { id: 'lean_physique_recomp', name: 'Lean Physique Recomp Program', category: 'AESTHETIC', description: 'Lifting + conditioning recomposition.', goal: 'Build muscle while cutting fat', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Conditioning'], isFeatured: true, sortOrder: 420, blueprint: 'RECOMP_5' },
  { id: 'upper_body_bias_program', name: 'Upper Body Bias Program', category: 'AESTHETIC', description: 'Upper-focused with lower maintenance.', goal: 'Bring up upper body faster', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine'], isFeatured: false, sortOrder: 430, blueprint: 'UPPER_BIAS_4' },

  { id: 'glute_legs_focus_45', name: 'Glute & Legs Focus (4-5x/week)', category: 'LOWER_BODY_GLUTES', description: 'Lower-body dominant volume.', goal: 'Prioritize glutes and legs', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Barbell', 'Machine', 'Dumbbell'], isFeatured: true, sortOrder: 510, blueprint: 'GLUTES_LEGS_5' },
  { id: 'womens_lower_body_focus', name: "Women's Lower Body Focus", category: 'LOWER_BODY_GLUTES', description: 'Lower-body emphasis with upper support.', goal: 'Lower-body growth and strength', experienceLevel: 'Beginner', daysPerWeek: 4, equipment: ['Barbell', 'Machine', 'Dumbbell'], isFeatured: true, sortOrder: 520, blueprint: 'LOWER_FOCUS_4' },
  { id: 'athletic_legs_program', name: 'Athletic Legs Program', category: 'LOWER_BODY_GLUTES', description: 'Power + conditioning lower split.', goal: 'Athletic lower-body performance', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Barbell', 'Machine', 'Conditioning'], isFeatured: false, sortOrder: 530, blueprint: 'ATHLETIC_LEGS_4' },

  { id: 'arm_specialization_block', name: 'Arm Specialization Block', category: 'SPECIALIZATION', description: 'Extra direct arm volume.', goal: 'Bring up biceps and triceps', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable'], isFeatured: false, sortOrder: 610, blueprint: 'ARM_SPECIALIZATION_5' },
  { id: 'chest_specialization_block', name: 'Chest Specialization Block', category: 'SPECIALIZATION', description: 'Chest-priority frequency block.', goal: 'Prioritize chest development', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable'], isFeatured: false, sortOrder: 620, blueprint: 'CHEST_SPECIALIZATION_5' },
  { id: 'back_width_thickness_block', name: 'Back Width + Thickness Block', category: 'SPECIALIZATION', description: 'Dual-focus back growth block.', goal: 'Increase back width and thickness', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Cable', 'Bodyweight', 'Dumbbell'], isFeatured: false, sortOrder: 630, blueprint: 'BACK_SPECIALIZATION_5' },
  { id: 'shoulder_specialization_block', name: 'Shoulder Specialization Block', category: 'SPECIALIZATION', description: 'High-frequency delt block.', goal: 'Build rounder shoulders', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Cable'], isFeatured: false, sortOrder: 640, blueprint: 'SHOULDER_SPECIALIZATION_5' },

  { id: 'home_dumbbell_only_program', name: 'Home Dumbbell Only Program', category: 'HOME_MINIMAL', description: 'No-machine home split.', goal: 'Effective home training', experienceLevel: 'All Levels', daysPerWeek: 4, equipment: ['Dumbbell', 'Bodyweight'], isFeatured: true, sortOrder: 710, blueprint: 'HOME_DB_ONLY_4' },
  { id: 'home_dumbbell_bench_program', name: 'Home Dumbbell + Bench Program', category: 'HOME_MINIMAL', description: 'Home split with bench options.', goal: 'Expand home exercise variety', experienceLevel: 'All Levels', daysPerWeek: 4, equipment: ['Dumbbell', 'Bench', 'Bodyweight'], isFeatured: true, sortOrder: 720, blueprint: 'HOME_DB_BENCH_4' },
  { id: 'resistance_band_only_program', name: 'Resistance Band Only Program', category: 'HOME_MINIMAL', description: 'Portable resistance-band routine.', goal: 'Minimal-equipment consistency', experienceLevel: 'All Levels', daysPerWeek: 4, equipment: ['Resistance Band', 'Bodyweight'], isFeatured: false, sortOrder: 730, blueprint: 'BAND_ONLY_4' },

  { id: 'calisthenics_strength_base', name: 'Calisthenics Strength Base', category: 'BODYWEIGHT_CALISTHENICS', description: 'Bodyweight strength progression.', goal: 'Increase bodyweight strength', experienceLevel: 'Intermediate', daysPerWeek: 4, equipment: ['Bodyweight'], isFeatured: false, sortOrder: 820, blueprint: 'CALISTHENICS_STRENGTH_4' },

  { id: 'fat_loss_conditioning_lifting_hybrid', name: 'Fat Loss Conditioning + Lifting Hybrid', category: 'FAT_LOSS_CONDITIONING', description: 'Alternating lift and conditioning days.', goal: 'Lose fat while preserving strength', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Conditioning', 'Bodyweight'], isFeatured: true, sortOrder: 910, blueprint: 'FAT_LOSS_HYBRID_5' },
  { id: 'interference_aware_recomp', name: 'Interference-Aware Fat Loss / Recomp', category: 'FAT_LOSS_CONDITIONING', description: 'Recovery-aware lifting and conditioning split.', goal: 'Recomp without crushing lower-body recovery', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Dumbbell', 'Conditioning', 'Bodyweight', 'Cable'], isFeatured: true, sortOrder: 915, blueprint: 'INTERFERENCE_AWARE_RECOMP_5' },
  { id: 'lift_3day_cardio_2day', name: '3-Day Lift + 2-Day Cardio Plan', category: 'FAT_LOSS_CONDITIONING', description: 'Simple split with cardio built in.', goal: 'Improve body composition', experienceLevel: 'All Levels', daysPerWeek: 5, equipment: ['Barbell', 'Conditioning', 'Bodyweight'], isFeatured: true, sortOrder: 920, blueprint: 'LIFT_3_CARDIO_2' },
  { id: 'athletic_conditioning_program', name: 'Athletic Conditioning Program', category: 'FAT_LOSS_CONDITIONING', description: 'Athletic engine + strength emphasis.', goal: 'Build work capacity and durability', experienceLevel: 'Intermediate', daysPerWeek: 5, equipment: ['Barbell', 'Conditioning', 'Bodyweight', 'Cable', 'Dumbbell'], isFeatured: false, sortOrder: 930, blueprint: 'ATHLETIC_CONDITIONING_5' },
];

export const PROGRAM_TEMPLATE_CATALOG = DEFINITIONS.map((definition) => ({
  ...definition,
  goalBias: deriveGoalBias(definition),
  splitType: deriveSplitType(definition),
  minimumEquipment: deriveMinimumEquipment(definition),
  sessionLengthTarget: definition.daysPerWeek >= 5 ? 90 : 75,
  recoveryDemand: deriveRecoveryDemand(definition),
  adherenceFloor: deriveAdherenceFloor(definition),
  specializationType: deriveSpecializationType(definition),
  progressionModel: deriveProgressionModel(definition),
  deloadProtocol: deriveDeloadProtocol(definition),
  effortTarget: deriveEffortTarget(definition),
  blockDurationWeeks: deriveBlockDurationWeeks(definition),
  guardrailNotes: deriveGuardrailNotes(definition),
  days: buildDays(definition.blueprint, definition.equipment),
})).map((template) => ({
  ...template,
  equipment: deriveTemplateEquipment(template, template.days),
})).sort((a, b) => a.sortOrder - b.sortOrder);

export const PROGRAM_TEMPLATES = PROGRAM_TEMPLATE_CATALOG;

export const PROGRAM_TEMPLATE_ID_ALIASES = {
  bodyweight_calisthenics_beginner: 'bodyweight_beginner',
  home_db_bench_legacy: 'home_dumbbell_bench_program',
};

export function resolveProgramTemplateId(templateId) {
  return PROGRAM_TEMPLATE_ID_ALIASES[templateId] || templateId;
}

export const ONBOARDING_TEMPLATE_ID = 'full_body_beginner_3x';
