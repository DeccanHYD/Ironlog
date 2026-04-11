import React, { useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, calculateVolume } from '../utils/calculations';
import { AppContext } from '../context/AppContext';
import { formatVolumeFromKg, formatWeightFromKg } from '../utils/weightUnits';

const C = {
  BG: '#080808',
  SURFACE: '#0f0f0f',
  CARD: '#141414',
  BORDER: '#1e1e1e',
  TEXT: '#f0f0f0',
  SECONDARY: '#666',
  MUTED: '#333',
  PUSH: '#FF4500',
  LEGS: '#00C170',
  GOLD: '#FFD700',
  PULL: '#0080FF',
};

export default function WorkoutSummaryScreen({ route, navigation }) {
  const { settings } = useContext(AppContext);
  const weightUnit = settings?.weightUnit || 'kg';
  const { session, prsHit = [], prevSession } = route.params;

  const completedSets = session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0,
  );
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedExercises = session.exercises.filter(
    ex => ex.sets.some(s => s.completed),
  ).length;

  const prevVolume = prevSession
    ? prevSession.exercises.reduce(
        (sum, ex) => sum + calculateVolume(ex.sets), 0,
      )
    : null;
  const volumeDiff = prevVolume !== null ? session.totalVolume - prevVolume : null;
  const volumeDiffPct = prevVolume && prevVolume > 0
    ? Math.round((volumeDiff / prevVolume) * 100)
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Celebration Header */}
        <View style={styles.celebHeader}>
          <Text style={styles.celebIcon}>
            {prsHit.length > 0 ? '🏆' : '💪'}
          </Text>
          <Text style={styles.celebTitle}>
            {prsHit.length > 0 ? 'PERSONAL RECORDS!' : 'WORKOUT COMPLETE'}
          </Text>
          <Text style={styles.sessionDate}>
            {new Date(session.date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        {/* Main Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: C.PUSH }]}>
              {formatDuration(session.duration)}
            </Text>
            <Text style={styles.statLabel}>DURATION</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: C.PULL }]}>
              {Math.round((weightUnit === 'lbs' ? session.totalVolume * 2.2046226218 : session.totalVolume)).toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>VOLUME ({weightUnit})</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: C.LEGS }]}>
              {completedSets}/{totalSets}
            </Text>
            <Text style={styles.statLabel}>SETS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#A020F0' }]}>
              {completedExercises}
            </Text>
            <Text style={styles.statLabel}>EXERCISES</Text>
          </View>
        </View>

        {/* Volume vs Last Session */}
        {volumeDiff !== null && (
          <View style={styles.compareCard}>
            <Text style={styles.compareLabel}>VS LAST SESSION</Text>
            <Text style={[
              styles.compareValue,
              { color: volumeDiff >= 0 ? C.LEGS : C.PUSH },
            ]}>
              {volumeDiff >= 0 ? '+' : ''}{formatVolumeFromKg(Math.abs(volumeDiff), weightUnit)}
              {volumeDiffPct !== null ? ` (${volumeDiff >= 0 ? '+' : ''}${volumeDiffPct}%)` : ''}
            </Text>
          </View>
        )}

        {/* PRs Hit */}
        {prsHit.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 PERSONAL RECORDS</Text>
            {prsHit.map(name => (
              <View key={name} style={styles.prCard}>
                <Text style={styles.prGold}>★</Text>
                <Text style={styles.prName}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Exercise Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EXERCISES</Text>
          {session.exercises.map((ex, idx) => {
            const completedEx = ex.sets.filter(s => s.completed);
            const exVol = calculateVolume(ex.sets);
            return (
              <View key={idx} style={styles.exCard}>
                <View style={styles.exCardHeader}>
                  <Text style={styles.exCardName}>{ex.name}</Text>
                  <Text style={styles.exCardVol}>{exVol > 0 ? formatVolumeFromKg(exVol, weightUnit) : '—'}</Text>
                </View>
                <View style={styles.setsList}>
                  {ex.sets.map((s, si) => (
                    <View key={si} style={[styles.setItem, !s.completed && styles.setItemSkipped]}>
                      <Text style={styles.setItemText}>
                        {s.isWarmup ? 'W' : si + 1}{' '}
                        <Text style={[styles.setWeight, s.completed && { color: C.TEXT }]}>
                          {Number(s.weight || 0) > 0 ? formatWeightFromKg(s.weight, weightUnit) : 'BW'} × {s.reps}
                        </Text>
                      </Text>
                      {s.completed && <Text style={styles.setCheck}>✓</Text>}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
          >
            <Text style={styles.homeBtnText}>HOME</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => navigation.navigate('Tabs', { screen: 'Log' })}
          >
            <Text style={styles.historyBtnText}>HISTORY</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.BG },
  content: { padding: 20, paddingBottom: 40 },
  celebHeader: { alignItems: 'center', paddingVertical: 30 },
  celebIcon: { fontSize: 60, marginBottom: 12 },
  celebTitle: {
    color: C.TEXT,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'BarlowCondensed_700Bold',
    marginBottom: 8,
  },
  sessionDate: { color: C.SECONDARY, fontSize: 14 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: C.CARD,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed_700Bold',
    letterSpacing: 1,
  },
  statLabel: {
    color: C.SECONDARY,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 4,
  },
  compareCard: {
    backgroundColor: C.CARD,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  compareLabel: { color: C.SECONDARY, fontSize: 11, letterSpacing: 2 },
  compareValue: { fontSize: 20, fontWeight: '700', fontFamily: 'BarlowCondensed_700Bold' },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: C.SECONDARY,
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 10,
    fontWeight: '700',
  },
  prCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD70015',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFD70044',
    gap: 10,
  },
  prGold: { color: C.GOLD, fontSize: 20 },
  prName: { color: C.GOLD, fontSize: 16, fontWeight: '700', flex: 1 },
  exCard: {
    backgroundColor: C.CARD,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  exCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  exCardName: { color: C.TEXT, fontSize: 15, fontWeight: '700', flex: 1 },
  exCardVol: { color: C.SECONDARY, fontSize: 13 },
  setsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  setItemSkipped: { opacity: 0.4 },
  setItemText: { color: C.SECONDARY, fontSize: 12 },
  setWeight: { color: C.SECONDARY },
  setCheck: { color: C.LEGS, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  homeBtn: {
    flex: 1,
    backgroundColor: C.PUSH,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  homeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed_700Bold',
  },
  historyBtn: {
    flex: 1,
    backgroundColor: C.CARD,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  historyBtnText: {
    color: C.TEXT,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
