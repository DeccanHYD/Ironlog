import { buildProgressionSuggestion } from './progressionEngine';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseRepTarget(value, fallback = 8) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function getDayCompletionRate(day, history = []) {
  const recent = history.find((session) => session?.dayId === day?.id);
  if (!recent) return 0;
  const planned = (day?.exercises || []).filter((exercise) => !exercise?.isWarmup).length;
  const completed = (recent?.exercises || []).length;
  if (!planned) return 0;
  return Math.min(1, completed / planned);
}

export function getGoalModeConfig(goalMode = 'hypertrophy') {
  if (goalMode === 'strength') {
    return {
      increaseBias: 1.05,
      volumeFloor: 0.9,
      priorityLane: 'compound',
    };
  }
  if (goalMode === 'general_fitness') {
    return {
      increaseBias: 0.9,
      volumeFloor: 0.8,
      priorityLane: 'balanced',
    };
  }
  return {
    increaseBias: 1,
    volumeFloor: 1,
    priorityLane: 'hypertrophy',
  };
}

export function buildProgramInsights({
  activePlan = null,
  history = [],
  goalMode = 'hypertrophy',
} = {}) {
  if (!activePlan?.days?.length) {
    return {
      goalMode,
      adherence: 0,
      dayInsights: [],
      projectedProgress: 'No active plan loaded.',
      recommendedReschedule: null,
    };
  }

  const mode = getGoalModeConfig(goalMode);
  const dayInsights = (activePlan.days || []).map((day) => {
    const completionRate = getDayCompletionRate(day, history);
    const status = completionRate >= 0.9 ? 'on_track' : completionRate >= 0.6 ? 'partial' : 'missed';
    return {
      dayId: day.id,
      dayName: day.name,
      completionRate: Math.round(completionRate * 100),
      status,
    };
  });

  const adherence = Math.round(
    dayInsights.reduce((sum, day) => sum + day.completionRate, 0) / Math.max(1, dayInsights.length)
  );

  const missedDays = dayInsights.filter((day) => day.status === 'missed');
  const recommendedReschedule = missedDays.length
    ? `Reschedule ${missedDays[0].dayName} into your next open session to preserve pattern continuity.`
    : null;

  const projectedProgress = adherence >= 85
    ? `Plan adherence is high for ${goalMode}; progression can stay aggressive.`
    : adherence >= 65
      ? `Adherence is moderate; hold progression pace and recover missed volume.`
      : `Adherence is low; simplify volume and prioritize consistency before load jumps.`;

  return {
    goalMode,
    mode,
    adherence,
    dayInsights,
    projectedProgress,
    recommendedReschedule,
  };
}

export function buildAdaptiveDayTargets({
  day = null,
  history = [],
  goalMode = 'hypertrophy',
} = {}) {
  if (!day?.exercises?.length) return [];
  const mode = getGoalModeConfig(goalMode);

  const targets = day.exercises
    .filter((exercise) => !exercise?.isWarmup)
    .map((exercise) => {
      const suggestion = buildProgressionSuggestion({
        exercise: {
          ...exercise,
          sets: toNumber(exercise?.sets || 0),
          reps: parseRepTarget(exercise?.reps, 8),
          prescribedSets: toNumber(exercise?.sets || 0),
          prescribedReps: parseRepTarget(exercise?.reps, 8),
        },
        history,
      });
      if (!suggestion) return null;

      const adjustedWeight = suggestion.action === 'increase'
        ? Math.round((suggestion.targetWeight * mode.increaseBias) * 10) / 10
        : suggestion.targetWeight;

      return {
        dayId: day.id,
        dayName: day.name,
        exerciseId: exercise.exerciseId || exercise.id || exercise.name,
        exerciseName: exercise.name,
        action: suggestion.action,
        targetWeight: adjustedWeight,
        targetReps: suggestion.targetReps,
        plateauSignal: suggestion.plateauSignal || null,
        deloadSignal: suggestion.deloadSignal || null,
        rationale: suggestion.rationale,
      };
    })
    .filter(Boolean);

  // Prevent noisy duplicates in UI when a day accidentally repeats the same exercise entry.
  const deduped = [];
  const seen = new Set();
  targets.forEach((target) => {
    const key = String(target.exerciseId || target.exerciseName || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(target);
  });
  return deduped;
}
