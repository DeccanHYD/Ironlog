import { resolveExerciseContribution } from './muscleContributionEngine';
import { resolveExerciseProfile } from './exerciseProfileEngine';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function overlap(a = [], b = []) {
  const set = new Set(a);
  return b.filter((item) => set.has(item)).length;
}

export function rankSubstitutionCandidates({
  exercise,
  candidates = [],
  profileCatalog = null,
  contributionCatalog = null,
  limit = 40,
} = {}) {
  const validCandidates = candidates.filter(Boolean);
  if (!exercise) {
    return validCandidates
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((candidate) => ({
        ...candidate,
        substitutionScore: 0,
      }));
  }

  const sourceProfile = resolveExerciseProfile(exercise, profileCatalog);
  const sourceContribution = resolveExerciseContribution(exercise, contributionCatalog, profileCatalog);
  const sourceMuscles = sourceContribution.primaryMuscles || [];

  return validCandidates
    .filter((candidate) => normalizeName(candidate?.name) !== normalizeName(exercise?.name))
    .map((candidate) => {
      const candidateProfile = resolveExerciseProfile(candidate, profileCatalog);
      const candidateContribution = resolveExerciseContribution(candidate, contributionCatalog, profileCatalog);
      const candidateMuscles = candidateContribution.primaryMuscles || [];

      let score = 0;
      if (candidateProfile.family === sourceProfile.family) score += 5;
      if (candidateProfile.movementPattern === sourceProfile.movementPattern) score += 4;
      if (candidateProfile.equipmentClass === sourceProfile.equipmentClass) score += 2;
      if (candidateProfile.primaryRegion === sourceProfile.primaryRegion) score += 2;
      score += overlap(sourceMuscles, candidateMuscles) * 1.5;
      if (candidateProfile.compound === sourceProfile.compound) score += 1;
      if (candidateProfile.unilateral === sourceProfile.unilateral) score += 0.5;

      return {
        ...candidate,
        substitutionScore: score,
        substitutionReason:
          candidateProfile.family === sourceProfile.family
            ? 'same movement family'
            : candidateProfile.movementPattern === sourceProfile.movementPattern
              ? 'same movement pattern'
              : 'closest muscle and equipment match',
      };
    })
    .sort((a, b) => b.substitutionScore - a.substitutionScore || a.name.localeCompare(b.name))
    .slice(0, limit);
}
