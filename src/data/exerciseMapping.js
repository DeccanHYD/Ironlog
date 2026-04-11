// Exercise mapping: existing IRONLOG name → free-exercise-db id
// confidence: HIGH=exact/near-exact, MED=close match, LOW=best available, null=no match
// Review all MED and LOW entries before approving.

export const EXERCISE_ID_MAP = {
  // CHEST
  'Barbell Bench Press':         'Barbell_Bench_Press_-_Medium_Grip',   // HIGH
  'Incline Barbell Bench Press': 'Incline_Barbell_Bench_Press',         // HIGH
  'DB Bench Press':              'Dumbbell_Bench_Press',                 // HIGH
  'Incline DB Bench Press':      'Incline_Dumbbell_Bench_Press',         // HIGH
  'Cable Fly Low to High':       null,                                   // different angle/emphasis
  'Cable Fly':                   'Cable_Fly',                            // HIGH
  'Pec Deck':                    'Pec_Deck_Fly',                         // HIGH
  'Incline Smith Press':         'Smith_Machine_Bench_Press',            // MED — no incline smith in db
  'Push-Up':                     'Push-Up',                              // HIGH
  'Dips (Chest)':                'Dips_-_Chest_Version',                 // HIGH

  // BACK
  'Pull-Up':                     'Pull-Up',                              // HIGH
  'Weighted Pull-Up':            'Weighted_Pull_Ups',                    // HIGH
  'Chin-Up':                     'Chin-Up',                              // HIGH
  'Lat Pulldown':                'Wide-Grip_Lat_Pulldown',               // HIGH
  'Single Arm Cable Pulldown':   'Close-Grip_Front_Lat_Pulldown',        // MED — closest in db
  'Barbell Row':                 'Barbell_Bent_Over_Row',                // HIGH
  'Single Arm DB Row':           'One-Arm_Dumbbell_Row',                 // HIGH
  'Seated Cable Row':            'Seated_Cable_Rows',                    // HIGH
  'Face Pull':                   'Face_Pull',                            // HIGH
  'Straight Arm Pulldown':       'Straight-Arm_Pulldown',                // HIGH
  'Deadlift':                    'Barbell_Deadlift',                     // HIGH
  'Sumo Deadlift':               'Sumo_Deadlift',                        // HIGH
  'Hyperextension':              'Hyperextensions_With_No_Hyperextension_Bench', // MED
  'Meadows Row':                 null,                                   // NO MATCH
  'Chest Supported Row':         'Lying_T-Bar_Row',                      // MED — closest prone row in db

  // SHOULDERS
  'Barbell OHP':                 'Barbell_Shoulder_Press',               // HIGH
  'DB OHP':                      'Dumbbell_Shoulder_Press',              // HIGH
  'Arnold Press':                'Arnold_Dumbbell_Press',                // HIGH
  'Cable Lateral Raise':         'Cable_Internal_Rotation',              // LOW — no cable lateral in db; use for instructions only
  'DB Lateral Raise':            'Side_Lateral_Raise',                   // HIGH
  'Lateral Raise Machine':       'Side_Lateral_Raise',                   // MED — no machine version
  'Rear Delt Fly':               'Bent_Over_Dumbbell_Rear_Lateral_Raise', // HIGH
  'Reverse Pec Deck':            'Reverse_Flyes',                        // HIGH
  'DB Shrugs':                   'Dumbbell_Shrug',                       // HIGH
  'Barbell Shrugs':              'Barbell_Shrug',                        // HIGH

  // BICEPS
  'Barbell Curl':                'Barbell_Curl',                         // HIGH
  'EZ Bar Curl':                 'EZ-Bar_Curl',                          // HIGH
  'DB Curl':                     'Dumbbell_Alternate_Bicep_Curl',        // HIGH
  'Hammer Curl':                 'Hammer_Curls',                         // HIGH
  'Incline DB Curl':             'Incline_Dumbbell_Curl',                // HIGH
  'Concentration Curl':          'Concentration_Curls',                  // HIGH
  'Preacher Curl':               'Preacher_Curl',                        // HIGH
  'Cable Curl':                  'Low_Cable_Curl',                       // HIGH
  'Spider Curl':                 'Spider_Curl',                          // HIGH
  'Zottman Curl':                'Zottman_Curl',                         // HIGH

  // TRICEPS
  'Close Grip Bench Press':      'Close-Grip_Barbell_Bench_Press',       // HIGH
  'Skull Crusher':               'Barbell_Skullcrusher',                 // HIGH
  'Rope Pushdown':               'Triceps_Pushdown_-_Rope_Attachment',   // HIGH
  'Single Arm Pushdown':         'Triceps_Pushdown',                     // MED
  'Rope Overhead Extension':     'Cable_Rope_Overhead_Triceps_Extension',// HIGH
  'Single Arm OHE':              'Overhead_Triceps',                     // MED — closest single arm overhead
  'Dips (Triceps)':              'Triceps_Dips',                         // HIGH
  'Diamond Push-Up':             'Close-Grip_Push-Up_off_of_a_Dumbbell', // MED

  // LEGS
  'Back Squat':                  'Barbell_Full_Squat',                   // HIGH
  'Front Squat':                 'Front_Barbell_Squat',                  // HIGH
  'Bulgarian Split Squat':       null,                                   // different movement pattern
  'Romanian Deadlift':           'Romanian_Deadlift',                    // HIGH
  'Leg Press':                   'Leg_Press',                            // HIGH
  'Leg Press High Feet':         'Leg_Press',                            // MED — same exercise
  'Hack Squat':                  'Hack_Squat',                           // HIGH
  'Leg Extension':               'Leg_Extensions',                       // HIGH
  'Leg Curl Machine':            'Seated_Leg_Curl',                      // HIGH
  'Nordic Curl':                 'Natural_Glute_Ham_Raise',              // MED
  'Hip Thrust':                  'Barbell_Hip_Thrust',                   // HIGH
  'Walking Lunge':               'Barbell_Walking_Lunge',                // HIGH
  'Step Up':                     'Barbell_Step_Ups',                     // HIGH
  'Lateral Band Walk':           null,                                   // NO MATCH
  'Single Leg Calf Raise':       'Standing_Calf_Raises',                 // MED — no single leg version
  'Standing Calf Raise':         'Standing_Calf_Raises',                 // HIGH
  'Seated Calf Raise':           'Seated_Calf_Raise',                    // HIGH

  // CORE
  'Weighted Cable Crunch':       'Cable_Crunch',                         // HIGH
  'Hanging Leg Raise':           'Hanging_Leg_Raise',                    // HIGH
  'Ab Wheel Rollout':            'Barbell_Ab_Rollout',                   // HIGH
  'Plank':                       'Plank',                                // HIGH
  'Side Plank':                  'Side_Plank',                           // HIGH
  'Dragon Flag':                 'Dragon_Flag',                          // HIGH
  'L-Sit':                       null,                                   // NO MATCH
  'Toes to Bar':                 null,                                   // different movement
  'Russian Twist':               'Russian_Twist',                        // HIGH
  'Dead Bug':                    'Dead_Bug',                             // HIGH
  'V-Up':                        'V_Up',                                 // HIGH

  // MOBILITY — no matches in strength db
  'Hip 90/90 Stretch':           null,
  "World's Greatest Stretch":    'Worlds_Greatest_Stretch',              // HIGH
  'Ankle Mobility Drill':        null,
  'Cat Cow':                     null,
  'Couch Stretch':               null,
  'Deep Squat Hold':             null,

  // CARDIO
  'Incline Treadmill Walk':      null,
  'Running':                     null,

  // COMPOUND NAME (used in default plan)
  'Weighted Pull-Up or Lat Pulldown': 'Wide-Grip_Lat_Pulldown',          // MED — fallback

  // CANONICAL / LEGACY ALIASES
  'Pullups':                     'Pull-Up',
  'Pushups':                     'Push-Up',
  'Seated Cable Rows':           'Seated_Cable_Rows',
  'Leg Extensions':              'Leg_Extensions',
  'Hammer Curls':                'Hammer_Curls',
  'Weighted Pull Ups':           'Weighted_Pull_Ups',
  'Worlds Greatest Stretch':     'Worlds_Greatest_Stretch',
  'Bench Press - Smith Machine': 'Smith_Machine_Bench_Press',
  'Smith Machine Bench Press':   'Smith_Machine_Bench_Press',
  'Squat - Smith Machine':       'Smith_Machine_Squat',
  'Smith Machine Squat':         'Smith_Machine_Squat',
  'Hack Squat - Barbell':        'Barbell_Hack_Squat',
  'Barbell Rear Delt Row':       'Rear_Delt_Row_-_Barbell',
  'Cable Lateral Raise (Single Arm)': 'Cable_Internal_Rotation',
  'Machine Lateral Raise':       'Side_Lateral_Raise',
  'Assisted Pull-Up Machine':    'Assisted_Pull-Up',
};
