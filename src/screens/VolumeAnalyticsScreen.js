import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import useDeferredScreenReady from '../hooks/useDeferredScreenReady';
import { EXERCISES } from '../data/exerciseLibrary';
import { getExerciseIndex } from '../services/ExerciseLibraryService';
import { computeMuscleAnalytics } from '../domain/intelligence/trainingAnalyticsEngine';
import { buildVolumeInterpretationSentence } from '../domain/intelligence/volumeInterpretationEngine';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 220;
const BAR_AREA_HEIGHT = 160;
const TOP_LABEL_HEIGHT = 20;

const RADAR_GROUPS = ['core', 'arms', 'chest', 'legs', 'back', 'shoulders'];
const RADAR_LABELS = {
  core: 'Core',
  arms: 'Arms',
  chest: 'Chest',
  legs: 'Legs',
  back: 'Back',
  shoulders: 'Shoulders',
};

const PUSH_MUSCLES = ['chest', 'shoulders', 'triceps'];
const PULL_MUSCLES = ['back', 'lats', 'biceps', 'traps', 'forearms'];
const LEG_MUSCLES = ['quadriceps', 'hamstrings', 'glutes', 'calves'];

const RADAR_GROUP_BY_MUSCLE = {
  abs: 'core',
  core: 'core',
  obliques: 'core',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  chest: 'chest',
  shoulders: 'shoulders',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  back: 'back',
  lats: 'back',
  traps: 'back',
  rhomboids: 'back',
  'lower back': 'back',
};

const MUSCLE_SHORT = {
  chest: 'Chest',
  shoulders: 'Shldrs',
  triceps: 'Tris',
  back: 'Back',
  lats: 'Lats',
  biceps: 'Bis',
  'rear delt': 'R.Delt',
  'rear delts': 'R.Delts',
  'front delts': 'F.Delts',
  'side delts': 'S.Delts',
  quadriceps: 'Quads',
  quads: 'Quads',
  hamstrings: 'Hams',
  glutes: 'Glutes',
  calves: 'Calves',
  forearms: 'Forems',
  abs: 'Abs',
  'upper abs': 'U.Abs',
  'lower abs': 'L.Abs',
  'upper chest': 'U.Chest',
  'mid chest': 'M.Chest',
  'lower chest': 'L.Chest',
  traps: 'Traps',
  'lower back': 'L.Back',
  'middle back': 'M.Back',
  'upper back': 'U.Back',
  'spinal erectors': 'Erectors',
  brachialis: 'Brach',
  'biceps long': 'B.Long',
  'biceps short': 'B.Short',
  'triceps long': 'T.Long',
  'triceps lateral': 'T.Lat',
  'triceps medial': 'T.Med',
};

const MUSCLE_ALIAS_TABLE = [
  { match: ['upper chest', 'lower chest', 'pec', 'pectoral', 'chest'], muscle: 'chest' },
  { match: ['front deltoid', 'rear deltoid', 'deltoid', 'delt', 'shoulder'], muscle: 'shoulders' },
  { match: ['upper trap', 'lower trap', 'trapezius', 'trap'], muscle: 'traps' },
  { match: ['lat', 'lats'], muscle: 'lats' },
  { match: ['upper back', 'middle back', 'lower back', 'rhomboid', 'back'], muscle: 'back' },
  { match: ['biceps', 'bicep'], muscle: 'biceps' },
  { match: ['triceps', 'tricep'], muscle: 'triceps' },
  { match: ['forearm', 'hands'], muscle: 'forearms' },
  { match: ['quad', 'quadriceps', 'inner quad', 'outer quad'], muscle: 'quadriceps' },
  { match: ['hamstring', 'adductor'], muscle: 'hamstrings' },
  { match: ['glute', 'abductor'], muscle: 'glutes' },
  { match: ['calf', 'tibialis'], muscle: 'calves' },
  { match: ['upper abs', 'lower abs', 'abdominal', 'abs', 'oblique', 'core'], muscle: 'abs' },
];

const EXERCISE_NAME_HINTS = [
  { re: /(bench|chest|pec|fly|push[-\s]?up|pushup)/i, muscles: ['chest'] },
  { re: /(tricep|skull crusher|pushdown|overhead extension|dip)/i, muscles: ['triceps'] },
  { re: /(bicep|curl|chin[-\s]?up|chinup)/i, muscles: ['biceps'] },
  { re: /(forearm|wrist curl|reverse curl)/i, muscles: ['forearms'] },
  { re: /(lat pull|pulldown|row|pull[-\s]?up|pullup|machine row)/i, muscles: ['back', 'lats'] },
  { re: /(shrug|trap|face pull)/i, muscles: ['traps'] },
  { re: /(shoulder press|overhead press|lateral raise|rear delt|front raise)/i, muscles: ['shoulders'] },
  { re: /(squat|leg press|lunge|split squat|leg extension)/i, muscles: ['quadriceps'] },
  { re: /(rdl|romanian deadlift|deadlift|good morning|hamstring|leg curl)/i, muscles: ['hamstrings'] },
  { re: /(hip thrust|glute bridge|kickback)/i, muscles: ['glutes'] },
  { re: /(calf)/i, muscles: ['calves'] },
  { re: /(plank|crunch|sit[-\s]?up|situp|leg raise|ab wheel|ab roller|hollow)/i, muscles: ['abs'] },
];

const VOLUME_EQUIVALENTS = [
  { threshold: 0, item: 'a loaded backpack' },
  { threshold: 1500, item: 'a full washing machine' },
  { threshold: 3000, item: 'a sport motorcycle' },
  { threshold: 6000, item: 'a grand piano' },
  { threshold: 10000, item: 'a compact car' },
  { threshold: 18000, item: 'an adult elephant' },
  { threshold: 30000, item: 'a city bus' },
  { threshold: 50000, item: 'a space shuttle' },
];

const EMPTY_ANALYTICS = Object.freeze({
  muscles: {},
  groups: {},
  readiness: {},
  totalWorkingSets: 0,
  totalVolumeKg: 0,
  imbalances: [],
});

function normalizeNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeMuscle(muscle) {
  return String(muscle || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function canonicalMuscle(muscle) {
  const normalized = String(muscle || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized === 'other' || normalized === 'strength') return '';

  for (const entry of MUSCLE_ALIAS_TABLE) {
    if (entry.match.some((token) => normalized.includes(token))) {
      return entry.muscle;
    }
  }
  return normalized;
}

function inferMusclesFromName(name) {
  const text = String(name || '');
  const hits = [];
  EXERCISE_NAME_HINTS.forEach((hint) => {
    if (hint.re.test(text)) hits.push(...hint.muscles);
  });
  return [...new Set(hits.map(canonicalMuscle).filter(Boolean))];
}

function getShortName(muscle) {
  const m = normalizeMuscle(muscle);
  return MUSCLE_SHORT[m] || (m.length > 6 ? m.slice(0, 6) : m);
}

function formatMuscleLabel(muscle) {
  return normalizeMuscle(muscle)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getBarColor(sets) {
  if (sets >= 25) return '#FF4444';
  if (sets >= 21) return '#FF6B35';
  if (sets >= 10) return '#00C170';
  return '#FFD700';
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateShort(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : 0;
}

function getSetVolumeKg(set) {
  if (!set) return 0;
  if (String(set.type || '').toLowerCase() === 'warmup') return 0;
  const weight = parseNumber(set.weight ?? set.kg ?? set.load ?? 0);
  const reps = parseNumber(set.reps ?? set.rep ?? 0);
  if (weight <= 0 || reps <= 0) return 0;
  return weight * reps;
}

function getVolumeEquivalent(totalVolumeKg) {
  let match = VOLUME_EQUIVALENTS[0];
  VOLUME_EQUIVALENTS.forEach((entry) => {
    if (totalVolumeKg >= entry.threshold) match = entry;
  });
  return match.item;
}

function formatVolumeKg(totalVolumeKg, unit = 'kg') {
  const converted = unit === 'lbs' ? totalVolumeKg * 2.2046226218 : totalVolumeKg;
  if (converted >= 1000) return `${(converted / 1000).toFixed(1)}t`;
  return `${Math.round(converted)}${unit}`;
}

function roundMetric(value, decimals = 1) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function formatSetsValue(value, compact = true) {
  const rounded = roundMetric(value, 1);
  if (compact && Math.abs(rounded) >= 100) return String(Math.round(rounded));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function isSameWeek(sessionDate, monday) {
  const d = new Date(sessionDate);
  d.setHours(0, 0, 0, 0);
  const sun = new Date(monday);
  sun.setDate(monday.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return d >= monday && d <= sun;
}

function muscleToRadarGroup(muscle) {
  const m = canonicalMuscle(muscle);
  return RADAR_GROUP_BY_MUSCLE[m] || null;
}

function exerciseWorkingSetCount(exercise) {
  if (!exercise) return 0;
  if (Array.isArray(exercise.sets)) {
    return exercise.sets.filter((set) => {
      if (!set || typeof set !== 'object') return true;
      return set.type !== 'warmup';
    }).length;
  }
  if (typeof exercise.sets === 'number') return Math.max(0, exercise.sets);
  return 0;
}

function findLibraryMatch(exercise, exerciseLookup) {
  const byId = exercise?.exerciseId ? exerciseLookup.byId[exercise.exerciseId] : null;
  if (byId) return byId;

  const key = normalizeNameKey(exercise?.name);
  if (!key) return null;
  const byName = exerciseLookup.byName[key];
  if (byName) return byName;

  return exerciseLookup.entries.find((entry) => {
    const candidate = normalizeNameKey(entry.name);
    if (!candidate) return false;
    return candidate.includes(key) || key.includes(candidate);
  }) || null;
}

function collectExerciseMuscles(exercise, push) {
  if (!exercise) return;
  (exercise.primaryMuscles || []).forEach(push);
  (exercise.secondaryMuscles || []).forEach(push);
  push(exercise.primaryMuscle);
  push(exercise.primary);
  push(exercise.muscle);
  push(exercise.target);
  push(exercise.targetMuscle);
  push(exercise.bodyPart);
}

function resolveExerciseMuscles(exercise, exerciseLookup, exerciseMap) {
  const muscles = new Set();
  const push = (value) => {
    const canonical = canonicalMuscle(value);
    if (canonical) muscles.add(canonical);
  };

  collectExerciseMuscles(exercise, push);
  const libExercise = findLibraryMatch(exercise, exerciseLookup);
  collectExerciseMuscles(libExercise, push);

  const mapState = exerciseMap?.[exercise?.name]
    || (libExercise ? exerciseMap?.[libExercise.name] : null);
  if (mapState?.contribution) {
    Object.keys(mapState.contribution).forEach(push);
  }

  if (muscles.size === 0) {
    inferMusclesFromName(exercise?.name).forEach((muscle) => muscles.add(muscle));
  }

  return [...muscles];
}

function RadarChart({ data, colors }) {
  const size = Math.min(CHART_WIDTH - 24, 300);
  const center = size / 2;
  const radius = size * 0.32;
  const levels = [0.25, 0.5, 0.75, 1];
  const maxValue = Math.max(1, ...RADAR_GROUPS.map((group) => data[group] || 0));

  const pointFor = (idx, ratio) => {
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / RADAR_GROUPS.length;
    const x = center + Math.cos(angle) * radius * ratio;
    const y = center + Math.sin(angle) * radius * ratio;
    return { x, y };
  };

  const polygonPoints = RADAR_GROUPS.map((group, idx) => {
    const value = data[group] || 0;
    const ratio = value / maxValue;
    const point = pointFor(idx, ratio);
    return `${point.x},${point.y}`;
  }).join(' ');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {levels.map((level) => {
          const points = RADAR_GROUPS.map((_, idx) => {
            const point = pointFor(idx, level);
            return `${point.x},${point.y}`;
          }).join(' ');
          return <Polygon key={`grid-${level}`} points={points} fill="none" stroke={colors.faint} strokeWidth={1} />;
        })}

        {RADAR_GROUPS.map((group, idx) => {
          const outer = pointFor(idx, 1);
          return <Line key={`axis-${group}`} x1={center} y1={center} x2={outer.x} y2={outer.y} stroke={colors.faint} strokeWidth={1} />;
        })}

        <Polygon points={polygonPoints} fill={colors.accent + '55'} stroke={colors.accent} strokeWidth={2} />

        {RADAR_GROUPS.map((group, idx) => {
          const value = data[group] || 0;
          const ratio = value / maxValue;
          const point = pointFor(idx, ratio);
          const labelPoint = pointFor(idx, 1.18);
          return (
            <React.Fragment key={`dot-${group}`}>
              <Circle cx={point.x} cy={point.y} r={4} fill={colors.accent} />
              <SvgText x={labelPoint.x} y={labelPoint.y} fill={colors.text} fontSize={12} fontWeight="700" textAnchor="middle">
                {RADAR_LABELS[group]}
              </SvgText>
              <SvgText x={labelPoint.x} y={labelPoint.y + 13} fill={colors.muted} fontSize={10} textAnchor="middle">
                {Math.round(value)}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function isWithinDays(sessionDate, days) {
  const stamp = new Date(sessionDate || 0).getTime();
  if (!Number.isFinite(stamp)) return false;
  return stamp >= (Date.now() - (days * 86400000));
}

export default function VolumeAnalyticsScreen() {
  const { history, plans, settings } = useContext(AppContext);
  const colors = useTheme();
  const weightUnit = settings?.weightUnit || 'kg';
  const analyticsReady = useDeferredScreenReady({ minDelayMs: 24 });
  const analyticsShareRef = useRef(null);
  const [windowKey, setWindowKey] = useState('current_week');
  const [shareStatus, setShareStatus] = useState('');
  const [libraryIndex, setLibraryIndex] = useState(EXERCISES);
  const activePlan = plans[0];
  const safePlanDays = useMemo(
    () => (Array.isArray(activePlan?.days) ? activePlan.days : []),
    [activePlan]
  );
  const programHasExercises = useMemo(() => {
    return safePlanDays.some((day) => Array.isArray(day?.exercises) && day.exercises.length > 0);
  }, [safePlanDays]);
  const effectiveWindow = windowKey === 'program' && !programHasExercises ? '7d' : windowKey;

  useEffect(() => {
    if (!analyticsReady) return undefined;
    let mounted = true;
    getExerciseIndex()
      .then((index) => {
        if (!mounted) return;
        if (Array.isArray(index) && index.length > 0) {
          setLibraryIndex(index);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [analyticsReady]);

  const exerciseLookup = useMemo(() => {
    const byId = {};
    const byName = {};
    const entries = [...libraryIndex, ...EXERCISES];
    entries.forEach((exercise) => {
      if (exercise.id) byId[exercise.id] = exercise;
      if (exercise.name) byName[normalizeNameKey(exercise.name)] = exercise;
    });
    return { byId, byName, entries };
  }, [libraryIndex]);

  const workoutCount = useMemo(() => {
    if (effectiveWindow === 'program') return safePlanDays.length;
    if (windowKey === '30d') return history.filter((session) => !session?.isDeload && isWithinDays(session.date, 30)).length;
    if (windowKey === '7d') return history.filter((session) => !session?.isDeload && isWithinDays(session.date, 7)).length;
    const monday = getMondayOfWeek(new Date());
    return history.filter((session) => !session?.isDeload && isSameWeek(session.date, monday)).length;
  }, [effectiveWindow, history, safePlanDays.length, windowKey]);

  const analytics = useMemo(() => {
    if (!analyticsReady) return EMPTY_ANALYTICS;
    return computeMuscleAnalytics({
      history,
      exerciseIndex: exerciseLookup.entries,
      activePlan,
      window: effectiveWindow,
    });
  }, [activePlan, analyticsReady, effectiveWindow, exerciseLookup.entries, history]);

  useEffect(() => {
    if (windowKey === 'program' && !programHasExercises) {
      setWindowKey('7d');
    }
  }, [programHasExercises, windowKey]);

  const sortedMuscles = useMemo(() => {
    return Object.entries(analytics.muscles || {})
      .map(([muscle, metrics]) => [muscle, roundMetric(metrics.effectiveSets || 0, 3)])
      .filter(([, sets]) => sets > 0.15)
      .sort((a, b) => b[1] - a[1]);
  }, [analytics.muscles]);

  const maxSets = useMemo(() => {
    if (sortedMuscles.length === 0) return 1;
    return Math.max(...sortedMuscles.map((entry) => entry[1]));
  }, [sortedMuscles]);

  const pushSets = useMemo(() => (analytics.groups?.chest || 0) + (analytics.groups?.shoulders || 0), [analytics.groups]);
  const pullSets = useMemo(() => (analytics.groups?.back || 0) + (analytics.muscles?.bicepsLong?.effectiveSets || 0) + (analytics.muscles?.bicepsShort?.effectiveSets || 0), [analytics.groups, analytics.muscles]);
  const legSets = useMemo(() => analytics.groups?.legs || 0, [analytics.groups]);
  const pplTotal = pushSets + pullSets + legSets;

  const barCount = sortedMuscles.length;
  const BAR_PAD = 8;
  const barWidth = barCount > 0 ? Math.max(18, Math.min(40, (CHART_WIDTH - BAR_PAD * 2) / barCount - BAR_PAD)) : 30;
  const barSpacing = barCount > 0 ? (CHART_WIDTH - BAR_PAD * 2 - barWidth * barCount) / Math.max(barCount - 1, 1) : 0;
  const windowLabel = useMemo(() => {
    if (effectiveWindow === 'program') return activePlan?.name ? `${activePlan.name} · program view` : 'Program view';
    if (windowKey === '30d') return 'Last 30 days';
    if (windowKey === '7d') return 'Last 7 days';
    return 'Current week';
  }, [activePlan?.name, effectiveWindow, windowKey]);
  const compactNumbers = settings?.compactAnalyticsNumbers !== false;
  const shareFunLine = useMemo(() => {
    if (!analyticsReady) return 'Preparing muscle analytics...';
    if (analytics.totalVolumeKg <= 0) return 'Log training to unlock your volume interpretation.';
    return buildVolumeInterpretationSentence({
      totalKg: analytics.totalVolumeKg,
      baselineLabel: effectiveWindow === 'program' ? 'your current program target' : 'your recent baseline',
    });
  }, [analytics.totalVolumeKg, analyticsReady, effectiveWindow]);

  const handleShare = async () => {
    if (!analyticsReady) return;
    try {
      setShareStatus('');
      const uri = await captureRef(analyticsShareRef, { format: 'png', quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setShareStatus('Sharing is unavailable on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Volume Analytics',
      });
    } catch (error) {
      setShareStatus(`Share failed: ${String(error?.message || error)}`);
    }
  };

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={s.content}>
      <View style={s.weekRow}>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[s.weekLabel, { color: colors.text }]}>MUSCLE ANALYTICS</Text>
          <Text style={[s.currentBadge, { color: colors.accent }]}>{windowLabel}</Text>
        </View>

        <TouchableOpacity
          onPress={handleShare}
          disabled={!analyticsReady}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 8, opacity: analyticsReady ? 1 : 0.45 }}
        >
          <Ionicons name="share-social-outline" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {[
          ['current_week', 'Week'],
          ['7d', '7D'],
          ['30d', '30D'],
          ['program', 'Program'],
        ].map(([key, label]) => {
          const disabled = key === 'program' && !programHasExercises;
          return (
            <TouchableOpacity
              key={key}
              onPress={disabled ? undefined : () => setWindowKey(key)}
              disabled={disabled}
              style={[s.windowChip, {
                opacity: disabled ? 0.45 : 1,
                borderColor: windowKey === key ? colors.accent : colors.faint,
                backgroundColor: windowKey === key ? colors.accentSoft : 'transparent',
              }]}>
              <Text style={[s.windowChipText, { color: windowKey === key ? colors.accent : colors.muted }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {shareStatus ? <Text style={[s.shareStatus, { color: colors.muted }]}>{shareStatus}</Text> : null}
      {!analyticsReady ? <Text style={[s.shareStatus, { color: colors.muted }]}>Preparing analytics after the transition settles.</Text> : null}

      <View ref={analyticsShareRef} collapsable={false}>
        <View style={[s.shareHeaderCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[s.shareBrand, { color: colors.text }]}>IRONLOG</Text>
          <Text style={[s.shareTitle, { color: colors.text }]}>VOLUME ANALYTICS</Text>
          <Text style={[s.shareWeek, { color: colors.muted }]}>{windowLabel}</Text>
          <Text style={[s.shareFun, { color: colors.accent }]}>{shareFunLine}</Text>
        </View>

        <View style={[s.statsRow, { borderColor: colors.faint }]}>
            {[
            { val: workoutCount, label: effectiveWindow === 'program' ? 'Plan Days' : 'Workouts' },
            { val: Math.round(analytics.totalWorkingSets), label: 'Direct Sets' },
            { val: sortedMuscles.length, label: 'Muscles Hit' },
            { val: formatVolumeKg(analytics.totalVolumeKg, weightUnit), label: `Volume (${weightUnit})` },
          ].map(({ val, label }, idx) => (
            <React.Fragment key={label}>
              {idx > 0 && <View style={[s.statDivider, { backgroundColor: colors.faint }]} />}
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: colors.accent }]}>{val}</Text>
                <Text style={[s.statLbl, { color: colors.muted }]}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>MUSCLE VOLUME RADAR</Text>
        {analytics.totalWorkingSets === 0 ? (
          <View style={s.emptyChart}>
            <Text style={[s.emptyText, { color: colors.muted }]}>No training logged for this view</Text>
          </View>
        ) : (
          <RadarChart data={analytics.groups} colors={colors} />
        )}
      </View>

      {analytics.imbalances?.length ? (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>IMBALANCE INSIGHTS</Text>
          {analytics.imbalances.slice(0, 3).map((insight) => (
            <View key={insight.id} style={[s.insightRow, { borderColor: colors.faint }]}>
              <Text style={[s.insightText, { color: colors.text }]}>{insight.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>EFFECTIVE SETS PER MUSCLE</Text>
        {barCount === 0 ? (
          <View style={s.emptyChart}>
            <Text style={[s.emptyText, { color: colors.muted }]}>No training logged for this view</Text>
          </View>
        ) : (
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            {[0.25, 0.5, 0.75, 1].map((f) => {
              const y = TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT * (1 - f);
              return (
                <React.Fragment key={f}>
                  <Line x1={0} y1={y} x2={CHART_WIDTH} y2={y} stroke={colors.faint} strokeWidth={1} strokeDasharray="4,4" />
                  <SvgText x={2} y={y - 3} fontSize={9} fill={colors.muted}>{Math.round(maxSets * f)}</SvgText>
                </React.Fragment>
              );
            })}

            <Line x1={0} y1={TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT} x2={CHART_WIDTH} y2={TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT} stroke={colors.faint} strokeWidth={1} />

            {sortedMuscles.map(([muscle, sets], idx) => {
              const barHeight = maxSets > 0 ? (sets / maxSets) * BAR_AREA_HEIGHT : 0;
              const x = BAR_PAD + idx * (barWidth + barSpacing);
              const y = TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT - barHeight;
              const barColor = getBarColor(sets);
              return (
                <React.Fragment key={muscle}>
                  <Rect x={x} y={y} width={barWidth} height={Math.max(2, barHeight)} fill={barColor} rx={3} ry={3} />
                  <SvgText x={x + barWidth / 2} y={y - 4} fontSize={10} fontWeight="bold" fill={colors.text} textAnchor="middle">
                    {formatSetsValue(sets, compactNumbers)}
                  </SvgText>
                  <SvgText
                    x={x + barWidth / 2}
                    y={TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT + 6}
                    fontSize={9}
                    fill={colors.subtext}
                    textAnchor="end"
                    transform={`rotate(-45, ${x + barWidth / 2}, ${TOP_LABEL_HEIGHT + BAR_AREA_HEIGHT + 6})`}>
                    {getShortName(muscle)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        )}

        <View style={s.legendRow}>
          {[
            { color: '#FFD700', label: '0–9' },
            { color: '#00C170', label: '10–20' },
            { color: '#FF6B35', label: '21–25' },
            { color: '#FF4444', label: '25+' },
          ].map(({ color, label }) => (
            <View key={label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: color }]} />
              <Text style={[s.legendText, { color: colors.subtext }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>PUSH / PULL / LEGS BALANCE</Text>
        {pplTotal === 0 ? (
            <Text style={[s.emptyText, { color: colors.muted }]}>No push/pull/leg data for this view</Text>
        ) : (
          <>
            <View style={s.pplBar}>
              {pushSets > 0 && <View style={[s.pplSeg, { flex: pushSets, backgroundColor: '#4A9EFF', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />}
              {pullSets > 0 && <View style={[s.pplSeg, { flex: pullSets, backgroundColor: '#00C170' }]} />}
              {legSets > 0 && <View style={[s.pplSeg, { flex: legSets, backgroundColor: '#FF6B35', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />}
            </View>
            <View style={s.pplLabels}>
              {[
                { label: 'Push', sets: pushSets, color: '#4A9EFF' },
                { label: 'Pull', sets: pullSets, color: '#00C170' },
                { label: 'Legs', sets: legSets, color: '#FF6B35' },
              ].map(({ label, sets, color }) => (
                <View key={label} style={s.pplItem}>
                  <View style={[s.pplDot, { backgroundColor: color }]} />
                  <Text style={[s.pplLabelText, { color: colors.text }]}>{label}</Text>
                  <Text style={[s.pplCount, { color }]}>{formatSetsValue(sets, compactNumbers)}</Text>
                  <Text style={[s.pplPct, { color: colors.muted }]}>{Math.round((sets / pplTotal) * 100)}%</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>MUSCLE BREAKDOWN</Text>
        {sortedMuscles.length === 0 ? (
          <Text style={[s.emptyText, { color: colors.muted }]}>No data for this view</Text>
        ) : (
          sortedMuscles.map(([muscle, sets]) => {
            const color = getBarColor(sets);
            const pct = maxSets > 0 ? sets / maxSets : 0;
            const displayName = formatMuscleLabel(muscle);
            return (
              <View key={muscle} style={s.muscleRow}>
                <View style={s.muscleLeft}>
                  <View style={[s.muscleIndicator, { backgroundColor: color }]} />
                  <Text style={[s.muscleName, { color: colors.text }]}>{displayName}</Text>
                </View>
                <View style={[s.muscleBarBg, { backgroundColor: colors.faint }]}>
                  <View style={[s.muscleFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color + '88', borderColor: color }]} />
                </View>
                <Text style={[s.muscleCount, { color }]}>{formatSetsValue(sets, compactNumbers)}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  weekLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  currentBadge: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  windowChip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 16 },
  windowChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  shareStatus: { fontSize: 11, marginBottom: 8, textAlign: 'center' },
  shareHeaderCard: { borderWidth: 1, padding: 14, marginBottom: 12, alignItems: 'center' },
  shareBrand: { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  shareTitle: { fontSize: 11, letterSpacing: 2, fontWeight: '800', marginTop: 2 },
  shareWeek: { fontSize: 11, marginTop: 6, letterSpacing: 1 },
  shareFun: { fontSize: 11, marginTop: 8, textAlign: 'center', lineHeight: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statVal: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 10, marginTop: 2, letterSpacing: 1 },
  statDivider: { width: 1, marginVertical: 8 },
  card: { borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 3, marginBottom: 14 },
  insightRow: { borderWidth: 1, padding: 12, marginBottom: 8 },
  insightText: { fontSize: 12, lineHeight: 18 },
  emptyChart: { height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8, flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  pplBar: { flexDirection: 'row', height: 20, overflow: 'hidden', marginBottom: 12 },
  pplSeg: { height: '100%' },
  pplLabels: { flexDirection: 'row', justifyContent: 'space-around' },
  pplItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pplDot: { width: 10, height: 10, borderRadius: 5 },
  pplLabelText: { fontSize: 13, fontWeight: '600' },
  pplCount: { fontSize: 13, fontWeight: '700' },
  pplPct: { fontSize: 11 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  muscleLeft: { flexDirection: 'row', alignItems: 'center', width: 96, gap: 8 },
  muscleIndicator: { width: 10, height: 10, borderRadius: 5 },
  muscleName: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  muscleBarBg: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  muscleFill: { height: '100%', borderRadius: 7, borderWidth: 1, minWidth: 4 },
  muscleCount: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
