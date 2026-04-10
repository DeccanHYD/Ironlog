import { aggregateByGroups, buildExerciseContributionCatalog, buildExerciseContribution, MUSCLE_GROUPS } from './muscleContributionEngine';
import { buildExerciseProfileCatalog, normalizeText } from './exerciseProfileEngine';
import { buildProgressionSuggestion } from './progressionEngine';
import { buildVolumeInterpretationSentence } from './volumeInterpretationEngine';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSessionExercises(session) {
  return Array.isArray(session?.exercises) ? session.exercises : [];
}

function getWorkingSets(exercise) {
  if (Array.isArray(exercise?.sets)) {
    return exercise.sets.filter((setItem) => (setItem?.type || 'normal') !== 'warmup');
  }
  if (typeof exercise?.sets === 'number' && Number.isFinite(exercise.sets) && exercise.sets > 0) {
    return Array.from({ length: Math.max(0, Math.floor(exercise.sets)) }, () => ({ type: 'normal' }));
  }
  return [];
}

function computeSetVolume(setItem) {
  const weight = Number(setItem?.weight || 0);
  const reps = Number(setItem?.reps || 0);
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * reps;
}

function buildLookup(exerciseIndex = []) {
  const profileCatalog = buildExerciseProfileCatalog(exerciseIndex);
  const contributionCatalog = buildExerciseContributionCatalog(exerciseIndex, profileCatalog);
  const byId = {};
  const byName = {};
  exerciseIndex.forEach((exercise) => {
    if (exercise.id) byId[exercise.id] = exercise;
    byName[normalizeText(exercise.name)] = exercise;
  });
  return { byId, byName, profileCatalog, contributionCatalog };
}

function resolveExerciseReference(exercise, lookup) {
  const byId = exercise?.exerciseId ? lookup.byId[exercise.exerciseId] : null;
  if (byId) return byId;
  return lookup.byName[normalizeText(exercise?.name)] || exercise;
}

function getSessionsForWindow(history = [], window = '7d') {
  const now = Date.now();
  if (window === '30d') return history.filter((session) => new Date(session?.date || 0).getTime() >= now - (30 * 86400000));
  if (window === 'current_week') {
    const monday = new Date();
    const day = monday.getDay() === 0 ? 7 : monday.getDay();
    monday.setDate(monday.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    return history.filter((session) => new Date(session?.date || 0) >= monday);
  }
  if (window === 'current_workout') return history.length ? [history[0]] : [];
  return history.filter((session) => new Date(session?.date || 0).getTime() >= now - (7 * 86400000));
}

function getProgramExercises(activePlan) {
  const days = Array.isArray(activePlan?.days) ? activePlan.days : [];
  const result = [];
  days.forEach((day) => {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    exercises.forEach((exercise) => {
      if (exercise && !exercise.isWarmup) {
        result.push(exercise);
      }
    });
  });
  return result;
}

function getRegionMapFromGroups(groupMap = {}) {
  return {
    chest: groupMap.chest || 0,
    shoulders: groupMap.shoulders || 0,
    rearDelts: groupMap.shoulders || 0,
    arms: groupMap.arms || 0,
    core: groupMap.core || 0,
    quads: groupMap.legs || 0,
    hamstrings: groupMap.legs || 0,
    calves: groupMap.legs || 0,
    back: groupMap.back || 0,
  };
}

function buildEmptyMuscleMetrics() {
  const metrics = {};
  Object.values(MUSCLE_GROUPS).forEach((muscles) => {
    (muscles || []).forEach((key) => {
      metrics[key] = {
        directSets: 0,
        effectiveSets: 0,
        frequency: 0,
        fatigue: 0,
        freshness: 1,
        status: 'fresh',
        confidenceSum: 0,
        hitCount: 0,
      };
    });
  });
  return metrics;
}

function finalizeGroupReadiness(muscleMetrics) {
  const grouped = {};
  Object.entries(MUSCLE_GROUPS).forEach(([group, muscles]) => {
    const total = muscles.reduce((sum, muscle) => sum + (muscleMetrics[muscle]?.freshness || 0), 0);
    grouped[group] = muscles.length ? total / muscles.length : 1;
  });
  return grouped;
}

function buildImbalanceInsights(muscles, groups) {
  const insights = [];
  if ((muscles.rearDelts?.effectiveSets || 0) < (groups.chest || 0) * 0.35) {
    insights.push({ id: 'rear_delt_balance', severity: 'moderate', text: 'Rear delts are trending below chest volume.' });
  }
  if ((muscles.hamstrings?.effectiveSets || 0) < (muscles.quads?.effectiveSets || 0) * 0.55) {
    insights.push({ id: 'hamstring_balance', severity: 'moderate', text: 'Hamstring volume is low relative to quads.' });
  }
  if ((muscles.frontDelts?.effectiveSets || 0) > Math.max(2, (muscles.rearDelts?.effectiveSets || 0) * 1.6)) {
    insights.push({ id: 'front_delt_overload', severity: 'high', text: 'Front delts are carrying more work than rear delts.' });
  }
  return insights;
}

function buildFocusInsight(groups, readiness) {
  const ordered = Object.entries(groups).sort((a, b) => a[1] - b[1]);
  const weakest = ordered[0];
  if (!weakest) return 'Log more work to unlock muscle focus guidance.';
  const label = weakest[0];
  const fresh = readiness[label] || 0;
  if (fresh > 0.72) return `${label.charAt(0).toUpperCase() + label.slice(1)} is underemphasized and ready for more work.`;
  return `${label.charAt(0).toUpperCase() + label.slice(1)} is underemphasized, but recovery is still catching up.`;
}

export function computeMuscleAnalytics({
  history = [],
  exerciseIndex = [],
  activePlan = null,
  window = '7d',
} = {}) {
  const lookup = buildLookup(exerciseIndex);
  const muscleMetrics = buildEmptyMuscleMetrics();
  const selectedSessions = window === 'program' ? [] : getSessionsForWindow(history.filter((session) => !session?.isDeload), window);
  let totalVolumeKg = 0;
  let totalWorkingSets = 0;
  const sessionHits = {};

  const accumulateExercise = (exercise, sessionDate, sessionKey) => {
    const safeExercise = exercise || {};
    const reference = resolveExerciseReference(safeExercise, lookup);
    const contribution = buildExerciseContribution(reference || safeExercise, lookup.profileCatalog) || {};
    const workingSets = getWorkingSets(exercise);
    const workingSetCount = typeof safeExercise?.sets === 'number' && !Array.isArray(safeExercise?.sets)
      ? Number(safeExercise.sets || 0)
      : workingSets.length;
    if (!workingSetCount) return;

    totalWorkingSets += workingSetCount;
    if (Array.isArray(safeExercise?.sets)) {
      totalVolumeKg += safeExercise.sets.reduce((sum, setItem) => sum + computeSetVolume(setItem), 0);
    }

    const ageHours = sessionDate ? (Date.now() - new Date(sessionDate).getTime()) / 3600000 : 0;
    const decay = Math.exp(-0.03 * Math.max(0, ageHours));

    const contributionMap = contribution?.contributions || {};
    Object.entries(contributionMap).forEach(([muscleKey, weight]) => {
      if (!muscleMetrics[muscleKey]) return;
      muscleMetrics[muscleKey].effectiveSets += workingSetCount * weight;
      muscleMetrics[muscleKey].confidenceSum += Number(contribution?.confidence || 0);
      muscleMetrics[muscleKey].hitCount += 1;
      muscleMetrics[muscleKey].fatigue += workingSetCount * weight * decay;
      if (Array.isArray(contribution?.primaryMuscles) && contribution.primaryMuscles.includes(muscleKey)) {
        muscleMetrics[muscleKey].directSets += workingSetCount;
      }
      sessionHits[sessionKey] = sessionHits[sessionKey] || {};
      sessionHits[sessionKey][muscleKey] = true;
    });
  };

  if (window === 'program') {
    getProgramExercises(activePlan).forEach((exercise, index) => {
      accumulateExercise({ ...exercise, exerciseId: exercise.exerciseId || exercise.id }, null, `program_${index}`);
    });
  } else {
    selectedSessions.forEach((session) => {
      getSessionExercises(session).forEach((exercise) => accumulateExercise(exercise, session.date, session.id || session.date));
    });
  }

  Object.keys(sessionHits).forEach((sessionKey) => {
    Object.keys(sessionHits[sessionKey]).forEach((muscleKey) => {
      muscleMetrics[muscleKey].frequency += 1;
    });
  });

  Object.values(muscleMetrics).forEach((metric) => {
    metric.freshness = window === 'program'
      ? 1
      : clamp(1 - Math.min(metric.fatigue / 8, 1), 0.05, 1);
    metric.status = metric.freshness >= 0.75 ? 'fresh' : metric.freshness >= 0.45 ? 'recovering' : 'fatigued';
    metric.confidence = metric.hitCount ? metric.confidenceSum / metric.hitCount : 0;
  });

  const effectiveByMuscle = {};
  Object.entries(muscleMetrics).forEach(([key, value]) => {
    effectiveByMuscle[key] = value.effectiveSets;
  });
  const groups = aggregateByGroups(effectiveByMuscle);
  const readiness = finalizeGroupReadiness(muscleMetrics);
  const groupValues = Object.values(groups);
  const maxGroupValue = groupValues.length ? Math.max(...groupValues) : 1;
  const heatmap = getRegionMapFromGroups(
    window === 'program'
      ? Object.keys(groups).reduce((acc, key) => {
          acc[key] = groups[key] / Math.max(1, maxGroupValue);
          return acc;
        }, {})
      : Object.keys(readiness).reduce((acc, key) => {
          acc[key] = 1 - readiness[key];
          return acc;
        }, {})
  );
  const imbalances = buildImbalanceInsights(muscleMetrics, groups);

  return {
    window,
    totalVolumeKg,
    totalWorkingSets,
    muscles: muscleMetrics,
    groups,
    readiness,
    heatmap,
    imbalances,
    focusInsight: buildFocusInsight(groups, readiness),
  };
}

function getPreviousComparableSession(history, session) {
  return history.find((item) => item?.dayId === session?.dayId && item?.id !== session?.id);
}

export function buildWorkoutCompletionSummary({
  session,
  history = [],
  exerciseIndex = [],
  recentUsage = [],
} = {}) {
  if (!session) return '';
  const previousSession = getPreviousComparableSession(history, session);
  const currentVolume = Number(session.totalVolume || 0);
  const previousVolume = Number(previousSession?.totalVolume || 0);
  const changePct = previousVolume > 0 ? ((currentVolume - previousVolume) / previousVolume) * 100 : null;

  let progressionWins = 0;
  let dips = 0;
  let chestWork = 0;
  let tricepsWork = 0;
  const lookup = buildLookup(exerciseIndex);

  (session.exercises || []).forEach((exercise) => {
    const suggestion = buildProgressionSuggestion({ exercise, history, profileCatalog: lookup.profileCatalog });
    if (suggestion?.action === 'increase') progressionWins += 1;
    if (suggestion?.action === 'reduce') dips += 1;

    const reference = resolveExerciseReference(exercise, lookup);
    const contribution = buildExerciseContribution(reference, lookup.profileCatalog);
    const workingSetCount = getWorkingSets(exercise).length;
    chestWork += (contribution.contributions.midChest || 0) * workingSetCount;
    chestWork += (contribution.contributions.upperChest || 0) * workingSetCount;
    chestWork += (contribution.contributions.lowerChest || 0) * workingSetCount;
    tricepsWork += (contribution.contributions.tricepsLong || 0) * workingSetCount;
    tricepsWork += (contribution.contributions.tricepsLateral || 0) * workingSetCount;
    tricepsWork += (contribution.contributions.tricepsMedial || 0) * workingSetCount;
  });

  const volumeLine = buildVolumeInterpretationSentence({
    totalKg: currentVolume,
    changePct,
    baselineLabel: previousSession ? 'your last matching day' : 'your last week',
    recentUsage,
  });

  const chestLine = chestWork >= 4 ? 'chest volume landed on target' : 'chest volume stayed light';
  const dipLine = dips > 0 ? `with ${dips} exercise dip${dips > 1 ? 's' : ''}` : 'with no clear performance dip';
  return `${volumeLine.replace(/\.$/, '')}, ${progressionWins} progression win${progressionWins === 1 ? '' : 's'}, ${chestLine}, ${dipLine}.`;
}
