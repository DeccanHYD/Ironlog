
import React, { useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { formatWeightFromKg } from '../utils/weightUnits';

function getStreak(history) {
  if (!history.length) return 0;
  const days = [...new Set(history.map(h => h.date.split('T')[0]))].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let streak = 0; let prev = days[0];
  for (const d of days) {
    const diff = (new Date(prev) - new Date(d)) / 86400000;
    if (diff <= 1) { streak++; prev = d; } else break;
  }
  return streak;
}

export default function StatsScreen({ navigation }) {
  const { history, pb, clearPbs, settings } = useContext(AppContext);
  const colors = useTheme();
  const weightUnit = settings?.weightUnit || 'kg';
  const streak = getStreak(history);
  const totalSets = history.reduce((a, h) => a + h.sets, 0);
  const avgDur = history.length ? Math.round(history.reduce((a, h) => a + h.duration, 0) / history.length / 60) : 0;
  // Build last-14-days grid — always 14 slots so bars are proportional
  const dayMap = {}; history.forEach(h => { const d = h.date.split('T')[0]; dayMap[d] = (dayMap[d] || 0) + 1; });
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    return d.toISOString().split('T')[0];
  });
  const pbEntries = Object.entries(pb).sort(([,a],[,b]) => b - a);

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Quick nav */}
      <View style={[s.quickNav, { borderBottomColor: colors.faint }]}>
        <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => navigation.navigate('WorkoutCalendar')}>
          <Ionicons name="calendar-outline" size={20} color={colors.accent} />
          <Text style={[s.navBtnText, { color: colors.text }]}>CALENDAR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => navigation.navigate('VolumeAnalytics')}>
          <Ionicons name="bar-chart-outline" size={20} color={colors.accent} />
          <Text style={[s.navBtnText, { color: colors.text }]}>VOLUME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => navigation.navigate('BodyMeasurements')}>
          <Ionicons name="body-outline" size={20} color={colors.accent} />
          <Text style={[s.navBtnText, { color: colors.text }]}>BODY</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.statsBar, { borderBottomColor: colors.faint }]}>
        {[
          { label: 'SESSIONS', val: history.length },
          { label: 'TOTAL SETS', val: totalSets },
          { label: 'AVG TIME', val: avgDur + 'm' },
          { label: 'STREAK', val: streak + 'd' },
        ].map((stat, i) => (
          <View key={stat.label} style={[s.statBox, i < 3 && { borderRightWidth: 1, borderRightColor: colors.faint }]}>
            <Text style={[s.statVal, { color: colors.text }]}>{stat.val}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={[s.section, { borderBottomColor: colors.faint }]}>
        <Text style={[s.sectionLabel, { color: colors.muted }]}>LAST 14 DAYS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 48 }}>
          {last14.map(d => {
            const count = dayMap[d] || 0;
            const isToday = d === new Date().toISOString().split('T')[0];
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 48 }}>
                <View style={{
                  width: '80%',
                  height: count > 0 ? Math.min(count * 24, 44) : 3,
                  backgroundColor: count > 0 ? colors.accent : colors.faint,
                  opacity: isToday && count === 0 ? 0.5 : 1,
                  borderRadius: 2,
                }} />
              </View>
            );
          })}
        </View>
      </View>

      {pbEntries.length > 0 && (
        <View style={s.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[s.sectionLabel, { color: colors.muted }]}>PERSONAL BESTS</Text>
            <TouchableOpacity onPress={clearPbs}>
              <Text style={{ fontSize: 10, color: colors.accent, letterSpacing: 1 }}>RESET</Text>
            </TouchableOpacity>
          </View>
          {pbEntries.map(([k, v]) => {
            const name = k.split('-').slice(1).join('-');
            const orm = Math.round(v * (1 + 5 / 30));
            return (
              <View key={k} style={[s.pbRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{name}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Est. 1RM: ~{formatWeightFromKg(orm, weightUnit)}</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.gold }}>🏆 {formatWeightFromKg(v, weightUnit)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {history.length === 0 && (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>No workouts yet. Start one!</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  quickNav: { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: 1 },
  navBtn: { flex: 1, borderWidth: 1, padding: 12, alignItems: 'center', gap: 6 },
  navBtnText: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  statsBar: { flexDirection: 'row', borderBottomWidth: 1 },
  statBox: { flex: 1, padding: 16, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 8, letterSpacing: 2, marginTop: 4 },
  section: { padding: 20 },
  sectionLabel: { fontSize: 10, letterSpacing: 4, marginBottom: 10 },
  pbRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, marginBottom: 6 },
});
