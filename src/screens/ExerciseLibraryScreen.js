
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ScrollView,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getExerciseIndex, deleteCustomExercise } from '../services/ExerciseLibraryService';
import {
  buildFilterChipOptions,
  getExerciseFilterSummary,
  matchesExerciseFilter,
} from '../utils/exerciseFilters';

const ROW_HEIGHT = 75; // paddingV 16+16 + name ~22 + cue ~18 + mt2 + border1

export default function ExerciseLibraryScreen({ navigation }) {
  const colors = useTheme();
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [cat, setCat] = useState('All');
  const [alertConfig, setAlertConfig] = useState(null);

  useFocusEffect(
    useCallback(() => {
      getExerciseIndex().then(idx => {
        if (idx) setExercises(idx);
      });
    }, [])
  );

  const toTitle = s => s ? s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase() : s;

  const muscles = useMemo(
    () => buildFilterChipOptions(exercises, { includeCategory: false, includeEquipment: false }),
    [exercises]
  );

  const categories = useMemo(() => {
    const map = new Map();
    exercises.forEach(ex => { if (ex.category) { const k = ex.category.trim().toLowerCase(); if (!map.has(k)) map.set(k, toTitle(ex.category)); } });
    return [...map.values()].sort();
  }, [exercises]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return exercises.filter(ex => {
      const muscleMatch = matchesExerciseFilter(ex, muscle, { includeCategory: false, includeEquipment: false });
      const catMatch = cat === 'All' || (ex.category && ex.category.trim().toLowerCase() === cat.trim().toLowerCase());
      const aliasText = Array.isArray(ex.aliases) ? ex.aliases.join(' ').toLowerCase() : '';
      return muscleMatch && catMatch && (!q || ex.name.toLowerCase().includes(q) || aliasText.includes(q));
    });
  }, [exercises, muscle, cat, search]);

  const onLongPressCustom = (ex) => {
    setAlertConfig({
      title: ex.name,
      message: '',
      buttons: [
        { text: 'Edit', style: 'default', onPress: () => navigation.navigate('CreateExercise', { exercise: ex }) },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            setAlertConfig({
              title: 'Delete exercise?',
              message: ex.name,
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete', style: 'destructive', onPress: async () => {
                    const newIndex = await deleteCustomExercise(ex.id);
                    setExercises(newIndex || []);
                  },
                },
              ],
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const renderItem = useCallback(({ item: ex }) => (
    <TouchableOpacity
      style={[s.row, { borderBottomColor: colors.faint }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('ExerciseProgress', { exerciseName: ex.name })}
      onLongPress={() => ex.isCustom && onLongPressCustom(ex)}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
          {ex.isCustom && (
            <View style={[s.customBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
              <Text style={[s.customBadgeText, { color: colors.accent }]}>CUSTOM</Text>
            </View>
          )}
        </View>
        <Text style={[s.sub, { color: colors.muted }]} numberOfLines={1}>
          {getExerciseFilterSummary(ex).join(', ') || '—'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {ex.equipment ? (
          <View style={[s.tag, { backgroundColor: colors.faint }]}>
            <Text style={[s.tagText, { color: colors.muted }]}>{ex.equipment}</Text>
          </View>
        ) : null}
        {ex.level ? (
          <View style={[s.tag, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
            <Text style={[s.tagText, { color: colors.accent }]}>{ex.level}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  ), [colors]);

  const FilterChip = ({ label, active, onPress }) => (
    <TouchableOpacity
      style={[s.chip, { borderColor: active ? colors.accent : colors.faint, backgroundColor: active ? colors.accentSoft : 'transparent' }]}
      onPress={onPress}
    >
      <Text style={[s.chipText, { color: active ? colors.accent : colors.muted }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.faint }]}>
        <Ionicons name="search-outline" size={16} color={colors.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={[s.input, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises..."
          placeholderTextColor={colors.muted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter */}
      <View style={[s.filterRow, { borderBottomColor: colors.faint }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: 'center' }}>
          <FilterChip label="All" active={cat === 'All'} onPress={() => setCat('All')} />
          {categories.map(c => <FilterChip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}
        </ScrollView>
      </View>

      {/* Muscle filter */}
      <View style={[s.filterRow, { borderBottomColor: colors.faint }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: 'center' }}>
          <FilterChip label="All" active={muscle === 'All'} onPress={() => setMuscle('All')} />
          {muscles.map(m => <FilterChip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />)}
        </ScrollView>
      </View>

      <Text style={[s.count, { color: colors.muted }]}>{filtered.length} exercises</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        windowSize={10}
        maxToRenderPerBatch={15}
        removeClippedSubviews={true}
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: 80 }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: colors.accent }]}
        onPress={() => navigation.navigate('CreateExercise')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <CustomAlert visible={!!alertConfig} title={alertConfig?.title} message={alertConfig?.message} buttons={alertConfig?.buttons || []} onDismiss={() => setAlertConfig(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  input: { flex: 1, fontSize: 16, paddingVertical: 14 },
  filterRow: { paddingVertical: 10, borderBottomWidth: 1, height: 50 },
  chip: { height: 32, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 16 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  count: { fontSize: 10, letterSpacing: 3, padding: 12, paddingHorizontal: 16 },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, alignItems: 'center', height: ROW_HEIGHT },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  sub: { fontSize: 12, marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: '600' },
  customBadge: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderRadius: 2 },
  customBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
