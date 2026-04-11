import { buildExerciseProfile, resolveExerciseProfile } from './exerciseProfileEngine';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundToIncrement(value, increment = 2.5) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / increment) * increment;
}

function parsePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(value || '');
  const first = text.match(/\d+(\.\d+)?/);
  if (first) {
    const parsed = Number(first[0]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function getWorkingSets(exercise) {
  return (exercise?.sets || []).filter((setItem) => (setItem?.type || 'normal') !== 'warmup');
}

function summarizeExposure(session, exercise) {
  const workingSets = getWorkingSets(exercise);
  let bestWeight = 0;
  let bestReps = 0;
  let bestE1rm = 0;
  let totalVolume = 0;

  workingSets.forEach((setItem) => {
    const weight = Number(setItem?.weight || 0);
    const reps = Number(setItem?.reps || 0);
    totalVolume += weight > 0 && reps > 0 ? weight * reps : 0;
    if (weight > bestWeight) bestWeight = weight;
    if (reps > bestReps) bestReps = reps;
    if (weight > 0 && reps > 0) {
      const e1rm = Number(setItem?.orm || (weight * (1 + reps / 30)));
      if (e1rm > bestE1rm) bestE1rm = e1rm;
    }
  });

  return {
    date: session?.date || new Date().toISOString(),
    isDeload: !!session?.isDeload,
    exerciseId: exercise?.exerciseId || exercise?.id || exercise?.name,
    exerciseName: exercise?.name || 'Unknown Exercise',
    prescribedSets: exercise?.prescribedSets ?? exercise?.sets ?? workingSets.length,
    prescribedReps: exercise?.prescribedReps ?? exercise?.reps ?? 0,
    workingSets,
    workingSetCount: workingSets.length,
    bestWeight,
    bestReps,
    bestE1rm,
    totalVolume,
  };
}

export function getComparableExerciseHistory(history = [], exercise) {
  const exerciseId = exercise?.exerciseId || exercise?.id;
  const exerciseName = normalizeName(exercise?.name);
  return (history || [])
    .map((session) => {
      const match = (session?.exercises || []).find((item) => {
        if (exerciseId && item?.exerciseId === exerciseId) return true;
        return normalizeName(item?.name) === exerciseName;
      });
      return match ? summarizeExposure(session, match) : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function computeSuccessState(exposure, targetReps, targetSets) {
  const relevantSets = exposure.workingSets.slice(0, targetSets || exposure.workingSetCount || 1);
  const completedAtTarget = relevantSets.filter((setItem) => Number(setItem?.reps || 0) >= targetReps).length;
  const averageReps = relevantSets.length
    ? relevantSets.reduce((sum, setItem) => sum + Number(setItem?.reps || 0), 0) / relevantSets.length
    : 0;

  if (completedAtTarget >= Math.max(1, (targetSets || relevantSets.length) - 1)) {
    return { status: 'success', averageReps, completedAtTarget };
  }
  if (averageReps >= Math.max(1, targetReps - 1)) {
    return { status: 'hold', averageReps, completedAtTarget };
  }
  return { status: 'fail', averageReps, completedAtTarget };
}

function detectPlateau(exposures = []) {
  const recent = exposures.filter((item) => !item.isDeload).slice(0, 3);
  if (recent.length < 3) return null;
  const e1rms = recent.map((item) => item.bestE1rm || 0).filter(Boolean);
  const volumes = recent.map((item) => item.totalVolume || 0).filter(Boolean);
  if (e1rms.length < 3 || volumes.length < 3) return null;

  const e1rmSpread = Math.max(...e1rms) - Math.min(...e1rms);
  const e1rmBaseline = Math.max(1, e1rms[0]);
  const volumeSpread = Math.max(...volumes) - Math.min(...volumes);
  const volumeBaseline = Math.max(1, volumes[0]);

  if ((e1rmSpread / e1rmBaseline) <= 0.02 && (volumeSpread / volumeBaseline) <= 0.05) {
    return {
      stalledSessions: recent.length,
      reason: 'e1RM, reps, and volume have been flat across the last 3 exposures',
    };
  }
  return null;
}

function choosePlateauAction(profile, plateau) {
  if (!plateau) return null;
  if (profile.loadModel === 'machine_or_cable' || profile.loadModel === 'dumbbell_increment') {
    return { action: 'microload', label: 'Microload', reason: 'progression has stalled and a smaller load jump is likely enough' };
  }
  if (profile.loadModel === 'bodyweight_progression') {
    return { action: 'rep_reset', label: 'Rep reset', reason: 'bodyweight progress has flattened, so resetting the rep target should restore momentum' };
  }
  if (profile.compound) {
    return { action: 'microload', label: 'Microload', reason: 'the lift is stable but not improving enough for a normal jump' };
  }
  return { action: 'variation_swap', label: 'Variation swap', reason: 'a nearby movement may break the stall with less fatigue' };
}

function chooseLoadAdjustment(profile, lastExposure, successState, repeatedMiss) {
  let baseWeight = Number(lastExposure?.bestWeight || 0);
  const targetReps = parsePositiveNumber(lastExposure?.prescribedReps, 8);

  // Bodyweight lifts are frequently logged with body mass in the weight field.
  // Treat that as BW baseline, not external load for progression targets.
  if (profile.loadModel === 'bodyweight_progression' && baseWeight >= 40) {
    baseWeight = 0;
  }

  if (profile.loadModel === 'barbell_upper_compound') {
    if (repeatedMiss) return { action: 'reduce', targetWeight: roundToIncrement(baseWeight * 0.95, 2.5), targetReps: Math.max(5, targetReps - 1) };
    if (successState.status === 'success') return { action: 'increase', targetWeight: roundToIncrement(baseWeight + 2.5, 2.5), targetReps };
    return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps };
  }

  if (profile.loadModel === 'barbell_lower_compound') {
    if (repeatedMiss) return { action: 'reduce', targetWeight: roundToIncrement(baseWeight * 0.93, 2.5), targetReps: Math.max(4, targetReps - 1) };
    if (successState.status === 'success') return { action: 'increase', targetWeight: roundToIncrement(baseWeight + 5, 2.5), targetReps };
    return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps };
  }

  if (profile.loadModel === 'dumbbell_increment') {
    if (repeatedMiss) return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: clamp(targetReps - 1, 6, 15) };
    if (successState.status === 'success') {
      const nextWeight = roundToIncrement(baseWeight + profile.microloadStep, 2.5);
      const isLargeJump = baseWeight > 0 && ((nextWeight - baseWeight) / baseWeight) > 0.1;
      if (isLargeJump) return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: clamp(targetReps + 1, 6, profile.repCeiling) };
      return { action: 'increase', targetWeight: nextWeight, targetReps };
    }
    return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps };
  }

  if (profile.loadModel === 'machine_or_cable') {
    if (repeatedMiss) return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: clamp(targetReps - 1, 8, 15) };
    if (successState.status === 'success' && successState.averageReps >= Math.max(targetReps, profile.repCeiling - 1)) {
      return { action: 'increase', targetWeight: roundToIncrement(baseWeight + profile.microloadStep, 2.5), targetReps };
    }
    if (successState.status === 'success') {
      return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: clamp(targetReps + 1, 8, profile.repCeiling) };
    }
    return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps };
  }

  if (profile.loadModel === 'bodyweight_progression') {
    if (repeatedMiss) return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: clamp(targetReps - 1, 5, profile.repCeiling) };
    if (successState.status === 'success' && targetReps < profile.repCeiling) {
      return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps: targetReps + 1 };
    }
    if (successState.status === 'success') {
      return { action: 'increase', targetWeight: roundToIncrement(baseWeight + profile.microloadStep, 2.5), targetReps: clamp(targetReps - 2, 5, profile.repCeiling) };
    }
    return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 2.5), targetReps };
  }

  if (repeatedMiss) return { action: 'reduce', targetWeight: roundToIncrement(baseWeight * 0.95, 1.25), targetReps: clamp(targetReps - 1, 6, 15) };
  if (successState.status === 'success') return { action: 'increase', targetWeight: roundToIncrement(baseWeight + profile.microloadStep, 1.25), targetReps };
  return { action: 'hold', targetWeight: roundToIncrement(baseWeight, 1.25), targetReps };
}

export function buildProgressionSuggestion({
  exercise,
  history = [],
  profileCatalog = null,
  readiness = null,
} = {}) {
  const profile = resolveExerciseProfile(exercise, profileCatalog) || buildExerciseProfile(exercise);
  const exposures = getComparableExerciseHistory(history, exercise).filter((item) => !item.isDeload);
  const lastExposure = exposures[0];
  if (!lastExposure || !lastExposure.workingSets.length) return null;

  const targetReps = parsePositiveNumber(
    exercise?.reps ?? exercise?.prescribedReps ?? lastExposure.prescribedReps ?? lastExposure.bestReps,
    8
  );
  const targetSets = Math.max(
    1,
    Math.round(
      parsePositiveNumber(
        exercise?.sets ?? exercise?.prescribedSets ?? lastExposure.prescribedSets ?? lastExposure.workingSetCount,
        3
      )
    )
  );
  const successState = computeSuccessState(lastExposure, targetReps, targetSets);
  const previousState = exposures[1] ? computeSuccessState(exposures[1], targetReps, targetSets) : null;
  const repeatedMiss = successState.status === 'fail' && previousState?.status === 'fail';
  const plateau = detectPlateau(exposures);
  const plateauAction = choosePlateauAction(profile, plateau);
  const loadAdjustment = chooseLoadAdjustment(profile, lastExposure, successState, repeatedMiss);
  const deload = repeatedMiss && typeof readiness === 'number' && readiness < 0.45
    ? {
        recommended: true,
        reason: 'repeated underperformance is overlapping with low freshness',
      }
    : null;

  const rationaleParts = [];
  if (successState.status === 'success') rationaleParts.push('last exposure cleared the target');
  if (successState.status === 'hold') rationaleParts.push('last exposure was close but not clean enough for a full jump');
  if (successState.status === 'fail') rationaleParts.push('last exposure missed the target');
  if (plateau) rationaleParts.push(plateau.reason);
  if (deload) rationaleParts.push(deload.reason);

  return {
    exerciseId: exercise?.exerciseId || exercise?.id || exercise?.name,
    exerciseName: exercise?.name || 'Unknown Exercise',
    action: loadAdjustment.action,
    targetWeight: loadAdjustment.targetWeight,
    targetReps: loadAdjustment.targetReps,
    rationale: rationaleParts.join('; '),
    confidence: clamp(profile.confidence + (successState.status === 'success' ? 0.08 : 0), 0.45, 0.96),
    profile,
    lastExposure,
    plateauSignal: plateau
      ? {
          stalledSessions: plateau.stalledSessions,
          recommendation: plateauAction?.label || 'Variation swap',
          reason: plateau.reason,
          primaryAction: plateauAction?.action || 'variation_swap',
        }
      : null,
    deloadSignal: deload
      ? {
          recommendation: 'Local deload',
          reason: deload.reason,
        }
      : null,
  };
}
