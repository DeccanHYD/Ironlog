import React, { useContext, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Modal, FlatList, TouchableOpacity } from 'react-native';
import { TouchableOpacity as RNGHTouchableOpacity } from 'react-native-gesture-handler';
import CustomAlert from '../components/CustomAlert';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { getExerciseIndex } from '../services/ExerciseLibraryService';
import { triggerHaptic } from '../services/hapticsEngine';
import {
  buildFilterChipOptions,
  getExerciseFilterSummary,
  getExercisePrimaryFocus,
  matchesExerciseFilter,
} from '../utils/exerciseFilters';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
const DAY_COLORS = ['#FF4500', '#0080FF', '#00C170', '#A020F0', '#FFD700', '#FF6B35', '#00BCD4'];
const GROUP_COLORS = { A: '#FF4500', B: '#0080FF', C: '#00C170' };
const LIB_ROW_HEIGHT = 64;

export default function PlanEditorScreen({ route, navigation }) {
  const { planId } = route.params;
  const { plans, savePlans, settings } = useContext(AppContext);
  const colors = useTheme();
  const haptic = settings?.hapticFeedback !== false;

  const planIdx = plans.findIndex(p => p.id === planId);
  const plan = plans[planIdx];

  const [alertConfig, setAlertConfig] = useState(null);
  const [editDayIdx, setEditDayIdx] = useState(null);
  const [showAddDay, setShowAddDay] = useState(false);
  const [dayName, setDayName] = useState('');
  const [dayTag, setDayTag] = useState('');
  const [showExLib, setShowExLib] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [libMuscle, setLibMuscle] = useState('All');
  const [allExercises, setAllExercises] = useState([]);
  const [libMuscles, setLibMuscles] = useState([]);
  const [replaceExIdx, setReplaceExIdx] = useState(null); // if set, library modal replaces instead of adds

  useEffect(() => {
    getExerciseIndex().then(idx => {
      if (!idx) return;
      setAllExercises(idx);
      setLibMuscles(buildFilterChipOptions(idx, { includeCategory: true, includeEquipment: false }));
    });
  }, []);

  useEffect(() => {
    if (libMuscle === 'All') return;
    if (!libMuscles.includes(libMuscle)) setLibMuscle('All');
  }, [libMuscles, libMuscle]);

  if (!plan) return null;

  const updatePlan = (updated) => {
    const newPlans = [...plans];
    newPlans[planIdx] = updated;
    savePlans(newPlans);
  };

  const addDay = () => {
    if (!dayName.trim()) return;
    const colorIdx = plan.days.length % DAY_COLORS.length;
    const newDay = {
      id: genId(),
      label: `D${plan.days.length + 1}`,
      name: dayName.trim().toUpperCase(),
      tag: dayTag.trim(),
      color: DAY_COLORS[colorIdx],
      exercises: [],
    };
    updatePlan({ ...plan, days: [...plan.days, newDay] });
    setDayName(''); setDayTag(''); setShowAddDay(false);
  };

  const deleteDay = (dayIdx) => {
    triggerHaptic('destructiveAction', { enabled: haptic }).catch(() => {});
    setAlertConfig({
      title: 'Delete day?',
      message: plan.days[dayIdx]?.name || '',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            const days = plan.days.filter((_, i) => i !== dayIdx);
            updatePlan({ ...plan, days });
            if (editDayIdx === dayIdx) setEditDayIdx(null);
          },
        },
      ],
    });
  };

  const addExercise = (ex) => {
    if (editDayIdx === null) return;
    const days = [...plan.days];
    if (replaceExIdx !== null) {
      // Replace mode
      const exs = [...(days[editDayIdx].exercises || [])];
      exs[replaceExIdx] = {
        ...exs[replaceExIdx],
        name: ex.name,
        primary: getExercisePrimaryFocus(ex),
        exerciseId: ex.id,
      };
      days[editDayIdx] = { ...days[editDayIdx], exercises: exs };
    } else {
      days[editDayIdx] = {
        ...days[editDayIdx],
        exercises: [...(days[editDayIdx].exercises || []), {
          name: ex.name,
          sets: 3,
          reps: '10',
          primary: getExercisePrimaryFocus(ex),
          note: '',
          exerciseId: ex.id,
          supersetGroup: null,
        }],
      };
    }
    updatePlan({ ...plan, days });
    setShowExLib(false);
    setReplaceExIdx(null);
  };

  const removeExercise = (dayIdx, exIdx) => {
    triggerHaptic('destructiveAction', { enabled: haptic }).catch(() => {});
    setAlertConfig({
      title: 'Remove exercise?',
      message: plan.days[dayIdx]?.exercises[exIdx]?.name || '',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: () => {
            const days = [...plan.days];
            days[dayIdx] = { ...days[dayIdx], exercises: days[dayIdx].exercises.filter((_, i) => i !== exIdx) };
            updatePlan({ ...plan, days });
          },
        },
      ],
    });
  };

  const onExLongPress = (dayIdx, exIdx) => {
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
    const ex = plan.days[dayIdx].exercises[exIdx];
    const currentGroup = ex.supersetGroup || null;
    setAlertConfig({
      title: ex.name,
      message: '',
      buttons: [
        {
          text: 'Replace exercise', style: 'default', onPress: () => {
            setEditDayIdx(dayIdx);
            setReplaceExIdx(exIdx);
            setShowExLib(true);
          },
        },
        {
          text: currentGroup ? `Change Superset (${currentGroup})` : 'Assign to Superset',
          style: 'default',
          onPress: () => showSupersetPicker(dayIdx, exIdx),
        },
        { text: 'Remove exercise', style: 'destructive', onPress: () => removeExercise(dayIdx, exIdx) },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const showSupersetPicker = (dayIdx, exIdx) => {
    const ex = plan.days[dayIdx].exercises[exIdx];
    const current = ex.supersetGroup;
    const buttons = ['A', 'B', 'C'].map(g => ({
      text: g + (current === g ? ' ✓' : ''),
      style: 'default',
      onPress: () => assignSuperset(dayIdx, exIdx, g),
    }));
    if (current) buttons.push({ text: 'Remove from Superset', style: 'destructive', onPress: () => assignSuperset(dayIdx, exIdx, null) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    setAlertConfig({ title: 'Assign to Superset', message: '', buttons });
  };

  const assignSuperset = (dayIdx, exIdx, group) => {
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
    const days = [...plan.days];
    const exs = [...days[dayIdx].exercises];
    exs[exIdx] = { ...exs[exIdx], supersetGroup: group };
    days[dayIdx] = { ...days[dayIdx], exercises: exs };
    updatePlan({ ...plan, days });
  };

  const onExerciseDragEnd = (dayIdx, { data }) => {
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
    const days = [...plan.days];
    days[dayIdx] = { ...days[dayIdx], exercises: data };
    updatePlan({ ...plan, days });
  };

  const filtered = allExercises.filter(e => {
    const ms = matchesExerciseFilter(e, libMuscle, { includeCategory: true, includeEquipment: false });
    const needle = libSearch.toLowerCase();
    const aliasText = Array.isArray(e.aliases) ? e.aliases.join(' ').toLowerCase() : '';
    const sr = !libSearch || e.name.toLowerCase().includes(needle) || aliasText.includes(needle);
    return ms && sr;
  });

  const renderLibRow = ({ item: ex }) => (
      <TouchableOpacity
      style={[ls.libRow, { borderBottomColor: colors.faint }]}
      onPress={() => addExercise(ex)}>
      <View style={{ flex: 1 }}>
        <Text style={[ls.exName, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
        <Text style={[ls.exMeta, { color: colors.muted }]} numberOfLines={1}>
          {getExerciseFilterSummary(ex).join(', ')}{ex.equipment ? ` · ${toTitleCase(ex.equipment)}` : ''}
        </Text>
      </View>
      <Ionicons name={replaceExIdx !== null ? 'swap-horizontal' : 'add'} size={20} color={colors.accent} />
    </TouchableOpacity>
  );

  const renderExercise = (dayIdx) => ({ item: ex, drag, isActive, getIndex }) => {
    const exIdx = getIndex();
    const group = ex.supersetGroup;
    const groupColor = group ? GROUP_COLORS[group] : null;
    return (
      <ScaleDecorator activeScale={0.98}>
        <View style={[ls.exRow, {
          borderTopColor: colors.faint,
          backgroundColor: isActive ? colors.cardBorder : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
        }]}>
          <TouchableOpacity onPress={() => onExLongPress(dayIdx, exIdx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ flex: 1 }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[ls.exName, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                {group ? (
                  <View style={[ls.groupBadge, { borderColor: groupColor + '66', backgroundColor: groupColor + '22' }]}>
                    <Text style={[ls.groupBadgeText, { color: groupColor }]}>{group}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[ls.exMeta, { color: colors.muted }]}>{ex.sets} sets · {ex.reps} reps · {ex.primary}</Text>
            </View>
          </TouchableOpacity>
          <RNGHTouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 12 }}>
            <Ionicons name="reorder-two-outline" size={24} color={colors.faint} />
          </RNGHTouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View style={[ls.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[ls.planName, { color: colors.text }]}>{plan.name}</Text>

        {plan.days.map((day, di) => (
          <View key={day.id} style={[ls.dayCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={[ls.dayHeader, { borderLeftColor: day.color }]}
              onPress={() => setEditDayIdx(editDayIdx === di ? null : di)}>
              <View>
                <Text style={[ls.dayName, { color: colors.text }]}>{day.name}</Text>
                <Text style={[ls.dayTag, { color: colors.muted }]}>{day.tag || 'No description'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => deleteDay(di)}>
                  <Ionicons name="trash-outline" size={16} color="#CC2222" />
                </TouchableOpacity>
                <Ionicons name={editDayIdx === di ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </View>
            </TouchableOpacity>

            {editDayIdx === di && (
              <View style={{ paddingTop: 4 }}>
                <DraggableFlatList
                  data={day.exercises || []}
                  keyExtractor={(ex, i) => ex.exerciseId || ex.name + i}
                  renderItem={renderExercise(di)}
                  onDragEnd={(result) => onExerciseDragEnd(di, result)}
                  scrollEnabled={false}
                  activationDistance={10}
                />
                <TouchableOpacity
                  style={[ls.addExBtn, { borderColor: colors.accent }]}
                  onPress={() => { setEditDayIdx(di); setReplaceExIdx(null); setShowExLib(true); }}>
                  <Text style={[ls.addExBtnText, { color: colors.accent }]}>+ ADD EXERCISE</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={[ls.addDayBtn, { borderColor: colors.accent }]} onPress={() => setShowAddDay(true)}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={[ls.addDayBtnText, { color: colors.accent }]}>ADD DAY</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Day Modal */}
      <Modal visible={showAddDay} transparent animationType="fade">
        <View style={ls.overlay}>
          <View style={[ls.modal, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[ls.modalTitle, { color: colors.text }]}>ADD DAY</Text>
            <TextInput
              style={[ls.input, { color: colors.text, borderColor: colors.faint }]}
              placeholder="Day name (e.g. PUSH)" placeholderTextColor={colors.muted}
              value={dayName} onChangeText={setDayName} autoFocus />
            <TextInput
              style={[ls.input, { color: colors.text, borderColor: colors.faint, marginTop: 10 }]}
              placeholder="Tag (e.g. Chest · Shoulders)" placeholderTextColor={colors.muted}
              value={dayTag} onChangeText={setDayTag} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[ls.cancelBtn, { borderColor: colors.faint }]} onPress={() => setShowAddDay(false)}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ls.confirmBtn, { backgroundColor: colors.accent }]} onPress={addDay}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert visible={!!alertConfig} title={alertConfig?.title} message={alertConfig?.message} buttons={alertConfig?.buttons || []} onDismiss={() => setAlertConfig(null)} />

      {/* Exercise Library Modal */}
      <Modal visible={showExLib} transparent animationType="slide" onRequestClose={() => { setShowExLib(false); setReplaceExIdx(null); }}>
        <View style={ls.libOverlay}>
          <View style={[ls.libCard, { backgroundColor: colors.card, borderTopColor: colors.cardBorder }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[ls.modalTitle, { color: colors.text, marginBottom: 0 }]}>
                {replaceExIdx !== null ? 'REPLACE EXERCISE' : 'ADD EXERCISE'}
              </Text>
              <TouchableOpacity onPress={() => { setShowExLib(false); setReplaceExIdx(null); }}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[ls.input, { color: colors.text, borderColor: colors.faint, marginBottom: 10 }]}
              placeholder="Search..." placeholderTextColor={colors.muted}
              value={libSearch} onChangeText={setLibSearch} />
            <View style={ls.chipsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={ls.chipsScroller}
                contentContainerStyle={ls.chipsContent}>
                {['All', ...libMuscles].map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => {
                      triggerHaptic('selection', { enabled: haptic }).catch(() => {});
                      setLibMuscle(m);
                    }}
                    style={[ls.chip, {
                      borderColor: libMuscle === m ? colors.accent : colors.faint,
                      backgroundColor: libMuscle === m ? colors.accentSoft : 'transparent',
                    }]}>
                    <Text style={[ls.chipText, { color: libMuscle === m ? colors.accent : colors.muted }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={[ls.countText, { color: colors.muted }]}>{filtered.length} exercises</Text>
            <FlatList
              style={{ flex: 1 }}
              data={filtered}
              keyExtractor={item => item.id}
              renderItem={renderLibRow}
              getItemLayout={(_, i) => ({ length: LIB_ROW_HEIGHT, offset: LIB_ROW_HEIGHT * i, index: i })}
              windowSize={10}
              maxToRenderPerBatch={15}
              removeClippedSubviews={true}
              initialNumToRender={20}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={ls.emptyState}>
                  <Text style={[ls.exMeta, { color: colors.muted }]}>No exercises match this search/filter.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ls = StyleSheet.create({
  container: { flex: 1 },
  planName: { fontSize: 24, fontWeight: '900', marginBottom: 20, letterSpacing: -0.5 },
  dayCard: { borderWidth: 1, marginBottom: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderLeftWidth: 4 },
  dayName: { fontSize: 18, fontWeight: '900' },
  dayTag: { fontSize: 11, marginTop: 2 },
  exRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1 },
  exName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  exMeta: { fontSize: 11, marginTop: 2 },
  groupBadge: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  groupBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  addExBtn: { margin: 12, borderWidth: 1, borderStyle: 'dashed', padding: 10, alignItems: 'center' },
  addExBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', padding: 16, justifyContent: 'center' },
  addDayBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { padding: 24, borderWidth: 1, width: '100%' },
  modalTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 3, marginBottom: 16 },
  input: { borderWidth: 1, padding: 12, fontSize: 15 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderWidth: 1 },
  confirmBtn: { flex: 1, padding: 14, alignItems: 'center' },
  libOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  libCard: { borderTopWidth: 1, padding: 20, height: '85%' },
  chipsWrap: { height: 42, marginBottom: 8 },
  chipsScroller: { flex: 1 },
  chipsContent: { gap: 8, paddingHorizontal: 2, paddingVertical: 2, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '600' },
  countText: { fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  libRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 12, borderBottomWidth: 1, height: LIB_ROW_HEIGHT },
  emptyState: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
});
