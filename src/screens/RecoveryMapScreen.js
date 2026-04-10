import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import useDeferredScreenReady from '../hooks/useDeferredScreenReady';
import BodyMapSVG from '../components/BodyMapSVG';
import { computeMuscleAnalytics } from '../domain/intelligence/trainingAnalyticsEngine';
import { buildReadinessSuggestions, computeRecoveryScore } from '../domain/intelligence/recoveryReadinessEngine';
import { getExerciseIndex } from '../services/ExerciseLibraryService';
import { getMuscleAtTouch } from '../utils/muscleMapHitTest';

const REGION_TO_GROUP = {
  chest: 'chest',
  shoulders: 'shoulders',
  rearDelts: 'rearDelts',
  arms: 'arms',
  core: 'core',
  quads: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
  back: 'back',
};

const RECOVERY_COLORS = {
  recovering: '#FF6B6B',
  partial: '#FFD93D',
  ready: '#6BCB77',
  untrained: null,
};

function getRegionColors(groupReadiness, colors) {
  const result = {};
  Object.keys(REGION_TO_GROUP).forEach((region) => {
    const group = REGION_TO_GROUP[region];
    const readiness = typeof groupReadiness?.[group] === 'number'
      ? groupReadiness[group]
      : region === 'rearDelts' && typeof groupReadiness?.shoulders === 'number'
        ? groupReadiness.shoulders
        : 1;
    let status = 'ready';
    if (readiness < 0.6) status = 'recovering';
    else if (readiness < 0.82) status = 'partial';
    result[region] = RECOVERY_COLORS[status] || colors.faint;
  });
  return result;
}

export default function RecoveryMapScreen({ navigation, route }) {
  const { history, plans, manualRecoveryInput, saveManualRecovery } = useContext(AppContext);
  const colors = useTheme();
  const analyticsReady = useDeferredScreenReady({ minDelayMs: 24 });
  const [view, setView] = useState('front');
  const [windowKey, setWindowKey] = useState('7d');
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });
  const [tooltip, setTooltip] = useState(null);
  const hideTimerRef = useRef(null);
  const [libraryIndex, setLibraryIndex] = useState([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    soreness: 0,
    sleepQuality: 0,
    energy: 0,
    notes: '',
  });
  const fallbackReadiness = route?.params?.groupReadiness || {};
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
        if (Array.isArray(index) && index.length > 0) setLibraryIndex(index);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [analyticsReady]);

  const analytics = useMemo(() => {
    if (!analyticsReady) return { readiness: {}, groups: {}, muscles: {} };
    return computeMuscleAnalytics({
      history,
      exerciseIndex: libraryIndex,
      activePlan,
      window: effectiveWindow,
    });
  }, [activePlan, analyticsReady, effectiveWindow, history, libraryIndex]);

  useEffect(() => {
    if (windowKey === 'program' && !programHasExercises) {
      setWindowKey('7d');
    }
  }, [programHasExercises, windowKey]);
  const groupReadiness = Object.keys(analytics.readiness || {}).length ? analytics.readiness : fallbackReadiness;
  const recoveryScore = useMemo(
    () => {
      if (!analyticsReady && !Object.keys(fallbackReadiness).length) {
        return {
          score: '...',
          state: 'recovering',
          explanation: 'Preparing recovery map...',
        };
      }
      return computeRecoveryScore({ readiness: groupReadiness, manualInput: manualRecoveryInput });
    },
    [analyticsReady, fallbackReadiness, groupReadiness, manualRecoveryInput]
  );
  const readinessSuggestions = useMemo(
    () => (analyticsReady || Object.keys(fallbackReadiness).length
      ? buildReadinessSuggestions({ readiness: groupReadiness })
      : []),
    [analyticsReady, fallbackReadiness, groupReadiness]
  );

  const regionColors = useMemo(
    () => getRegionColors(groupReadiness, colors),
    [groupReadiness, colors]
  );

  const revealRegionFromTouch = (evt) => {
    if (!mapSize.width || !mapSize.height) return;
    const { locationX, locationY } = evt.nativeEvent;
    const muscle = getMuscleAtTouch({
      view,
      mapWidth: mapSize.width,
      mapHeight: mapSize.height,
      locationX,
      locationY,
    });

    if (!muscle) {
      setTooltip(null);
      return;
    }

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    const estimatedWidth = Math.min(170, Math.max(84, muscle.label.length * 8 + 28));
    setTooltip({
      label: muscle.label,
      x: Math.min(mapSize.width - estimatedWidth - 8, Math.max(8, locationX - estimatedWidth / 2)),
      y: Math.max(8, locationY - 40),
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: revealRegionFromTouch,
        onPanResponderMove: revealRegionFromTouch,
        onPanResponderRelease: () => {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => setTooltip(null), 700);
        },
      }),
    [mapSize, view]
  );

  useEffect(() => {
    if (!showManualModal) return;
    setManualDraft({
      soreness: Number(manualRecoveryInput?.soreness || 0),
      sleepQuality: Number(manualRecoveryInput?.sleepQuality || 0),
      energy: Number(manualRecoveryInput?.energy || 0),
      notes: manualRecoveryInput?.notes || '',
    });
  }, [manualRecoveryInput, showManualModal]);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.scoreCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <Text style={[s.scoreLabel, { color: colors.muted }]}>RECOVERY SCORE</Text>
        <Text style={[s.scoreValue, { color: recoveryScore.state === 'fatigued' ? '#FF8E8E' : recoveryScore.state === 'recovering' ? '#FFD166' : '#6FE0A4' }]}>
          {recoveryScore.score}
        </Text>
        <Text style={[s.scoreHint, { color: colors.subtext }]}>{recoveryScore.explanation}</Text>
        {readinessSuggestions[0] ? (
          <Text style={[s.scoreHint, { color: colors.muted }]}>{readinessSuggestions[0]}</Text>
        ) : null}
        {!analyticsReady ? (
          <Text style={[s.scoreHint, { color: colors.muted }]}>Loading real muscle readiness after navigation settles.</Text>
        ) : null}
        <TouchableOpacity style={[s.manualBtn, { borderColor: colors.accent }]} onPress={() => setShowManualModal(true)}>
          <Text style={[s.manualBtnText, { color: colors.accent }]}>UPDATE MANUAL CHECK-IN</Text>
        </TouchableOpacity>
      </View>

      <View style={s.switchRow}>
        {[
          ['current_workout', 'Workout'],
          ['7d', '7D'],
          ['30d', '30D'],
          ['program', 'Program'],
        ].map(([key, label]) => {
          const disabled = key === 'program' && !programHasExercises;
          const active = key === windowKey;
          return (
            <TouchableOpacity
              key={key}
              style={[
                s.switchBtn,
                {
                  opacity: disabled ? 0.45 : 1,
                  borderColor: active ? colors.accent : colors.faint,
                  backgroundColor: active ? colors.accentSoft : colors.card,
                },
              ]}
              onPress={() => {
                if (disabled) return;
                setWindowKey(key);
                setTooltip(null);
              }}
              disabled={disabled}
            >
              <Text style={[s.switchText, { color: active ? colors.accent : colors.subtext }]}>
                {label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.switchRow}>
        {['front', 'back'].map((side) => {
          const active = side === view;
          return (
            <TouchableOpacity
              key={side}
              style={[
                s.switchBtn,
                {
                  borderColor: active ? colors.accent : colors.faint,
                  backgroundColor: active ? colors.accentSoft : colors.card,
                },
              ]}
              onPress={() => {
                setView(side);
                setTooltip(null);
              }}
            >
              <Text style={[s.switchText, { color: active ? colors.accent : colors.subtext }]}>
                {side.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[s.helpText, { color: colors.muted }]}>
        Slide over the body map to inspect regions. Color intensity follows real recent stimulus and recovery state.
      </Text>

      <View
        style={[s.mapCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        <BodyMapSVG
          view={view}
          regionColors={regionColors}
          defaultColor={colors.subtext}
          width="100%"
          height="100%"
        />
        {tooltip ? (
          <View
            style={[
              s.tooltip,
              {
                left: tooltip.x,
                top: tooltip.y,
                backgroundColor: colors.surface,
                borderColor: colors.accent,
              },
            ]}
          >
            <Ionicons name="locate" size={11} color={colors.accent} />
            <Text style={[s.tooltipText, { color: colors.text }]}>{tooltip.label}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[s.analyticsBtn, { backgroundColor: colors.accent }]}
        onPress={() => navigation.navigate('VolumeAnalytics')}
      >
        <Ionicons name="analytics-outline" size={15} color="#fff" />
        <Text style={s.analyticsBtnText}>OPEN VOLUME ANALYTICS</Text>
      </TouchableOpacity>

      <Modal visible={showManualModal} transparent animationType="fade" onRequestClose={() => setShowManualModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Manual Recovery Input</Text>
            {[
              ['soreness', 'Soreness (1-5)'],
              ['sleepQuality', 'Sleep (1-5)'],
              ['energy', 'Energy (1-5)'],
            ].map(([key, label]) => (
              <View key={key} style={{ marginBottom: 10 }}>
                <Text style={[s.inputLabel, { color: colors.subtext }]}>{label}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((value) => {
                    const active = Number(manualDraft[key] || 0) === value;
                    return (
                      <TouchableOpacity
                        key={`${key}:${value}`}
                        style={[
                          s.rateBtn,
                          { borderColor: active ? colors.accent : colors.faint, backgroundColor: active ? colors.accentSoft : 'transparent' },
                        ]}
                        onPress={() => setManualDraft((prev) => ({ ...prev, [key]: value }))}
                      >
                        <Text style={{ color: active ? colors.accent : colors.muted, fontSize: 12, fontWeight: '800' }}>{value}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <TextInput
              style={[s.notesInput, { color: colors.text, borderColor: colors.faint, backgroundColor: colors.bg }]}
              value={manualDraft.notes}
              onChangeText={(value) => setManualDraft((prev) => ({ ...prev, notes: value }))}
              placeholder="Optional note..."
              placeholderTextColor={colors.muted}
              multiline
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={() => setShowManualModal(false)}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                onPress={async () => {
                  await saveManualRecovery(manualDraft);
                  setShowManualModal(false);
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  scoreCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  scoreLabel: { fontSize: 9, letterSpacing: 2.3, fontWeight: '800' },
  scoreValue: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  scoreHint: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  manualBtn: { marginTop: 10, borderWidth: 1, paddingVertical: 8, alignItems: 'center' },
  manualBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  switchRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  switchBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  switchText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  helpText: { fontSize: 12, marginBottom: 10 },
  mapCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 420,
  },
  tooltip: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tooltipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  analyticsBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  analyticsBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.84)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12 },
  inputLabel: { fontSize: 11, marginBottom: 8 },
  rateBtn: { width: 34, height: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notesInput: { borderWidth: 1, minHeight: 70, padding: 10, textAlignVertical: 'top', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalBtn: { flex: 1, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
});
