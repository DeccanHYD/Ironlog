
import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput,
  StyleSheet, Modal, AppState, FlatList,
  TouchableOpacity, Linking
} from 'react-native';
import { TouchableOpacity as RNGHTouchableOpacity } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { WorkoutProvider, useWorkout } from '../context/WorkoutContext';
import { useActiveBanner } from '../context/ActiveWorkoutBannerContext';
import useDeferredScreenReady from '../hooks/useDeferredScreenReady';
import SetRow from '../components/SetRow';
import CustomAlert from '../components/CustomAlert';
import WorkoutShareCard from '../components/WorkoutShareCard';
import { calcPlates } from '../utils/plateCalc';
import { epley } from '../utils/oneRM';
import { getExerciseIndex } from '../services/ExerciseLibraryService';
import { EXERCISES } from '../data/exerciseLibrary';
import { EXERCISE_ID_MAP } from '../data/exerciseMapping';
import { buildProgressionSuggestion } from '../domain/intelligence/progressionEngine';
import { buildWorkoutCompletionSummary } from '../domain/intelligence/trainingAnalyticsEngine';
import { rankSubstitutionCandidates } from '../domain/intelligence/substitutionEngine';
import { buildVolumeInterpretation } from '../domain/intelligence/volumeInterpretationEngine';
import {
  computeWorkoutPerformanceScore,
  detectPREvents,
} from '../domain/intelligence/performanceEngine';
import {
  getRecentComparisonUsage,
  recordComparisonUsage,
} from '../domain/storage/trainingRepository';
import { triggerHaptic } from '../services/hapticsEngine';
import { resolveExerciseYoutubeMeta } from '../utils/exerciseVideoLinks';
import {
  buildFilterChipOptions,
  getExerciseFilterSummary,
  matchesExerciseFilter,
} from '../utils/exerciseFilters';
import { resolveExerciseProfile } from '../domain/intelligence/exerciseProfileEngine';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const ACTIVE_WORKOUT_SESSION_PREFIX = '@ironlog/activeWorkoutSession/';

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getExerciseMuscles(exercise) {
  return getExerciseFilterSummary(exercise, 6);
}

function getPlateText(targetKg, barWeight, profilePlates) {
  const perSide = (targetKg - barWeight) / 2;
  if (perSide <= 0) return 'Bar only';
  const plates = profilePlates?.length
    ? profilePlates.map(p => p.weight).sort((a, b) => b - a)
    : [20, 15, 10, 5, 2.5, 1.25];
  const result = [];
  let rem = Math.round(perSide * 100) / 100;
  for (const p of plates) {
    while (rem >= p - 0.001) { result.push(p); rem = Math.round((rem - p) * 100) / 100; }
  }
  if (result.length === 0) return 'Bar only';
  return result.map(p => p + 'kg').join(' + ') + ' each side';
}

function parseRepTarget(value, fallback = 8) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function normalizeSessionExercise(exercise = {}) {
  return {
    ...exercise,
    name: exercise.name || 'Custom Exercise',
    exerciseId: exercise.exerciseId || exercise.id || exercise.name || genId(),
    sets: Number(exercise.sets || 3),
    reps: parseRepTarget(exercise.reps, 8),
    isWarmup: !!exercise.isWarmup,
  };
}

function supportsPlateBreakdown(exercise) {
  const profile = resolveExerciseProfile(exercise || {});
  return profile?.equipmentClass === 'barbell';
}

const RATE_THRESHOLDS = [10, 25, 50];

const GROUP_COLORS = { A: '#FF4500', B: '#0080FF', C: '#00C170' };

const FUN_COMPARISONS = [
  { threshold: 0,     text: 'a house cat',       icon: '🐱' },
  { threshold: 500,   text: 'a baby goat',        icon: '🐐' },
  { threshold: 1000,  text: 'a large pumpkin',    icon: '🎃' },
  { threshold: 2000,  text: 'a baby elephant',    icon: '🐘' },
  { threshold: 3500,  text: 'a baby hippo',       icon: '🦛' },
  { threshold: 5000,  text: 'a grand piano',      icon: '🎹' },
  { threshold: 7500,  text: 'a polar bear',       icon: '🐻‍❄️' },
  { threshold: 10000, text: 'a small car',        icon: '🚗' },
  { threshold: 15000, text: 'a T-Rex',            icon: '🦖' },
  { threshold: 20000, text: 'a rhino',            icon: '🦏' },
  { threshold: 25000, text: 'an orca whale',      icon: '🐋' },
  { threshold: 35000, text: 'an elephant',        icon: '🐘' },
  { threshold: 40000, text: 'a school bus',       icon: '🚌' },
  { threshold: 60000, text: 'a space shuttle',    icon: '🚀' },
  { threshold: 100000, text: 'a blue whale',      icon: '🐳' },
];

function getFunComparison(totalKg) {
  let match = FUN_COMPARISONS[0];
  for (const c of FUN_COMPARISONS) {
    if (totalKg >= c.threshold) match = c;
    else break;
  }
  return match;
}

// ─── REST TIMER CIRCLE ───────────────────────────────────────────────────────

function RestTimerCircle({ seconds, total, paused, onSkip, onAdd30, onPause, onResume, accent }) {
  const colors = useTheme();
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const frac = Math.max(0, seconds / Math.max(total, 1));
  const dash = frac * CIRC;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const col = accent || '#FF4500';
  const trackColor = colors.faint || '#2a2a2a';
  const timerTextColor = paused ? (colors.muted || '#888') : (colors.text || '#f0f0f0');
  const pausedTextColor = colors.muted || '#777';
  return (
    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
      <View style={{ width: 130, height: 130 }}>
        <Svg width={130} height={130} style={{ position: 'absolute' }}>
          <Circle cx={65} cy={65} r={R} stroke={trackColor} strokeWidth={6} fill="none" />
          <Circle cx={65} cy={65} r={R} stroke={paused ? (colors.muted || '#777') : col} strokeWidth={6} fill="none"
            strokeDasharray={dash + ' ' + CIRC} strokeLinecap="round"
            rotation={-90} originX={65} originY={65} />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: timerTextColor, letterSpacing: 1 }}>
            {mm}:{ss}
          </Text>
          {paused ? <Text style={{ fontSize: 9, letterSpacing: 3, color: pausedTextColor, marginTop: 2 }}>PAUSED</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        <TouchableOpacity style={[rt.btn, { borderColor: trackColor, backgroundColor: colors.card }]} onPress={onAdd30}>
          <Text style={[rt.btnText, { color: colors.subtext || '#888' }]}>+30s</Text>
        </TouchableOpacity>
        {paused ? (
          <TouchableOpacity style={[rt.btn, { backgroundColor: col, borderColor: col }]} onPress={onResume}>
            <Text style={[rt.btnText, { color: '#fff' }]}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[rt.btn, { borderColor: trackColor, backgroundColor: colors.card }]} onPress={onPause}>
            <Text style={[rt.btnText, { color: colors.subtext || '#888' }]}>PAUSE</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[rt.btn, { backgroundColor: col, borderColor: col }]} onPress={onSkip}>
          <Text style={[rt.btnText, { color: '#fff' }]}>SKIP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const rt = StyleSheet.create({
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#333' },
  btnText: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 1 },
});

// ─── PLATE MODAL ─────────────────────────────────────────────────────────────

function PlateModal({ visible, targetKg, barWeight, onClose }) {
  const result = calcPlates(targetKg, barWeight);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={pm.sheet}>
          <Text style={pm.title}>PLATE CALCULATOR</Text>
          <Text style={pm.target}>{targetKg} kg total</Text>
          {result.valid ? (
            <>
              <Text style={pm.label}>Each side:</Text>
              {result.each.length === 0
                ? <Text style={pm.noPlates}>Bar only ({barWeight}kg)</Text>
                : result.each.map((p, i) => (
                    <View key={i} style={pm.plateRow}>
                      <View style={[pm.plateVis, { width: 20 + p.kg * 2 }]} />
                      <Text style={pm.plateText}>{p.kg}kg x {p.count}</Text>
                    </View>
                  ))}
              <Text style={pm.sub}>Bar: {barWeight}kg · Total: {result.total}kg</Text>
            </>
          ) : (
            <Text style={{ color: '#FF4500', textAlign: 'center' }}>Cannot load {targetKg}kg with available plates.</Text>
          )}
          <TouchableOpacity style={pm.close} onPress={() => { triggerHaptic('selection').catch(() => {}); onClose(); }}>
            <Text style={{ color: '#f0f0f0', fontWeight: '700', letterSpacing: 2 }}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0d0d0d', padding: 24, borderTopWidth: 1, borderTopColor: '#222' },
  title: { fontSize: 11, letterSpacing: 4, color: '#444', marginBottom: 4 },
  target: { fontSize: 28, fontWeight: '900', color: '#f0f0f0', marginBottom: 16 },
  label: { fontSize: 10, letterSpacing: 3, color: '#555', marginBottom: 8 },
  noPlates: { color: '#888', marginBottom: 8 },
  plateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  plateVis: { height: 24, backgroundColor: '#FF4500', borderRadius: 2 },
  plateText: { fontSize: 16, fontWeight: '700', color: '#f0f0f0' },
  sub: { fontSize: 11, color: '#444', marginTop: 12 },
  close: { marginTop: 20, padding: 16, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
});

// ─── REST OVERRIDE MODAL ─────────────────────────────────────────────────────

function RestOverrideModal({ visible, current, onSave, onClose }) {
  const [val, setVal] = useState(String(current));
  useEffect(() => { setVal(String(current)); }, [current]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0d0d0d', padding: 28, width: 280, borderWidth: 1, borderColor: '#222' }}>
          <Text style={{ fontSize: 11, letterSpacing: 4, color: '#444', marginBottom: 12 }}>REST TIME (seconds)</Text>
          <TextInput
            style={{ fontSize: 32, fontWeight: '900', color: '#f0f0f0', borderBottomWidth: 2, borderBottomColor: '#FF4500', paddingVertical: 8, textAlign: 'center' }}
            value={val} onChangeText={setVal} keyboardType="numeric" autoFocus />
          <TouchableOpacity
            style={{ marginTop: 20, padding: 14, backgroundColor: '#FF4500', alignItems: 'center' }}
            onPress={() => { const n = parseInt(val); triggerHaptic('lightConfirm').catch(() => {}); if (n > 0) onSave(n); onClose(); }}>
            <Text style={{ color: '#fff', fontWeight: '800', letterSpacing: 2 }}>SET</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 10, padding: 10, alignItems: 'center' }} onPress={() => { triggerHaptic('selection').catch(() => {}); onClose(); }}>
            <Text style={{ color: '#555' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── COPY PREVIOUS MODAL ─────────────────────────────────────────────────────

function CopyPreviousModal({ visible, onCopy, onFresh }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <View style={{ backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#222', padding: 28, width: '100%' }}>
          <Text style={{ fontSize: 11, letterSpacing: 4, color: '#444', marginBottom: 8 }}>LAST SESSION FOUND</Text>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#f0f0f0', marginBottom: 20 }}>Copy previous weights?</Text>
          <Text style={{ fontSize: 13, color: '#555', marginBottom: 24, lineHeight: 20 }}>
            Pre-fill your inputs with last session's weights and reps.
          </Text>
          <TouchableOpacity
            style={{ padding: 16, backgroundColor: '#FF4500', alignItems: 'center', marginBottom: 10 }}
            onPress={() => { triggerHaptic('lightConfirm').catch(() => {}); onCopy(); }}>
            <Text style={{ color: '#fff', fontWeight: '800', letterSpacing: 2 }}>COPY PREVIOUS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ padding: 14, borderWidth: 1, borderColor: '#222', alignItems: 'center' }}
            onPress={() => { triggerHaptic('selection').catch(() => {}); onFresh(); }}>
            <Text style={{ color: '#555', fontWeight: '700', letterSpacing: 1 }}>START FRESH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── SUPERSET ASSIGN MODAL ───────────────────────────────────────────────────

function SupersetModal({ visible, currentGroup, onAssign, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <View style={{ backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#222', padding: 24, width: '100%' }}>
          <Text style={{ fontSize: 11, letterSpacing: 4, color: '#444', marginBottom: 20 }}>ASSIGN TO SUPERSET</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {['A', 'B', 'C'].map(g => (
              <TouchableOpacity
                key={g}
                style={{ flex: 1, padding: 16, borderWidth: 2, borderColor: GROUP_COLORS[g], alignItems: 'center',
                  backgroundColor: currentGroup === g ? GROUP_COLORS[g] + '33' : 'transparent' }}
                onPress={() => { triggerHaptic('selection').catch(() => {}); onAssign(g); onClose(); }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: GROUP_COLORS[g] }}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {currentGroup ? (
            <TouchableOpacity
              style={{ padding: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center', marginBottom: 10 }}
              onPress={() => { triggerHaptic('selection').catch(() => {}); onAssign(null); onClose(); }}>
              <Text style={{ color: '#666', letterSpacing: 1 }}>Remove from Superset</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={{ padding: 12, alignItems: 'center' }} onPress={() => { triggerHaptic('selection').catch(() => {}); onClose(); }}>
            <Text style={{ color: '#444' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── SWAP EXERCISE MODAL ──────────────────────────────────────────────────────

function SwapModal({ visible, exercise, onSwap, onClose, colors, mode = 'swap' }) {
  const [allExercises, setAllExercises] = useState([]);
  const [search, setSearch] = useState('');
  const defaultMuscle = getExerciseFilterSummary(exercise, 1)[0] || 'All';
  const [muscle, setMuscle] = useState(defaultMuscle);
  const [muscles, setMuscles] = useState([]);
  const isLibraryMode = mode === 'library';

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setMuscle(defaultMuscle);
    getExerciseIndex().then(idx => {
      if (!idx) return;
      setAllExercises(idx);
      setMuscles(buildFilterChipOptions(idx, {
        includeCategory: true,
        includeEquipment: isLibraryMode,
      }));
    });
  }, [isLibraryMode, visible, defaultMuscle]);

  if (!visible) return null;

  const currentEquipment = exercise?.equipment || '';
  const filteredBase = allExercises.filter((e) => {
    const ms = matchesExerciseFilter(e, muscle, {
      includeCategory: true,
      includeEquipment: isLibraryMode,
    });
    const sr = !search || e.name.toLowerCase().includes(search.toLowerCase());
    return ms && sr;
  });
  const filtered = isLibraryMode
    ? filteredBase
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((candidate) => ({
          ...candidate,
          sameEquipment: candidate.equipment === currentEquipment,
        }))
    : rankSubstitutionCandidates({
        exercise,
        candidates: filteredBase,
        limit: filteredBase.length || 40,
      }).map((candidate) => ({
        ...candidate,
        sameEquipment: candidate.equipment === currentEquipment,
      }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' }}>
        <View style={{ height: '85%', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '900', letterSpacing: 3, color: colors.text }}>
              {isLibraryMode ? 'ADD FROM LIBRARY' : 'SWAP EXERCISE'}
            </Text>
            <TouchableOpacity onPress={() => { triggerHaptic('selection').catch(() => {}); onClose(); }}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {isLibraryMode ? (
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10, lineHeight: 16 }}>
              Browse the full exercise library, then add the movement you want to this workout.
            </Text>
          ) : null}
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.faint, color: colors.text, padding: 12, fontSize: 15, marginBottom: 10 }}
            placeholder="Search..." placeholderTextColor={colors.muted}
            value={search} onChangeText={setSearch} />
          <View style={{ height: 42, marginBottom: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingVertical: 2, alignItems: 'center' }}>
              {['All', ...muscles].map(m => (
                <TouchableOpacity key={m} onPress={() => { triggerHaptic('selection').catch(() => {}); setMuscle(m); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1,
                    borderColor: muscle === m ? colors.accent : colors.faint,
                    backgroundColor: muscle === m ? colors.accentSoft : 'transparent' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: muscle === m ? colors.accent : colors.muted }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <Text style={{ fontSize: 10, letterSpacing: 2, color: colors.muted, marginBottom: 8 }}>
            {filtered.length} exercises
          </Text>
          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item: ex }) => (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.faint }}
                onPress={() => { triggerHaptic('lightConfirm').catch(() => {}); onSwap(ex); onClose(); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>{ex.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                    {getExerciseFilterSummary(ex).join(', ')}{ex.equipment ? ` · ${toTitleCase(ex.equipment)}` : ''}
                  </Text>
                  {!isLibraryMode && ex.substitutionReason ? (
                    <Text style={{ fontSize: 10, color: colors.accent, marginTop: 2 }} numberOfLines={1}>
                      {ex.substitutionReason}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name={isLibraryMode ? 'add-circle-outline' : 'swap-horizontal'} size={18} color={colors.accent} />
              </TouchableOpacity>
            )}
            getItemLayout={(_, i) => ({ length: 60, offset: 60 * i, index: i })}
            windowSize={10}
            initialNumToRender={20}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.muted }}>No exercises match this search/filter.</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── WORKOUT CONTENT ─────────────────────────────────────────────────────────

function WorkoutContent({ plan, day, planIndex, dayIndex, navigation }) {
  useKeepAwake();

  const { history, pb, settings, addHistory, updatePb, saveExerciseNotes, isHeavy, exerciseNotes, activeGymProfile, updateSettings } = useContext(AppContext);
  const colors = useTheme();
  const transitionReady = useDeferredScreenReady({ minDelayMs: 16, resetOnBlur: false });
  const s = makeStyles(colors);
  const { state, dispatch } = useWorkout();
  const { setBanner } = useActiveBanner();
  const haptic = settings.hapticFeedback !== false;

  const [extraExercises, setExtraExercises] = useState([]);
  const baseExercises = useMemo(
    () => (Array.isArray(day?.exercises) ? day.exercises.filter((exercise) => !exercise?.isWarmup).map(normalizeSessionExercise) : []),
    [day?.exercises]
  );
  const workingExercises = useMemo(
    () => [...baseExercises, ...extraExercises.map(normalizeSessionExercise)],
    [baseExercises, extraExercises]
  );

  // Local UI state
  const [restOverride, setRestOverride] = useState({});
  const [showRestOverride, setShowRestOverride] = useState(false);
  const [editingRestEx, setEditingRestEx] = useState(null);
  const [showPlates, setShowPlates] = useState(false);
  const [platesTarget, setPlatesTarget] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [displaySecs, setDisplaySecs] = useState(0);
  const [supersetModalEx, setSupersetModalEx] = useState(null);
  const [swapModalEx, setSwapModalEx] = useState(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [isDeload, setIsDeload] = useState(false);
  const [orderedIndices, setOrderedIndices] = useState(() => workingExercises.map((_, i) => i));
  const [completionSummary, setCompletionSummary] = useState(null);
  const [quitAlert, setQuitAlert] = useState(false);
  const [nextTargets, setNextTargets] = useState(null); // [{ name, weight, reps }] | null
  const [showShareModal, setShowShareModal] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [ratePrompt, setRatePrompt] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [libraryIndex, setLibraryIndex] = useState(EXERCISES);
  const shareCardRef = useRef(null);
  const sessionKey = useMemo(
    () => `${ACTIVE_WORKOUT_SESSION_PREFIX}${plan?.id || planIndex}:${day?.id || dayIndex}`,
    [plan?.id, planIndex, day?.id, dayIndex]
  );

  const startTime = useRef(Date.now());
  const restInterval = useRef(null);
  const restTimerRef = useRef(state.restTimer);
  const countdownHapticRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const copyModalShown = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    setExtraExercises([]);
  }, [day?.id]);

  useEffect(() => {
    if (!transitionReady) return undefined;
    let mounted = true;
    getExerciseIndex()
      .then((index) => {
        if (!mounted) return;
        if (Array.isArray(index) && index.length > 0) setLibraryIndex(index);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [transitionReady]);

  useEffect(() => {
    setOrderedIndices((prev) => {
      const seen = new Set(prev.filter((index) => index < workingExercises.length));
      const merged = [...seen];
      for (let index = 0; index < workingExercises.length; index += 1) {
        if (!seen.has(index)) merged.push(index);
      }
      return merged;
    });
  }, [workingExercises.length]);

  useEffect(() => { restTimerRef.current = state.restTimer; }, [state.restTimer]);

  const hasMeaningfulSessionState = useMemo(() => {
    const setCount = Object.values(state.setLog).reduce((total, sets) => total + sets.length, 0);
    return (
      setCount > 0 ||
      Object.keys(state.inputs).length > 0 ||
      Object.keys(state.exerciseNotes).length > 0 ||
      Object.keys(state.supersetGroups).length > 0 ||
      Object.keys(state.swappedExercises).length > 0 ||
      state.restTimer.active ||
      state.copiedPrevious
    );
  }, [state.setLog, state.inputs, state.exerciseNotes, state.supersetGroups, state.swappedExercises, state.restTimer.active, state.copiedPrevious]);

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);
    copyModalShown.current = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(sessionKey);
        if (cancelled) return;
        if (raw) {
          const session = JSON.parse(raw);
          if (session?.planId === plan?.id && session?.dayId === day?.id && session?.state) {
            startTime.current = session.startedAt || Date.now();
            setIsDeload(!!session.isDeload);
            dispatch({ type: 'HYDRATE_STATE', payload: session.state });
          } else {
            await AsyncStorage.removeItem(sessionKey);
          }
        }
      } catch (_) {
        // Ignore malformed or missing active session payloads.
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionKey, plan?.id, day?.id, dispatch]);

  useEffect(() => {
    if (!sessionReady) return;
    const payload = {
      version: 1,
      planId: plan?.id || null,
      dayId: day?.id || null,
      planIndex,
      dayIndex,
      startedAt: startTime.current,
      isDeload,
      state: {
        inputs: state.inputs,
        setLog: state.setLog,
        exerciseNotes: state.exerciseNotes,
        supersetGroups: state.supersetGroups,
        restTimer: state.restTimer,
        swappedExercises: state.swappedExercises,
        copiedPrevious: state.copiedPrevious,
      },
    };
    const persist = hasMeaningfulSessionState
      ? AsyncStorage.setItem(sessionKey, JSON.stringify(payload))
      : AsyncStorage.removeItem(sessionKey);
    persist.catch(() => {});
  }, [
    sessionReady,
    sessionKey,
    plan?.id,
    day?.id,
    planIndex,
    dayIndex,
    isDeload,
    hasMeaningfulSessionState,
    state.inputs,
    state.setLog,
    state.exerciseNotes,
    state.supersetGroups,
    state.restTimer,
    state.swappedExercises,
    state.copiedPrevious,
  ]);

  // Determine when the first actual set was logged to start the timer
  const firstLogTime = useMemo(() => {
    const allSets = Object.values(state.setLog).flat();
    if (allSets.length === 0) return null;
    return startTime.current;
  }, [state.setLog]);

  // Set floating banner on mount, don't clear on unmount (cleared on finish/quit)
  useEffect(() => {
    setBanner({ planIndex, dayIndex, dayName: day.name, startTime: firstLogTime, isDeload });
  }, [isDeload, firstLogTime]);

  useEffect(() => {
    if (copyModalShown.current) return;
    if (!sessionReady || hasMeaningfulSessionState) return;
    if (Object.keys(state.ghostData).length > 0) {
      copyModalShown.current = true;
      setShowCopyModal(true);
    }
  }, [state.ghostData, sessionReady, hasMeaningfulSessionState]);

  useEffect(() => {
    workingExercises.forEach((ex, i) => {
      const note = exerciseNotes[ex.name] || '';
      if (note) dispatch({ type: 'SET_EXERCISE_NOTE', exIndex: i, note });
    });
  }, []);

  const progressionSuggestions = useMemo(() => {
    if (!transitionReady) return {};
    const suggestions = {};
    workingExercises.forEach((exercise, index) => {
      const actual = state.swappedExercises[index] || exercise;
      suggestions[index] = buildProgressionSuggestion({
        exercise: {
          ...actual,
          exerciseId: actual.exerciseId || actual.id || exercise.exerciseId || exercise.name,
          prescribedSets: Number(exercise.sets || 0),
          prescribedReps: parseRepTarget(exercise.reps, 8),
          sets: Number(exercise.sets || 0),
          reps: parseRepTarget(exercise.reps, 8),
        },
        history,
      });
    });
    return suggestions;
  }, [history, state.swappedExercises, transitionReady, workingExercises]);

  const triggerCountdownHaptic = useCallback((remaining) => {
    if (!Number.isFinite(remaining) || remaining < 1 || remaining > 5) {
      countdownHapticRef.current = null;
      return;
    }
    if (countdownHapticRef.current === remaining) return;
    countdownHapticRef.current = remaining;

    const eventName = {
      5: 'countdownLightest',
      4: 'countdownLight',
      3: 'countdownMedium',
      2: 'countdownHigh',
      1: 'countdownBuzz',
    }[remaining];

    if (!eventName) return;
    triggerHaptic(eventName, { enabled: haptic, force: true }).catch(() => {});
  }, [haptic]);

  const tickRest = useCallback(() => {
    const timer = restTimerRef.current;
    if (!timer.active || timer.paused || !timer.endTime) {
      countdownHapticRef.current = null;
      return;
    }
    const remaining = Math.ceil((timer.endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(restInterval.current);
      countdownHapticRef.current = null;
      dispatch({ type: 'SKIP_REST' });
      setDisplaySecs(0);
      triggerHaptic('timerDone', { enabled: haptic, force: true }).catch(() => {});
    } else {
      triggerCountdownHaptic(remaining);
      setDisplaySecs(remaining);
    }
  }, [dispatch, haptic, triggerCountdownHaptic]);

  const syncRestTimer = useCallback(() => {
    clearInterval(restInterval.current);
    const timer = restTimerRef.current;
    if (!timer.active) {
      countdownHapticRef.current = null;
      setDisplaySecs(0);
      return;
    }
    if (timer.paused) {
      countdownHapticRef.current = null;
      const pausedRemaining = Math.max(0, Math.ceil(((timer.endTime || Date.now()) - (timer.pausedAt || Date.now())) / 1000));
      setDisplaySecs(pausedRemaining);
      return;
    }
    if (!timer.endTime) {
      countdownHapticRef.current = null;
      setDisplaySecs(0);
      return;
    }
    const remaining = Math.ceil((timer.endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      countdownHapticRef.current = null;
      dispatch({ type: 'SKIP_REST' });
      setDisplaySecs(0);
      triggerHaptic('timerDone', { enabled: haptic, force: true }).catch(() => {});
      return;
    }
    triggerCountdownHaptic(remaining);
    setDisplaySecs(remaining);
    restInterval.current = setInterval(tickRest, 500);
  }, [dispatch, haptic, tickRest, triggerCountdownHaptic]);

  useEffect(() => {
    syncRestTimer();
  }, [syncRestTimer, state.restTimer.active, state.restTimer.paused, state.restTimer.endTime, state.restTimer.pausedAt]);

  const startRestWithDuration = useCallback((secs, options = {}) => {
    const endTime = Date.now() + secs * 1000;
    countdownHapticRef.current = null;
    setDisplaySecs(secs);
    dispatch({ type: 'START_REST', endTime, total: secs, triggerExIndex: null });
    if (options.hapticEvent) {
      triggerHaptic(options.hapticEvent, { enabled: haptic }).catch(() => {});
    }
  }, [dispatch, haptic]);

  const startRest = useCallback((exIndex) => {
    const ex = workingExercises[exIndex];
    const heavy = isHeavy(ex.name);
    const base = heavy ? (settings.defaultRestHeavy || 180) : (settings.defaultRestNormal || 120);
    const secs = restOverride[exIndex] !== undefined ? restOverride[exIndex] : base;
    startRestWithDuration(secs);
  }, [workingExercises, settings, restOverride, isHeavy, startRestWithDuration]);

  const handlePause = useCallback(() => {
    clearInterval(restInterval.current);
    countdownHapticRef.current = null;
    dispatch({ type: 'PAUSE_REST', pausedAt: Date.now() });
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
  }, [dispatch, haptic]);

  const handleResume = useCallback(() => {
    const newEndTime = Date.now() + displaySecs * 1000;
    dispatch({ type: 'RESUME_REST', newEndTime });
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
  }, [displaySecs, dispatch, haptic]);

  const handleSkip = useCallback(() => {
    clearInterval(restInterval.current);
    countdownHapticRef.current = null;
    dispatch({ type: 'SKIP_REST' });
    setDisplaySecs(0);
    triggerHaptic('lightConfirm', { enabled: haptic }).catch(() => {});
  }, [dispatch, haptic]);

  const handleAdd30 = useCallback(() => {
    countdownHapticRef.current = null;
    dispatch({ type: 'ADD_30S' });
    if (!state.restTimer.paused) setDisplaySecs(s => s + 30);
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
  }, [dispatch, state.restTimer.paused, haptic]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const wasBackgrounded = appStateRef.current.match(/inactive|background/);
      if (nextState.match(/inactive|background/)) {
        clearInterval(restInterval.current);
      }
      appStateRef.current = nextState;
      if (wasBackgrounded && nextState === 'active') syncRestTimer();
    });
    return () => sub.remove();
  }, [syncRestTimer]);

  useFocusEffect(
    useCallback(() => {
      syncRestTimer();
      return () => {
        clearInterval(restInterval.current);
      };
    }, [syncRestTimer])
  );

  useEffect(() => () => clearInterval(restInterval.current), []);

  // ── F9: Superset-aware logSet ────────────────────────────────────────────
  const logSet = useCallback((exIndex) => {
    const inp = state.inputs[exIndex] || {};
    const weight = parseFloat(inp.weight) || 0;
    const reps = parseInt(inp.reps) || 0;
    if (!reps) {
      triggerHaptic('invalidAction', { enabled: haptic }).catch(() => {});
      return;
    }

    const ex = workingExercises[exIndex];
    const key = day.id + '-' + ex.name;
    const nextSetCount = (state.setLog[exIndex] || []).length + 1;
    const plannedSetCount = parseInt(workingExercises[exIndex]?.sets, 10) || 0;
    const didCompleteExercise = plannedSetCount > 0 && nextSetCount >= plannedSetCount;
    let primarySetEvent = didCompleteExercise ? 'setCompleted' : 'setLogged';

    if (weight > 0 && (!pb[key] || weight > pb[key])) {
      updatePb(key, weight);
      dispatch({ type: 'SET_PB_NOTIF', message: 'NEW PB: ' + ex.name + ' — ' + weight + 'kg' });
      setTimeout(() => dispatch({ type: 'SET_PB_NOTIF', message: null }), 3000);
      primarySetEvent = 'prUnlocked';
    }
    triggerHaptic(primarySetEvent, { enabled: haptic }).catch(() => {});

    dispatch({ type: 'LOG_SET', exIndex, set: { weight, reps } });

    // Superset rest logic
    const group = state.supersetGroups[exIndex];
    if (group) {
      const groupIndices = workingExercises.map((_, i) => i).filter(i => state.supersetGroups[i] === group);
      const newCount = (state.setLog[exIndex] || []).length + 1;
      const roundComplete = groupIndices
        .filter(i => i !== exIndex)
        .every(i => (state.setLog[i] || []).length >= newCount);
      if (roundComplete) {
        const maxRest = Math.max(...groupIndices.map(i => {
          const gEx = workingExercises[i];
          const heavy = isHeavy(gEx.name);
          const base = heavy ? (settings.defaultRestHeavy || 180) : (settings.defaultRestNormal || 120);
          return restOverride[i] !== undefined ? restOverride[i] : base;
        }));
        startRestWithDuration(maxRest);
      }
      // no timer within superset round
    } else {
      startRest(exIndex);
    }
  }, [state, workingExercises, day, pb, updatePb, dispatch, haptic, isHeavy, settings, restOverride, startRest, startRestWithDuration]);

  // ── F10: Warmup generator ────────────────────────────────────────────────
  const generateWarmups = useCallback((exIndex) => {
    const inp = state.inputs[exIndex] || {};
    const target = parseFloat(inp.weight);
    if (!target || target <= 0) {
      setAlertConfig({ title: 'Enter target weight first', message: 'Set the KG field before generating warm-up sets.', buttons: [{ text: 'OK', style: 'default' }] });
      return;
    }
    const barWeight = activeGymProfile?.barWeight || settings.barWeight || 20;
    const scheme = [
      { pct: 0, reps: 10 },
      { pct: 0.5, reps: 5 },
      { pct: 0.7, reps: 3 },
      { pct: 0.85, reps: 1 },
    ];
    const warmupSets = scheme.map(({ pct, reps }) => {
      const raw = pct === 0 ? barWeight : Math.max(barWeight, target * pct);
      const rounded = Math.round(raw / 2.5) * 2.5;
      return { id: genId(), weight: rounded, reps, type: 'warmup', rpe: null, rir: null, note: null, orm: 0 };
    });
    dispatch({ type: 'INSERT_WARMUPS', exIndex, warmupSets });
  }, [state.inputs, settings.barWeight, dispatch]);

  // ── F16: Exercise swap ───────────────────────────────────────────────────
  const handleSwap = useCallback(async (exIndex, newExercise) => {
    dispatch({ type: 'SWAP_EXERCISE', exIndex, exercise: newExercise });
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
    try {
      const raw = await AsyncStorage.getItem('@ironlog/lastPerformance');
      const lastPerf = raw ? JSON.parse(raw) : {};
      const id = newExercise.exerciseId || newExercise.id || newExercise.name;
      const ghost = lastPerf[id] || null;
      dispatch({ type: 'UPDATE_GHOST', exIndex, ghost });
    } catch (_) {}
  }, [dispatch, haptic]);

  const addExerciseToSession = useCallback((exercise) => {
    const normalized = normalizeSessionExercise(exercise);
    setExtraExercises((prev) => [...prev, normalized]);
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
  }, [haptic]);

  // ── ⋯ Exercise menu ──────────────────────────────────────────────────────
  const showExerciseMenu = useCallback((exIndex) => {
    const ex = state.swappedExercises[exIndex] || workingExercises[exIndex];
    const group = state.supersetGroups[exIndex];
    const canGenerateBarbellWarmup = supportsPlateBreakdown(ex);
    const youtubeMeta = resolveExerciseYoutubeMeta(ex);

    const options = [
      {
        text: group ? `Superset ${group} — Change Group` : 'Assign to Superset',
        onPress: () => setSupersetModalEx(exIndex),
      },
      { text: 'Swap Exercise', onPress: () => setSwapModalEx(exIndex) },
      {
        text: 'Watch Demo on YouTube',
        onPress: async () => {
          const url = youtubeMeta?.youtubeLink;
          if (!url) {
            setAlertConfig({ title: 'No tutorial link', message: 'Unable to build a tutorial link for this exercise.', buttons: [{ text: 'OK', style: 'default' }] });
            return;
          }
          try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
              setAlertConfig({ title: 'Cannot open link', message: 'No app available to open this YouTube link on this device.', buttons: [{ text: 'OK', style: 'default' }] });
              return;
            }
            triggerHaptic('lightConfirm', { enabled: haptic }).catch(() => {});
            await Linking.openURL(url);
          } catch (error) {
            setAlertConfig({ title: 'Could not open YouTube', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
          }
        },
      },
      ...(canGenerateBarbellWarmup ? [{ text: 'Generate Warm-Up', onPress: () => generateWarmups(exIndex) }] : []),
      { text: 'Cancel', style: 'cancel' },
    ];
    setAlertConfig({ title: ex.name, message: '', buttons: options });
  }, [workingExercises, state.supersetGroups, state.swappedExercises, generateWarmups, haptic]);

  const finishWorkout = useCallback(() => {
    const totalSets = Object.values(state.setLog).reduce((a, s) => a + s.length, 0);
    if (totalSets === 0) { setAlertConfig({ title: 'No sets logged', message: 'Log at least one set before finishing.', buttons: [{ text: 'OK', style: 'default' }] }); return; }

    workingExercises.forEach((ex, i) => {
      const note = state.exerciseNotes[i];
      if (note && note !== exerciseNotes[ex.name]) saveExerciseNotes(ex.name, note);
    });

    const exerciseData = workingExercises.map((ex, i) => {
      const actual = state.swappedExercises[i] || ex;
      // Ensure we hit the library if it's a known exercise to get reliable muscle data
      const mappedId = EXERCISE_ID_MAP[actual.name];
      const libMatch = mappedId 
        ? EXERCISES.find(e => e.id === mappedId) 
        : EXERCISES.find(e => e.name === actual.name);
      
      const resolvedMuscles = (() => {
        const merged = [
          ...getExerciseMuscles(actual),
          ...getExerciseMuscles(libMatch),
          ...getExerciseMuscles(ex),
        ];
        const seen = new Set();
        const unique = [];
        merged.forEach((muscle) => {
          const key = String(muscle || '').toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          unique.push(muscle);
        });
        return unique;
      })();

      return {
        name: actual.name,
        exerciseId: actual.exerciseId || actual.id || ex.exerciseId,
        primaryMuscles: resolvedMuscles,
        primaryMuscle: resolvedMuscles[0] || null,
        equipment: actual.equipment || ex.equipment || null,
        prescribedSets: Number(ex.sets || 0),
        prescribedReps: parseRepTarget(ex.reps, 8),
        sets: (state.setLog[i] || []).map(s => ({
          id: s.id, weight: s.weight, reps: s.reps,
          type: s.type || 'normal', rpe: s.rpe || null, rir: s.rir || null,
          note: s.note || null, orm: s.orm || 0,
        })),
      };
    }).filter(e => e.sets.length > 0);

    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const totalVolume = Object.values(state.setLog).flat().reduce((a, s) => a + ((s.weight || 0) * (s.reps || 0)), 0);
    setAlertConfig({
      title: 'FINISH WORKOUT',
      message: totalSets + ' sets logged · ' + Math.round(duration / 60) + 'min',
      buttons: [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'FINISH', style: 'default', onPress: async () => {
            triggerHaptic('workoutCompleted', { enabled: haptic }).catch(() => {});
            const sessionId = Date.now().toString();
            const sessionDate = new Date().toISOString();
            const baseSession = {
              id: sessionId,
              date: sessionDate,
              planId: plan.id, dayId: day.id, dayName: day.name,
              duration, sets: totalSets, exercises: exerciseData,
              isDeload,
              totalVolume,
            };
            const analysisHistory = [baseSession, ...history];
            const enrichedExercises = exerciseData.map((exercise) => {
              const suggestion = buildProgressionSuggestion({
                exercise: {
                  ...exercise,
                  sets: exercise.prescribedSets || exercise.sets.length,
                  reps: exercise.prescribedReps || 8,
                },
                history: analysisHistory,
              });
              return {
                ...exercise,
                progressionSuggestion: suggestion,
                plateauSignal: suggestion?.plateauSignal || null,
                deloadSignal: suggestion?.deloadSignal || null,
              };
            });
            const recentUsage = await getRecentComparisonUsage().catch(() => []);
            const comparison = buildVolumeInterpretation(totalVolume, { recentUsage });
            const summaryText = buildWorkoutCompletionSummary({
              session: { ...baseSession, exercises: enrichedExercises },
              history,
              exerciseIndex: libraryIndex,
              recentUsage,
            });
            const prEvents = detectPREvents(
              { ...baseSession, exercises: enrichedExercises },
              history
            );
            const performanceScore = computeWorkoutPerformanceScore(
              { ...baseSession, exercises: enrichedExercises },
              history,
              prEvents
            );
            const completedSession = {
              ...baseSession,
              exercises: enrichedExercises,
              summaryText,
              prEvents,
              performanceScore,
            };
            const addResult = await addHistory(completedSession);
            if (comparison?.objectName) {
              await recordComparisonUsage({
                objectName: comparison.objectName,
                category: comparison.category,
                totalKg: totalVolume,
                contextLabel: 'workout_completion',
              }).catch(() => {});
            }
            await AsyncStorage.removeItem(sessionKey).catch(() => {});
            setBanner(null);
            // Rate prompt check
            if (!settings.neverAskToRate) {
              const newCount = (settings.completedWorkoutCount || 0) + 1;
              const newSettings = { ...settings, completedWorkoutCount: newCount };
              const lastPrompt = settings.lastRatePromptCount || 0;
              if (RATE_THRESHOLDS.includes(newCount) && newCount !== lastPrompt) {
                newSettings.lastRatePromptCount = newCount;
                setRatePrompt(true);
              }
              updateSettings(newSettings);
            }
            // Store completed workout for share card
            setCompletedWorkout({
              dayName: day.name,
              duration,
              totalVolume,
              exercises: enrichedExercises,
              prs: Object.fromEntries(Object.entries(pb).map(([k, v]) => [k.split('-').slice(1).join('-'), v])),
              summaryText,
              prEvents,
              performanceScore,
            });
            // Compute + save next-session targets
            try {
              const raw = await AsyncStorage.getItem('@ironlog/nextTargets');
              const existing = raw ? JSON.parse(raw) : {};
              enrichedExercises.forEach(ex => {
                const suggestion = ex.progressionSuggestion;
                if (!suggestion) return;
                existing[ex.exerciseId || ex.name] = {
                  weight: suggestion.targetWeight,
                  reps: suggestion.targetReps,
                  action: suggestion.action,
                  rationale: suggestion.rationale,
                  updatedAt: new Date().toISOString(),
                };
              });
              await AsyncStorage.setItem('@ironlog/nextTargets', JSON.stringify(existing));
              const targets = enrichedExercises.map(ex => {
                const key = ex.exerciseId || ex.name;
                return existing[key]
                  ? {
                      name: ex.name,
                      ...existing[key],
                      plateau: ex.plateauSignal?.recommendation || null,
                      deload: ex.deloadSignal?.recommendation || null,
                    }
                  : null;
              }).filter(Boolean);
              if (targets.length > 0) setNextTargets(targets);
            } catch (_) {}
            const completionLine = summaryText || `You lifted ${Math.round(totalVolume).toLocaleString()} kg total.`;
            const prLine = prEvents.length ? ` ${prEvents.length} PR event${prEvents.length > 1 ? 's' : ''}.` : '';
            const milestoneLine = addResult?.unlockedMilestones?.length
              ? ` ${addResult.unlockedMilestones.length} milestone unlocked.`
              : '';
            if (addResult?.unlockedMilestones?.length) {
              triggerHaptic('milestoneSuccess', { enabled: haptic }).catch(() => {});
            }
            setCompletionSummary(`${completionLine}${prLine}${milestoneLine} Score ${performanceScore}/100.`);
          },
        },
      ],
    });
  }, [state, workingExercises, day, plan, exerciseNotes, saveExerciseNotes, addHistory, navigation, haptic, isDeload, setBanner, sessionKey, settings, updateSettings, pb, history, libraryIndex]);

  // Resolve displayed exercise (may be swapped)
  const resolveEx = (exIndex) => state.swappedExercises[exIndex] || workingExercises[exIndex];

  // Build superset label map: group → first exIndex in current display order
  const supersetFirstIndex = {};
  orderedIndices.forEach(exIndex => {
    const g = state.supersetGroups[exIndex];
    if (g && supersetFirstIndex[g] === undefined) supersetFirstIndex[g] = exIndex;
  });

  const onExerciseDragEnd = ({ data }) => {
    setOrderedIndices(data);
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
  };

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.faint }]}>
        <TouchableOpacity onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); setQuitAlert(true); }}>
          <Ionicons name="close" size={24} color="#555" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.dayLabel, { color: day.color }]}>{day.label}</Text>
            <TouchableOpacity
              onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); setIsDeload(v => !v); }}
              style={[s.deloadPill, isDeload && { backgroundColor: '#7B7B7B44', borderColor: '#7B7B7B' }]}>
              <Text style={[s.deloadText, isDeload && { color: '#AAA' }]}>DELOAD</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.dayName}>{day.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); navigation.navigate('Tabs'); }}>
            <Ionicons name="chevron-down" size={22} color="#555" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.finishBtn, { backgroundColor: colors.accent }]} onPress={() => { triggerHaptic('lightConfirm', { enabled: haptic }).catch(() => {}); finishWorkout(); }}>
            <Text style={s.finishText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PB banner */}
      {/* Rest timer */}
      {state.restTimer.active ? (
        <View style={[s.restOverlay, { backgroundColor: colors.card, borderBottomColor: colors.faint }]}>
          <Text style={[s.restLabel, { color: colors.muted }]}>REST</Text>
          <RestTimerCircle
            seconds={state.restTimer.paused
              ? Math.max(0, Math.ceil((state.restTimer.endTime - state.restTimer.pausedAt) / 1000))
              : displaySecs}
            total={state.restTimer.total}
            paused={state.restTimer.paused}
            accent={colors.accent}
            onSkip={handleSkip}
            onAdd30={handleAdd30}
            onPause={handlePause}
            onResume={handleResume}
          />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <DraggableFlatList
          data={orderedIndices}
          keyExtractor={item => String(item)}
          onDragEnd={onExerciseDragEnd}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={16}
          windowSize={6}
          removeClippedSubviews
          ListHeaderComponent={
            <View>
                  {day.exercises.filter(e => e.isWarmup).length > 0 && (
                <View style={s.warmupSection}>
                  <Text style={s.sectionLabel}>WARMUP / MOBILITY</Text>
                  {day.exercises.filter(e => e.isWarmup).map((ex, i) => {
                    const barW = activeGymProfile?.barWeight || settings.barWeight || 20;
                    const targetKg = ex.targetWeight || null;
                    const plateText = (targetKg && supportsPlateBreakdown(ex))
                      ? getPlateText(targetKg, barW, activeGymProfile?.plates)
                      : null;
                    return (
                      <View key={i} style={s.warmupRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.warmupName}>{ex.name}</Text>
                          {plateText && <Text style={s.warmupPlates}>{plateText}</Text>}
                        </View>
                        <Text style={s.warmupMeta}>{ex.sets}× {ex.reps}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <Text style={s.sectionLabel}>WORKING SETS</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={[s.addExerciseBtn, { borderColor: colors.faint, backgroundColor: colors.card }]}
              onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); setShowAddExerciseModal(true); }}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
              <Text style={[s.addExerciseBtnText, { color: colors.accent }]}>ADD EXERCISE</Text>
            </TouchableOpacity>
          }
          renderItem={({ item: exIndex, drag, isActive }) => {
            const ex = resolveEx(exIndex);
            const logged = state.setLog[exIndex] || [];
            const inp = state.inputs[exIndex] || { weight: '', reps: '' };
            const heavy = isHeavy(ex.name);
            const base = heavy ? (settings.defaultRestHeavy || 180) : (settings.defaultRestNormal || 120);
            const restSec = restOverride[exIndex] !== undefined ? restOverride[exIndex] : base;
            const ghost = state.ghostData[exIndex];
            const group = state.supersetGroups[exIndex];
            const groupColor = group ? GROUP_COLORS[group] : null;
            const isFirstInGroup = group && supersetFirstIndex[group] === exIndex;
            const showPlateUi = supportsPlateBreakdown(ex);
            const suggestion = progressionSuggestions[exIndex];
            const recentH = history.filter(h => h.dayId === day.id).slice(0, 3);
            const allSameOrLess = recentH.length === 3 && recentH.every(h => {
              const e = h.exercises?.find(e => e.name === ex.name);
              return e && e.sets[0] && parseFloat(inp.weight || 0) <= e.sets[0].weight;
            });
            const borderColor = groupColor || day.color;
            return (
              <ScaleDecorator activeScale={0.97}>
                <View style={{ marginBottom: 16 }}>
                  {isFirstInGroup ? (
                    <View style={[s.supersetChip, { borderColor: groupColor + '55', backgroundColor: groupColor + '18' }]}>
                      <Text style={[s.supersetChipText, { color: groupColor }]}>SUPERSET {group}</Text>
                    </View>
                  ) : null}
                  <View style={[s.exCard, { borderLeftColor: borderColor, backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: isActive ? 0.85 : 1 }]}>
                    <View style={s.exHeader}>
                      <RNGHTouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="reorder-three-outline" size={22} color="#444" />
                      </RNGHTouchableOpacity>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={s.exName}>{ex.name}</Text>
                          {group ? <View style={[s.groupBadge, { borderColor: groupColor + '66', backgroundColor: groupColor + '22' }]}><Text style={[s.groupBadgeText, { color: groupColor }]}>{group}</Text></View> : null}
                          {heavy ? <View style={s.heavyBadge}><Text style={s.heavyText}>HEAVY</Text></View> : null}
                          {allSameOrLess ? <View style={s.overloadBadge}><Text style={s.overloadText}>↑ OVERLOAD</Text></View> : null}
                          {suggestion ? (
                            <View style={[s.targetChip, {
                              borderColor: suggestion.action === 'increase' ? colors.accent : suggestion.action === 'reduce' ? '#FF6B6B55' : colors.faint,
                              backgroundColor: suggestion.action === 'increase' ? colors.accentSoft : suggestion.action === 'reduce' ? '#FF6B6B11' : 'transparent',
                            }]}>
                              <Text style={[s.targetChipText, { color: suggestion.action === 'reduce' ? '#FF8E8E' : suggestion.action === 'increase' ? colors.accent : colors.muted }]}>
                                {suggestion.action.toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={s.exTarget}>{ex.primary || (ex.primaryMuscles || [])[0] || '—'} · {workingExercises[exIndex].sets}x{workingExercises[exIndex].reps}</Text>
                        {suggestion ? (
                          <Text style={[s.exTargetHint, { color: suggestion.action === 'reduce' ? '#FF8E8E' : colors.subtext }]}>
                            Next target {suggestion.targetWeight}kg x {suggestion.targetReps}
                            {suggestion.plateauSignal ? ` · Plateau: ${suggestion.plateauSignal.recommendation}` : ''}
                            {suggestion.deloadSignal ? ` · ${suggestion.deloadSignal.recommendation}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); showExerciseMenu(exIndex); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                    <TextInput style={s.noteInput} value={state.exerciseNotes[exIndex] || ''} onChangeText={t => dispatch({ type: 'SET_EXERCISE_NOTE', exIndex, note: t })} placeholder={workingExercises[exIndex].note || 'Add note...'} placeholderTextColor="#2a2a2a" multiline />
                    {ghost && ghost.sets && ghost.sets.length > 0 ? (
                      <TouchableOpacity style={s.ghostContainer} onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); const fs = ghost.sets[0]; if (fs) dispatch({ type: 'SET_INPUT', exIndex, weight: String(fs.weight), reps: String(fs.reps) }); }}>
                        <Text style={s.ghostLabel}>LAST · {ghost.date} · tap to fill</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {ghost.sets.map((gs, gi) => <Text key={gi} style={s.ghostSet}>{gs.weight > 0 ? `${gs.weight}kg` : 'BW'}×{gs.reps}</Text>)}
                        </View>
                      </TouchableOpacity>
                    ) : null}
                    {logged.length > 0 && (
                      <View style={s.loggedSets}>
                        {logged.map((ls, si) => (
                          <View key={ls.id}>
                            <SetRow set={ls} setIndex={si} exIndex={exIndex} dispatch={dispatch} effortTracking={settings.effortTracking || 'off'} hapticFeedback={haptic} />
                            {showPlateUi && ls.type === 'warmup' && ls.weight > 0 && (
                              <Text style={s.plateHint}>
                                {getPlateText(ls.weight, activeGymProfile?.barWeight || settings.barWeight || 20, activeGymProfile?.plates)}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={s.inputRow}>
                      <View style={s.inputGroup}>
                        <Text style={s.inputLabel}>KG</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput style={s.input} value={inp.weight} onChangeText={t => dispatch({ type: 'SET_INPUT', exIndex, weight: t })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#222" />
                          {showPlateUi ? (
                            <TouchableOpacity style={s.plateBtn} onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); setPlatesTarget(parseFloat(inp.weight) || 0); setShowPlates(true); }}>
                              <Ionicons name="barbell-outline" size={14} color="#555" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                      <View style={s.inputGroup}>
                        <Text style={s.inputLabel}>REPS</Text>
                        <TextInput style={s.input} value={inp.reps} onChangeText={t => dispatch({ type: 'SET_INPUT', exIndex, reps: t })} keyboardType="number-pad" placeholder="0" placeholderTextColor="#222" />
                      </View>
                      <TouchableOpacity style={s.logBtn} onPress={() => logSet(exIndex)}>
                        <Text style={s.logBtnText}>LOG</Text>
                      </TouchableOpacity>
                    </View>
                    {logged.length > 0 ? (
                      <TouchableOpacity style={s.quickAddBtn} onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); dispatch({ type: 'QUICK_ADD_SET', exIndex }); }}>
                        <Text style={s.quickAddText}>+ QUICK ADD</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={s.restRow} onPress={() => { triggerHaptic('selection', { enabled: haptic }).catch(() => {}); setEditingRestEx(exIndex); setShowRestOverride(true); }}>
                      <Ionicons name="timer-outline" size={12} color="#444" />
                      <Text style={s.restRowText}>{restSec}s rest · tap to change</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScaleDecorator>
            );
          }}
        />
      </View>

      {/* Modals */}
      <PlateModal visible={showPlates} targetKg={platesTarget} barWeight={activeGymProfile?.barWeight || settings.barWeight || 20} onClose={() => setShowPlates(false)} />

      <RestOverrideModal
        visible={showRestOverride}
        current={editingRestEx !== null
          ? (restOverride[editingRestEx] !== undefined ? restOverride[editingRestEx]
            : (isHeavy(resolveEx(editingRestEx)?.name)
              ? (settings.defaultRestHeavy || 180)
              : (settings.defaultRestNormal || 120)))
          : 120}
        onSave={(secs) => { if (editingRestEx !== null) setRestOverride(prev => ({ ...prev, [editingRestEx]: secs })); }}
        onClose={() => setShowRestOverride(false)} />

      <CopyPreviousModal
        visible={showCopyModal}
        onCopy={() => { dispatch({ type: 'COPY_PREVIOUS' }); setShowCopyModal(false); }}
        onFresh={() => setShowCopyModal(false)} />

      <SupersetModal
        visible={supersetModalEx !== null}
        currentGroup={supersetModalEx !== null ? state.supersetGroups[supersetModalEx] : null}
        onAssign={(group) => {
          if (supersetModalEx !== null) {
            dispatch({ type: 'ASSIGN_SUPERSET', exIndex: supersetModalEx, group });
            triggerHaptic('selection', { enabled: haptic }).catch(() => {});
          }
        }}
        onClose={() => setSupersetModalEx(null)} />

      <SwapModal
        visible={swapModalEx !== null}
        exercise={swapModalEx !== null ? resolveEx(swapModalEx) : null}
        onSwap={(newEx) => { if (swapModalEx !== null) handleSwap(swapModalEx, newEx); }}
        onClose={() => setSwapModalEx(null)}
        colors={colors} />

      <SwapModal
        visible={showAddExerciseModal}
        exercise={null}
        onSwap={(newEx) => addExerciseToSession(newEx)}
        onClose={() => setShowAddExerciseModal(false)}
        colors={colors}
      />

      {/* Rate prompt */}
      <CustomAlert
        visible={ratePrompt}
        title="Enjoying IRONLOG? 💪"
        message={`You've completed ${settings.completedWorkoutCount || 0} workouts! If you're loving the app, a rating helps a lot.`}
        onDismiss={() => setRatePrompt(false)}
        buttons={[
          { text: 'Never', style: 'cancel', onPress: () => { updateSettings({ ...settings, neverAskToRate: true }); setRatePrompt(false); } },
          { text: 'Later', style: 'default', onPress: () => setRatePrompt(false) },
          { text: 'Rate ⭐', style: 'default', onPress: () => { setRatePrompt(false); require('react-native').Linking.openURL('https://play.google.com/store/apps/details?id=com.ironlog.app'); } },
        ]} />

      {/* Quit confirmation */}
      <CustomAlert
        visible={quitAlert}
        title="Quit Workout?"
        message="All logged sets will be lost."
        onDismiss={() => setQuitAlert(false)}
        buttons={[
          { text: 'Minimize', style: 'default', onPress: () => navigation.goBack() },
          { text: 'Stay', style: 'cancel', onPress: () => setQuitAlert(false) },
          { text: 'Quit', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(sessionKey).catch(() => {}); setBanner(null); navigation.goBack(); } },
        ]} />

      {/* Workout completion summary */}
      <CustomAlert
        visible={!!completionSummary}
        title="WORKOUT COMPLETE"
        message={completionSummary || ''}
        onDismiss={() => { setCompletionSummary(null); if (!nextTargets) setShowShareModal(true); }}
        buttons={[{ text: 'VIEW', style: 'default', onPress: () => { setCompletionSummary(null); if (!nextTargets) setShowShareModal(true); } }]} />

      {/* F28 Share card modal */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => { setShowShareModal(false); navigation.goBack(); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <WorkoutShareCard
            ref={shareCardRef}
            workout={completedWorkout}
            history={history}
            summaryText={completedWorkout?.summaryText}
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, width: '100%', paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={{ flex: 1, padding: 16, borderWidth: 1, borderColor: '#333', alignItems: 'center' }}
              onPress={() => { setShowShareModal(false); navigation.goBack(); }}>
              <Text style={{ color: '#888', fontWeight: '700', letterSpacing: 1 }}>SKIP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 2, padding: 16, backgroundColor: colors.accent, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={async () => {
                try {
                  triggerHaptic('lightConfirm', { enabled: haptic }).catch(() => {});
                  const uri = await captureRef(shareCardRef, { format: 'png', quality: 1.0 });
                  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
                } catch (e) { setAlertConfig({ title: 'Share failed', message: String(e), buttons: [{ text: 'OK', style: 'default' }] }); }
              }}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 2 }}>SHARE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* F24 Next-session targets */}
      <Modal visible={!!nextTargets && !completionSummary} transparent animationType="slide" onRequestClose={() => { setNextTargets(null); setShowShareModal(true); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={[s.targetSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.targetTitle, { color: colors.text }]}>NEXT SESSION TARGETS</Text>
            <Text style={[s.targetSub, { color: colors.muted }]}>Suggested progression for your next workout</Text>
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {(nextTargets || []).map((t, i) => (
                <View key={i} style={[s.targetRow, { borderColor: colors.faint }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[s.targetName, { color: colors.text }]} numberOfLines={1}>{t.name}</Text>
                    <Text style={[s.targetReason, { color: colors.muted }]} numberOfLines={2}>
                      {t.action ? `${String(t.action).toUpperCase()} · ` : ''}{t.rationale || (t.plateau ? `Plateau: ${t.plateau}` : t.deload ? t.deload : 'Keep the trend moving')}
                    </Text>
                  </View>
                  <Text style={[s.targetVal, { color: t.action === 'reduce' ? '#FF8E8E' : colors.accent }]}>{t.weight}kg × {t.reps}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.targetBtn, { flex: 1, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent }]} onPress={() => { setNextTargets(null); setShowShareModal(true); }}>
                <Ionicons name="share-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>SHARE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.targetBtn, { flex: 1, backgroundColor: colors.accent }]} onPress={() => { setNextTargets(null); navigation.goBack(); }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 2 }}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert visible={!!alertConfig} title={alertConfig?.title} message={alertConfig?.message} buttons={alertConfig?.buttons || []} onDismiss={() => setAlertConfig(null)} />
    </View>
  );
}

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────

export default function ActiveWorkoutScreen({ route, navigation }) {
  const { planIndex = 0, dayIndex = 0 } = route.params || {};
  const { plans } = useContext(AppContext);
  const colors = useTheme();

  const safePlans = Array.isArray(plans) ? plans : [];
  const resolvedPlanIndex = Number.isInteger(planIndex) ? planIndex : 0;
  const plan = safePlans[resolvedPlanIndex];
  const safeDays = Array.isArray(plan?.days) ? plan.days : [];
  const resolvedDayIndex = Number.isInteger(dayIndex) ? dayIndex : 0;
  const day = safeDays[resolvedDayIndex];
  const safeExercises = Array.isArray(day?.exercises) ? day.exercises : [];

  if (!day) {
    return (
      <View style={[s.container, { backgroundColor: colors.bg }]}>
        <Text style={{ color: '#f0f0f0', padding: 20 }}>Workout not found.</Text>
      </View>
    );
  }

  return (
    <WorkoutProvider exercises={safeExercises.filter(e => e && !e.isWarmup)}>
      <WorkoutContent plan={plan} day={day} planIndex={resolvedPlanIndex} dayIndex={resolvedDayIndex} navigation={navigation} />
    </WorkoutProvider>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1 },
    dayLabel: { fontSize: 9, letterSpacing: 3 },
    dayName: { fontSize: 20, fontWeight: '900', letterSpacing: -1, color: colors.text },
    finishBtn: { paddingHorizontal: 16, paddingVertical: 8 },
    finishText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 2 },
    deloadPill: { borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    deloadText: { fontSize: 8, fontWeight: '800', letterSpacing: 2, color: colors.subtext },
    targetSheet: { borderTopWidth: 1, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    targetTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
    targetSub: { fontSize: 12, marginBottom: 12 },
    targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
    targetName: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
    targetReason: { fontSize: 10, marginTop: 4, lineHeight: 14 },
    targetVal: { fontSize: 15, fontWeight: '900' },
    targetBtn: { marginTop: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    pbBanner: { backgroundColor: '#FFD70022', borderBottomWidth: 1, borderBottomColor: '#FFD70044', padding: 12, alignItems: 'center' },
    pbBannerText: { fontSize: 13, fontWeight: '700', color: '#FFD700' },
    restOverlay: { borderBottomWidth: 1, alignItems: 'center', paddingVertical: 4 },
    restLabel: { fontSize: 10, letterSpacing: 5, marginTop: 8 },
    warmupSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.faint },
    sectionLabel: { fontSize: 9, letterSpacing: 4, color: colors.muted, marginBottom: 8 },
    warmupRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    warmupName: { fontSize: 14, color: colors.subtext },
    warmupPlates: { fontSize: 10, color: colors.muted, marginTop: 2 },
    warmupMeta: { fontSize: 12, color: colors.muted },
    plateHint: { fontSize: 10, color: colors.muted, paddingLeft: 48, paddingBottom: 4, letterSpacing: 0.3 },
    supersetChip: { marginHorizontal: 12, marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
    supersetChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
    exCard: { margin: 12, marginBottom: 0, borderWidth: 1, borderLeftWidth: 3 },
    exHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 8 },
    exName: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
    exTarget: { fontSize: 11, color: colors.muted, marginTop: 2 },
    exTargetHint: { fontSize: 10, marginTop: 4, lineHeight: 14 },
    groupBadge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
    groupBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    heavyBadge: { backgroundColor: '#FF450022', borderWidth: 1, borderColor: '#FF450044', paddingHorizontal: 6, paddingVertical: 2 },
    heavyText: { fontSize: 8, color: '#FF4500', fontWeight: '700', letterSpacing: 1 },
    overloadBadge: { backgroundColor: '#FFD70022', borderWidth: 1, borderColor: '#FFD70044', paddingHorizontal: 6, paddingVertical: 2 },
    overloadText: { fontSize: 8, color: '#FFD700', fontWeight: '700', letterSpacing: 1 },
    targetChip: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
    targetChipText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
    noteInput: { marginHorizontal: 16, marginBottom: 8, fontSize: 12, color: colors.subtext, borderWidth: 1, borderColor: colors.faint, padding: 8, minHeight: 36 },
    ghostContainer: { marginHorizontal: 16, marginBottom: 8, padding: 8, borderWidth: 1, borderColor: colors.faint, borderStyle: 'dashed' },
    ghostLabel: { fontSize: 8, letterSpacing: 2, color: colors.muted, marginBottom: 4 },
    ghostSet: { fontSize: 12, color: colors.subtext, fontWeight: '600' },
    loggedSets: { marginHorizontal: 16, marginBottom: 4 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 },
    inputGroup: { flex: 1 },
    inputLabel: { fontSize: 8, letterSpacing: 3, color: colors.subtext, marginBottom: 4 },
    input: { flex: 1, borderBottomWidth: 2, borderBottomColor: colors.faint, fontSize: 24, fontWeight: '900', color: colors.text, paddingVertical: 6, textAlign: 'center' },
    plateBtn: { padding: 6 },
    logBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 14 },
    logBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 2 },
    quickAddBtn: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 6, borderWidth: 1, borderColor: colors.faint, borderStyle: 'dashed', alignItems: 'center' },
    quickAddText: { fontSize: 10, color: colors.muted, letterSpacing: 2, fontWeight: '700' },
    addExerciseBtn: { marginHorizontal: 12, marginTop: 12, marginBottom: 8, paddingVertical: 12, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    addExerciseBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
    restRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
    restRowText: { fontSize: 10, color: colors.muted, letterSpacing: 1 },
  });
}
