
import React, { useContext, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { formatWeightFromKg } from '../utils/weightUnits';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_WIDTH = (SCREEN_WIDTH - 32) / 7;
const CELL_HEIGHT = 48;
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getStreakCount(history) {
  if (!history.length) return 0;
  const workoutDays = new Set(history.map(h => h.date.split('T')[0]));
  const today = new Date();
  let streak = 0;
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (true) {
    const key = cursor.toISOString().split('T')[0];
    if (workoutDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function formatDurationMins(seconds) {
  if (!seconds) return '0min';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function formatDateLong(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function calcSessionVolume(session) {
  if (!session.exercises || !session.exercises.length) return 0;
  let total = 0;
  for (const ex of session.exercises) {
    if (!ex.sets) continue;
    for (const set of ex.sets) {
      const w = parseFloat(set.weight) || 0;
      const r = parseFloat(set.reps) || 0;
      total += w * r;
    }
  }
  return Math.round(total);
}

function toDisplayVolume(kgValue, unit) {
  const converted = unit === 'lbs' ? kgValue * 2.2046226218 : kgValue;
  return Math.round(converted);
}

export default function WorkoutCalendarScreen() {
  const { history, settings } = useContext(AppContext);
  const colors = useTheme();
  const weightUnit = settings?.weightUnit || 'kg';

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedSession, setSelectedSession] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Build a map: dateString -> array of sessions
  const sessionsByDate = useMemo(() => {
    const map = {};
    for (const h of history) {
      const key = h.date.split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(h);
    }
    return map;
  }, [history]);

  // Stats
  const streak = useMemo(() => getStreakCount(history), [history]);

  const monthSessions = useMemo(() => {
    return history.filter(h => {
      const d = new Date(h.date);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    });
  }, [history, viewYear, viewMonth]);

  const monthWorkoutCount = monthSessions.length;

  const monthTotalVolume = useMemo(() => {
    let vol = 0;
    for (const s of monthSessions) {
      vol += calcSessionVolume(s);
    }
    return vol;
  }, [monthSessions]);

  // Calendar grid
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayKey = today.toISOString().split('T')[0];

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  function handleDayPress(dayNum) {
    const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const sessions = sessionsByDate[dateKey];
    if (!sessions || sessions.length === 0) return;
    // Show the most recent session for that day
    setSelectedSession(sessions[sessions.length - 1]);
    setModalVisible(true);
  }

  // Build cells array: nulls for leading blank days, then day numbers
  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  const s = makeStyles(colors);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header Stats Card */}
        <View style={s.statsCard}>
          <View style={s.statItem}>
            <Text style={s.statVal}>{streak}</Text>
            <Text style={s.statLabel}>STREAK</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.faint }]} />
          <View style={s.statItem}>
            <Text style={s.statVal}>{monthWorkoutCount}</Text>
            <Text style={s.statLabel}>THIS MONTH</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.faint }]} />
          <View style={s.statItem}>
            <Text style={s.statVal}>
              {toDisplayVolume(monthTotalVolume, weightUnit) >= 1000
                ? `${(toDisplayVolume(monthTotalVolume, weightUnit) / 1000).toFixed(1)}k`
                : toDisplayVolume(monthTotalVolume, weightUnit)}
            </Text>
            <Text style={s.statLabel}>VOLUME ({weightUnit})</Text>
          </View>
        </View>

        {/* Month Navigator */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={goToPrevMonth} style={s.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.monthTitle}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} style={s.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Calendar Grid */}
        <View style={[s.calendarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Day-of-week headers */}
          <View style={s.weekHeaderRow}>
            {DAY_HEADERS.map(d => (
              <View key={d} style={[s.weekHeaderCell, { width: CELL_WIDTH }]}>
                <Text style={s.weekHeaderText}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar rows */}
          {rows.map((row, ri) => (
            <View key={ri} style={s.calRow}>
              {row.map((dayNum, ci) => {
                if (dayNum === null) {
                  return <View key={ci} style={[s.dayCell, { width: CELL_WIDTH, height: CELL_HEIGHT }]} />;
                }
                const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const sessions = sessionsByDate[dateKey] || [];
                const hasWorkout = sessions.length > 0;
                const isDeload = hasWorkout && sessions.every(s => s.isDeload);
                const isToday = dateKey === todayKey;
                const isFuture = dateKey > todayKey;

                return (
                  <TouchableOpacity
                    key={ci}
                    style={[
                      s.dayCell,
                      { width: CELL_WIDTH, height: CELL_HEIGHT },
                      isToday && s.todayCell,
                      isToday && { borderColor: colors.accent },
                    ]}
                    onPress={() => handleDayPress(dayNum)}
                    activeOpacity={hasWorkout ? 0.6 : 1}
                    disabled={!hasWorkout}
                  >
                    <Text style={[
                      s.dayNum,
                      { color: isFuture ? colors.muted : isToday ? colors.accent : colors.text },
                    ]}>
                      {dayNum}
                    </Text>
                    {hasWorkout && (
                      <View style={[
                        s.dot,
                        { backgroundColor: isDeload ? colors.muted : colors.accent },
                      ]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* This Month's Sessions List */}
        {monthSessions.length > 0 && (
          <View style={s.sessionListSection}>
            <Text style={[s.sectionLabel, { color: colors.muted }]}>
              {MONTH_NAMES[viewMonth].toUpperCase()} SESSIONS
            </Text>
            {[...monthSessions].reverse().map((session, idx) => {
              const dayColors = { push: '#FF4500', pull: '#0080FF', legs: '#00C170', upper: '#A020F0' };
              const accentColor = dayColors[session.dayId] || colors.accent;
              return (
                <TouchableOpacity
                  key={session.id || idx}
                  style={[s.sessionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, borderLeftColor: accentColor }]}
                  onPress={() => { setSelectedSession(session); setModalVisible(true); }}
                  activeOpacity={0.7}
                >
                  <View style={s.sessionCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sessionDayName, { color: accentColor }]}>
                        {session.dayName || (session.dayId ? session.dayId.toUpperCase() : 'WORKOUT')}
                        {session.isDeload ? ' · DELOAD' : ''}
                      </Text>
                      <Text style={[s.sessionMeta, { color: colors.muted }]}>
                        {session.sets} sets · {formatDurationMins(session.duration)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.sessionDate, { color: colors.subtext }]}>
                        {formatDateShort(session.date)}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} style={{ marginTop: 4 }} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {monthSessions.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={36} color={colors.muted} />
            <Text style={[s.emptyText, { color: colors.muted }]}>No workouts this month</Text>
          </View>
        )}
      </ScrollView>

      {/* Session Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[s.modalSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {}}
          >
            {selectedSession && <SessionDetailContent session={selectedSession} colors={colors} weightUnit={weightUnit} onClose={() => setModalVisible(false)} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function SessionDetailContent({ session, colors, weightUnit, onClose }) {
  const dayColors = { push: '#FF4500', pull: '#0080FF', legs: '#00C170', upper: '#A020F0' };
  const accentColor = dayColors[session.dayId] || colors.accent;
  const volume = calcSessionVolume(session);

  return (
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      {/* Drag handle */}
      <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
        <View style={[{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.muted }]} />
      </View>

      {/* Close button */}
      <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 12, right: 16, padding: 4 }}>
        <Ionicons name="close" size={22} color={colors.muted} />
      </TouchableOpacity>

      {/* Session header */}
      <View style={{ padding: 20, paddingTop: 16 }}>
        <Text style={[modalS.modalDayName, { color: accentColor }]}>
          {session.dayName || (session.dayId ? session.dayId.toUpperCase() : 'WORKOUT')}
          {session.isDeload ? '  ·  DELOAD' : ''}
        </Text>
        <Text style={[modalS.modalDate, { color: colors.subtext }]}>
          {formatDateLong(session.date)}
        </Text>
      </View>

      {/* Stats row */}
      <View style={[modalS.statsRow, { borderTopColor: colors.faint, borderBottomColor: colors.faint }]}>
        <View style={modalS.statCol}>
          <Text style={[modalS.statNum, { color: colors.text }]}>{session.sets}</Text>
          <Text style={[modalS.statLbl, { color: colors.muted }]}>SETS</Text>
        </View>
        <View style={[modalS.statDivider, { backgroundColor: colors.faint }]} />
        <View style={modalS.statCol}>
          <Text style={[modalS.statNum, { color: colors.text }]}>{formatDurationMins(session.duration)}</Text>
          <Text style={[modalS.statLbl, { color: colors.muted }]}>DURATION</Text>
        </View>
        <View style={[modalS.statDivider, { backgroundColor: colors.faint }]} />
        <View style={modalS.statCol}>
          <Text style={[modalS.statNum, { color: colors.text }]}>
            {volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : volume || '—'}
          </Text>
          <Text style={[modalS.statLbl, { color: colors.muted }]}>VOL ({weightUnit})</Text>
        </View>
      </View>

      {/* Exercises */}
      {session.exercises && session.exercises.length > 0 ? (
        <View style={{ padding: 16 }}>
          <Text style={[modalS.exSectionLabel, { color: colors.muted }]}>EXERCISES</Text>
          {session.exercises.map((ex, ei) => (
            <View
              key={ei}
              style={[modalS.exRow, { backgroundColor: colors.bg, borderColor: colors.faint }]}
            >
              <Text style={[modalS.exName, { color: colors.text }]}>{ex.name}</Text>
              {ex.sets && ex.sets.length > 0 && (
                <Text style={[modalS.exSets, { color: colors.muted }]}>
                  {ex.sets
                    .map(set => {
                      const w = set.weight > 0 ? formatWeightFromKg(set.weight, weightUnit) : 'BW';
                      return `${w} × ${set.reps}`;
                    })
                    .join('  ·  ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>No exercise details recorded.</Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    // Stats card
    statsCard: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      margin: 16,
      marginBottom: 8,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
    },
    statVal: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 8,
      letterSpacing: 2,
      color: colors.muted,
      marginTop: 4,
    },
    statDivider: {
      width: 1,
      marginVertical: 10,
    },
    // Month nav
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    navBtn: {
      padding: 4,
    },
    monthTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    // Calendar card
    calendarCard: {
      marginHorizontal: 16,
      borderWidth: 1,
      paddingBottom: 4,
    },
    weekHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.faint,
    },
    weekHeaderCell: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    weekHeaderText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.muted,
    },
    calRow: {
      flexDirection: 'row',
    },
    dayCell: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 4,
    },
    todayCell: {
      borderWidth: 1,
      borderRadius: 0,
    },
    dayNum: {
      fontSize: 14,
      fontWeight: '600',
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      marginTop: 3,
    },
    // Sessions list
    sessionListSection: {
      marginTop: 24,
      paddingHorizontal: 16,
    },
    sectionLabel: {
      fontSize: 10,
      letterSpacing: 4,
      marginBottom: 10,
      fontWeight: '700',
    },
    sessionCard: {
      borderWidth: 1,
      borderLeftWidth: 3,
      marginBottom: 8,
      padding: 14,
      backgroundColor: colors.card,
    },
    sessionCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sessionDayName: {
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    sessionMeta: {
      fontSize: 12,
      marginTop: 2,
    },
    sessionDate: {
      fontSize: 12,
      fontWeight: '700',
    },
    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      maxHeight: '80%',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
  });
}

const modalS = StyleSheet.create({
  modalDayName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  modalDate: {
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 2,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '900',
  },
  statLbl: {
    fontSize: 8,
    letterSpacing: 2,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    marginVertical: 10,
  },
  exSectionLabel: {
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: '700',
    marginBottom: 10,
  },
  exRow: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 6,
  },
  exName: {
    fontSize: 14,
    fontWeight: '700',
  },
  exSets: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
});
