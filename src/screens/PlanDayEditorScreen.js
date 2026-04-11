import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Dimensions,
} from 'react-native';
const SCREEN_H = Dimensions.get('window').height;
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import ExerciseCard from '../components/ExerciseCard';
import { generateId } from '../utils/calculations';
import { EXERCISES, MUSCLE_GROUPS } from '../data/exerciseLibrary';
import { getExerciseIndex } from '../services/ExerciseLibraryService';

const C = {
  BG: '#080808',
  SURFACE: '#0f0f0f',
  CARD: '#141414',
  BORDER: '#1e1e1e',
  TEXT: '#f0f0f0',
  SECONDARY: '#666',
  MUTED: '#333',
  PUSH: '#FF4500',
  PULL: '#0080FF',
  LEGS: '#00C170',
  DANGER: '#CC2222',
};

function EditExerciseModal({ visible, exercise, onSave, onClose }) {
  const [name, setName] = useState(exercise?.name || '');
  const [sets, setSets] = useState(String(exercise?.sets || 3));
  const [reps, setReps] = useState(exercise?.reps || '10');
  const [rest, setRest] = useState(String(exercise?.defaultRestSeconds || 120));
  const [notes, setNotes] = useState(exercise?.notes || '');
  const [isHeavy, setIsHeavy] = useState(exercise?.isHeavy || false);
  const [isWarmup, setIsWarmup] = useState(exercise?.isWarmup || false);

  React.useEffect(() => {
    if (exercise) {
      setName(exercise.name || '');
      setSets(String(exercise.sets || 3));
      setReps(exercise.reps || '10');
      setRest(String(exercise.defaultRestSeconds || 120));
      setNotes(exercise.notes || '');
      setIsHeavy(exercise.isHeavy || false);
      setIsWarmup(exercise.isWarmup || false);
    }
  }, [exercise]);

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      ...exercise,
      name: name.trim(),
      sets: parseInt(sets) || 3,
      reps: reps.trim() || '10',
      defaultRestSeconds: parseInt(rest) || 120,
      notes: notes.trim(),
      isHeavy,
      isWarmup,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <Text style={modalStyles.title}>EDIT EXERCISE</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={modalStyles.label}>Name</Text>
            <TextInput
              style={modalStyles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={C.SECONDARY}
            />
            <View style={modalStyles.row}>
              <View style={modalStyles.half}>
                <Text style={modalStyles.label}>Sets</Text>
                <TextInput
                  style={modalStyles.input}
                  value={sets}
                  onChangeText={setSets}
                  keyboardType="numeric"
                  placeholderTextColor={C.SECONDARY}
                />
              </View>
              <View style={modalStyles.half}>
                <Text style={modalStyles.label}>Reps</Text>
                <TextInput
                  style={modalStyles.input}
                  value={reps}
                  onChangeText={setReps}
                  placeholderTextColor={C.SECONDARY}
                  placeholder="e.g. 8-12"
                />
              </View>
            </View>
            <Text style={modalStyles.label}>Rest (seconds)</Text>
            <TextInput
              style={modalStyles.input}
              value={rest}
              onChangeText={setRest}
              keyboardType="numeric"
              placeholderTextColor={C.SECONDARY}
            />
            <Text style={modalStyles.label}>Notes</Text>
            <TextInput
              style={[modalStyles.input, { height: 80 }]}
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor={C.SECONDARY}
              multiline
              placeholder="Cues, technique notes..."
            />
            <View style={modalStyles.togglesRow}>
              <TouchableOpacity
                style={[modalStyles.toggle, isHeavy && modalStyles.toggleActive]}
                onPress={() => setIsHeavy(!isHeavy)}
              >
                <Text style={[modalStyles.toggleText, isHeavy && { color: C.PUSH }]}>
                  HEAVY
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.toggle, isWarmup && modalStyles.toggleWarmupActive]}
                onPress={() => setIsWarmup(!isWarmup)}
              >
                <Text style={[modalStyles.toggleText, isWarmup && { color: '#888' }]}>
                  WARM-UP
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <View style={modalStyles.buttons}>
            <TouchableOpacity style={modalStyles.cancel} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.save} onPress={handleSave}>
              <Text style={modalStyles.saveText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddFromLibraryModal({ visible, onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const [filterMuscle, setFilterMuscle] = useState('All');
  const [library, setLibrary] = useState([]);

  useEffect(() => {
    if (!visible) return;
    getExerciseIndex()
      .then((index) => setLibrary(Array.isArray(index) ? index : EXERCISES))
      .catch(() => setLibrary(EXERCISES));
  }, [visible]);

  const source = library.length ? library : EXERCISES;
  const filtered = source.filter(ex => {
    const muscleLabel = ex.muscleGroup || ex.primaryMuscle || (ex.primaryMuscles || [])[0] || '';
    const matchMuscle = filterMuscle === 'All' || String(muscleLabel).toLowerCase() === filterMuscle.toLowerCase();
    const aliasText = Array.isArray(ex.aliases) ? ex.aliases.join(' ').toLowerCase() : '';
    const needle = search.toLowerCase();
    const matchSearch = ex.name.toLowerCase().includes(needle) || aliasText.includes(needle);
    return matchMuscle && matchSearch;
  });

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={libStyles.overlay}>
        <View style={libStyles.card}>
          <View style={libStyles.header}>
            <Text style={libStyles.title}>EXERCISE LIBRARY</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={libStyles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={libStyles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises..."
            placeholderTextColor={C.SECONDARY}
          />
          <View style={{ height: 50, marginBottom: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 16 }}>
              {['All', ...MUSCLE_GROUPS].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[libStyles.filterChip, filterMuscle === m && libStyles.filterChipActive]}
                  onPress={() => setFilterMuscle(m)}
                >
                  <Text style={[libStyles.filterText, filterMuscle === m && { color: C.PUSH }]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <ScrollView style={libStyles.list}>
            {filtered.map(ex => (
              <TouchableOpacity
                key={ex.id}
                style={libStyles.exRow}
                onPress={() => onAdd(ex)}
              >
                <View style={libStyles.exInfo}>
                  <Text style={libStyles.exName}>{ex.name}</Text>
                  <Text style={libStyles.exMeta}>{ex.muscleGroup || ex.primaryMuscle || (ex.primaryMuscles || [])[0] || 'Other'} · {ex.equipment || 'Other'}</Text>
                </View>
                <Text style={libStyles.addIcon}>+</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function PlanDayEditorScreen({ route, navigation }) {
  const { plan, day } = route.params;
  // Fallbacks correctly using context if needed...
  // In the active layout this uses context incorrectly maybe, but reverting it to how it was:
  const { updatePlanDay } = useApp() || {};
  const [exercises, setExercises] = useState(day.exercises || []);
  const [editingExercise, setEditingExercise] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  function saveExercises(newExercises) {
    setExercises(newExercises);
    if(updatePlanDay) updatePlanDay(plan.id, day.id, { exercises: newExercises });
  }

  function handleMoveUp(idx) {
    if (idx <= 0) return;
    const updated = [...exercises];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    saveExercises(updated);
  }

  function handleMoveDown(idx) {
    if (idx >= exercises.length - 1) return;
    const updated = [...exercises];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    saveExercises(updated);
  }

  function handleDelete(idx) {
    setAlertConfig({
      title: 'Remove Exercise',
      message: 'Remove this exercise from the day?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => saveExercises(exercises.filter((_, i) => i !== idx)) },
      ],
    });
  }

  function handleEditSave(updated) {
    const newExercises = exercises.map(ex =>
      ex.id === updated.id ? updated : ex,
    );
    saveExercises(newExercises);
    setEditingExercise(null);
  }

  function handleAddFromLibrary(libEx) {
    const newEx = {
      id: generateId(),
      name: libEx.name,
      sets: 3,
      reps: '10-12',
      isHeavy: false,
      isWarmup: false,
      muscleGroup: libEx.muscleGroup,
      primaryMuscles: libEx.primaryMuscles || (libEx.primaryMuscle ? [libEx.primaryMuscle] : []),
      exerciseId: libEx.id || libEx.exerciseId || libEx.name,
      notes: libEx.cue || '',
      defaultRestSeconds: 120,
    };
    saveExercises([...exercises, newEx]);
    setShowLibrary(false);
  }

  function handleAddCustom() {
    const newEx = {
      id: generateId(),
      name: 'New Exercise',
      sets: 3,
      reps: '10',
      isHeavy: false,
      isWarmup: false,
      muscleGroup: 'Chest',
      notes: '',
      defaultRestSeconds: 120,
    };
    saveExercises([...exercises, newEx]);
    setEditingExercise(newEx);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.dayHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.dayName}>{day.name}</Text>
          <Text style={styles.exerciseCount}>{exercises.length} exercises</Text>
        </View>

        {exercises.map((ex, idx) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            showControls
            isFirst={idx === 0}
            isLast={idx === exercises.length - 1}
            onPress={() => setEditingExercise(ex)}
            onMoveUp={() => handleMoveUp(idx)}
            onMoveDown={() => handleMoveDown(idx)}
            onDelete={() => handleDelete(idx)}
          />
        ))}

        {exercises.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No exercises yet</Text>
          </View>
        )}

        <View style={styles.addButtonsRow}>
          <TouchableOpacity
            style={styles.addLibBtn}
            onPress={() => setShowLibrary(true)}
          >
            <Text style={styles.addLibBtnText}>+ FROM LIBRARY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addCustomBtn}
            onPress={handleAddCustom}
          >
            <Text style={styles.addCustomBtnText}>+ CUSTOM</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <EditExerciseModal
        visible={!!editingExercise}
        exercise={editingExercise}
        onSave={handleEditSave}
        onClose={() => setEditingExercise(null)}
      />

      <AddFromLibraryModal
        visible={showLibrary}
        onAdd={handleAddFromLibrary}
        onClose={() => setShowLibrary(false)}
      />
      <CustomAlert visible={!!alertConfig} title={alertConfig?.title} message={alertConfig?.message} buttons={alertConfig?.buttons || []} onDismiss={() => setAlertConfig(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.BG },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  dayHeader: { marginBottom: 20 },
  planName: { color: C.SECONDARY, fontSize: 13, letterSpacing: 1, marginBottom: 4 },
  dayName: {
    color: C.TEXT,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed_700Bold',
    letterSpacing: 1,
  },
  exerciseCount: { color: C.SECONDARY, fontSize: 13, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: C.SECONDARY, fontSize: 16 },
  addButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  addLibBtn: {
    flex: 1,
    backgroundColor: C.CARD,
    borderWidth: 1,
    borderColor: C.PUSH,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  addLibBtnText: { color: C.PUSH, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  addCustomBtn: {
    flex: 1,
    backgroundColor: C.CARD,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  addCustomBtnText: { color: C.SECONDARY, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: C.BORDER,
  },
  title: {
    color: C.TEXT,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 16,
    fontFamily: 'BarlowCondensed_700Bold',
  },
  label: { color: C.SECONDARY, fontSize: 11, letterSpacing: 2, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 8,
    padding: 12,
    color: C.TEXT,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  togglesRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 8 },
  toggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  toggleActive: { borderColor: C.PUSH, backgroundColor: '#FF450015' },
  toggleWarmupActive: { borderColor: '#666', backgroundColor: '#66666615' },
  toggleText: { color: C.SECONDARY, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancel: { flex: 1, padding: 14, alignItems: 'center' },
  cancelText: { color: C.SECONDARY, fontSize: 16 },
  save: {
    flex: 1,
    backgroundColor: C.PUSH,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});

const libStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: C.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    height: SCREEN_H * 0.85,
    borderTopWidth: 1,
    borderColor: C.BORDER,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: C.TEXT,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'BarlowCondensed_700Bold',
  },
  closeBtn: { color: C.SECONDARY, fontSize: 20, padding: 4 },
  search: {
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 8,
    padding: 10,
    color: C.TEXT,
    fontSize: 15,
    marginBottom: 10,
  },
  filters: { flexGrow: 0 },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.BORDER,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { borderColor: C.PUSH, backgroundColor: 'rgba(255, 69, 0, 0.1)' },
  filterText: { color: C.SECONDARY, fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  exInfo: { flex: 1 },
  exName: { color: C.TEXT, fontSize: 15, fontWeight: '600' },
  exMeta: { color: C.SECONDARY, fontSize: 12, marginTop: 2 },
  addIcon: { color: C.PUSH, fontSize: 24, fontWeight: '300', paddingLeft: 12 },
});
