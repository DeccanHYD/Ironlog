import React, { useContext, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { computeConsistencyMetrics } from '../domain/intelligence/performanceEngine';
import { buildAdaptiveDayTargets, buildProgramInsights } from '../domain/intelligence/programIntelligenceEngine';
import { formatWeightFromKg } from '../utils/weightUnits';

function getWeekHitDays(history = []) {
  const weekAgo = Date.now() - (7 * 86400000);
  return new Set(
    history
      .filter((session) => new Date(session?.date || 0).getTime() >= weekAgo)
      .map((session) => session.dayId)
      .filter(Boolean)
  );
}

export default function ProgramInsightsScreen({ navigation }) {
  const { plans, history, bodyWeight, settings } = useContext(AppContext);
  const colors = useTheme();
  const activePlan = plans?.[0] || null;
  const weekHitDays = useMemo(() => getWeekHitDays(history), [history]);
  const goalMode = activePlan?.goalMode || settings?.goalMode || 'hypertrophy';
  const weightUnit = settings?.weightUnit || 'kg';

  const programInsights = useMemo(() => buildProgramInsights({
    activePlan,
    history,
    goalMode,
  }), [activePlan, goalMode, history]);

  const consistency = useMemo(() => computeConsistencyMetrics({
    history,
    activePlan,
    bodyWeight,
  }), [activePlan, bodyWeight, history]);

  const nextDay = useMemo(() => {
    if (!activePlan?.days?.length) return null;
    return activePlan.days.find((day) => !weekHitDays.has(day.id)) || activePlan.days[0];
  }, [activePlan, weekHitDays]);

  const adaptiveTargets = useMemo(() => {
    if (!nextDay) return [];
    return buildAdaptiveDayTargets({
      day: nextDay,
      history,
      goalMode,
    }).slice(0, 6);
  }, [goalMode, history, nextDay]);

  if (!activePlan) {
    return (
      <View style={[s.emptyWrap, { backgroundColor: colors.bg }]}>
        <Ionicons name="analytics-outline" size={26} color={colors.accent} />
        <Text style={[s.emptyTitle, { color: colors.text }]}>No active program</Text>
        <Text style={[s.emptySub, { color: colors.muted }]}>Create a plan to unlock adaptive insights.</Text>
        <TouchableOpacity style={[s.emptyBtn, { borderColor: colors.accent }]} onPress={() => navigation.navigate('Plans')}>
          <Text style={[s.emptyBtnText, { color: colors.accent }]}>GO TO PLANS</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={[s.hero, { borderColor: colors.accent + '66', backgroundColor: colors.accentSoft }]}>
        <Text style={[s.heroSup, { color: colors.accent }]}>PROGRAM INSIGHTS</Text>
        <Text style={[s.heroTitle, { color: colors.text }]}>{activePlan.name}</Text>
        <Text style={[s.heroSub, { color: colors.subtext }]}>
          {programInsights.projectedProgress}
        </Text>
        <Text style={[s.heroSub, { color: colors.muted }]}>Goal mode: {goalMode.replace('_', ' ')}</Text>
      </View>

      <View style={s.metricRow}>
        <View style={[s.metricCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          <Text style={[s.metricVal, { color: colors.text }]}>{programInsights.adherence}%</Text>
          <Text style={[s.metricLabel, { color: colors.muted }]}>Adherence</Text>
        </View>
        <View style={[s.metricCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          <Text style={[s.metricVal, { color: colors.text }]}>{consistency.workoutsPerWeek}</Text>
          <Text style={[s.metricLabel, { color: colors.muted }]}>Workouts/Wk</Text>
        </View>
        <View style={[s.metricCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          <Text style={[s.metricVal, { color: colors.text }]}>{consistency.adherenceToProgram}%</Text>
          <Text style={[s.metricLabel, { color: colors.muted }]}>Plan Aligned</Text>
        </View>
      </View>

      <View style={[s.section, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Day Status</Text>
        {(programInsights.dayInsights || []).map((day) => {
          const statusColor = day.status === 'on_track' ? '#6FE0A4' : day.status === 'partial' ? '#FFD166' : '#FF8E8E';
          return (
            <View key={day.dayId} style={[s.dayRow, { borderBottomColor: colors.faint }]}>
              <Text style={[s.dayName, { color: colors.text }]}>{day.dayName}</Text>
              <Text style={[s.dayRate, { color: colors.subtext }]}>{day.completionRate}%</Text>
              <View style={[s.statusPill, { borderColor: statusColor + '66', backgroundColor: statusColor + '1a' }]}>
                <Text style={[s.statusText, { color: statusColor }]}>{day.status.replace('_', ' ')}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {programInsights.recommendedReschedule ? (
        <View style={[s.callout, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '12' }]}>
          <Text style={[s.calloutTitle, { color: colors.accent }]}>Missed-day handling</Text>
          <Text style={[s.calloutText, { color: colors.text }]}>{programInsights.recommendedReschedule}</Text>
        </View>
      ) : null}

      <View style={[s.section, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>
          Adaptive Next Targets{nextDay ? ` - ${nextDay.name}` : ''}
        </Text>
        {!adaptiveTargets.length ? (
          <Text style={[s.emptySub, { color: colors.muted }]}>No adaptive targets available yet.</Text>
        ) : (
          adaptiveTargets.map((target) => (
            <View key={`${target.dayId}:${target.exerciseId}`} style={[s.targetRow, { borderBottomColor: colors.faint }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.targetName, { color: colors.text }]}>{target.exerciseName}</Text>
                <Text style={[s.targetReason, { color: colors.muted }]} numberOfLines={2}>
                  {target.rationale}
                </Text>
              </View>
              <Text style={[s.targetVal, { color: target.action === 'reduce' ? '#FF8E8E' : colors.accent }]}>
                {Number(target.targetWeight || 0) > 0
                  ? `${formatWeightFromKg(target.targetWeight, weightUnit)} x ${Math.max(1, Number(target.targetReps || 0))}`
                  : `BW x ${Math.max(1, Number(target.targetReps || 0))}`}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  hero: { borderWidth: 1, padding: 16, marginBottom: 12 },
  heroSup: { fontSize: 9, fontWeight: '800', letterSpacing: 2.5 },
  heroTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 4 },
  heroSub: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  metricVal: { fontSize: 20, fontWeight: '900' },
  metricLabel: { fontSize: 9, letterSpacing: 1.2, marginTop: 3 },
  section: { borderWidth: 1, padding: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  dayName: { flex: 1, fontSize: 13, fontWeight: '700' },
  dayRate: { fontSize: 12, minWidth: 44, textAlign: 'right' },
  statusPill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  callout: { borderWidth: 1, padding: 12, marginBottom: 12 },
  calloutTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  calloutText: { fontSize: 13, lineHeight: 18 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  targetName: { fontSize: 13, fontWeight: '700' },
  targetReason: { fontSize: 11, marginTop: 3 },
  targetVal: { fontSize: 12, fontWeight: '900', marginLeft: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptySub: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  emptyBtn: { borderWidth: 1, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10 },
  emptyBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
});
