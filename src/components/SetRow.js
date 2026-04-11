
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { triggerHaptic } from '../services/hapticsEngine';
import { formatWeightFromKg } from '../utils/weightUnits';

const SET_TYPES = ['normal', 'warmup', 'drop', 'failure', 'amrap'];

const TYPE_LABEL = {
  normal: 'W',
  warmup: 'WU',
  drop: 'DS',
  failure: 'F',
  amrap: 'AMRAP',
};

const TYPE_COLOR = {
  normal: '#FF4500',
  warmup: '#0080FF',
  drop: '#A020F0',
  failure: '#CC2222',
  amrap: '#FFD700',
};

function SetRow({ set, setIndex, exIndex, dispatch, effortTracking, hapticFeedback, weightUnit = 'kg' }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editWeight, setEditWeight] = useState(String(set.weight ?? ''));
  const [editReps, setEditReps] = useState(String(set.reps ?? ''));

  const cycleType = useCallback(() => {
    const next = SET_TYPES[(SET_TYPES.indexOf(set.type || 'normal') + 1) % SET_TYPES.length];
    triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
    dispatch({ type: 'SET_TYPE', exIndex, setIndex, type: next });
  }, [set.type, exIndex, setIndex, dispatch, hapticFeedback]);

  const onNoteChange = useCallback((text) => {
    dispatch({ type: 'SET_NOTE', exIndex, setIndex, note: text });
  }, [exIndex, setIndex, dispatch]);

  const onRpeFocus = useCallback(() => {
    triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
  }, [hapticFeedback]);

  const onRpeChange = useCallback((text) => {
    const val = parseFloat(text);
    dispatch({ type: 'SET_RPE', exIndex, setIndex, rpe: isNaN(val) ? null : val });
  }, [exIndex, setIndex, dispatch]);

  const onRirChange = useCallback((text) => {
    const val = parseInt(text);
    dispatch({ type: 'SET_RIR', exIndex, setIndex, rir: isNaN(val) ? null : val });
  }, [exIndex, setIndex, dispatch]);

  const toggleEdit = useCallback(() => {
    setEditWeight(String(set.weight ?? ''));
    setEditReps(String(set.reps ?? ''));
    setEditOpen((prev) => !prev);
    triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
  }, [set.weight, set.reps, hapticFeedback]);

  const saveEdit = useCallback(() => {
    const weight = parseFloat(editWeight);
    const reps = parseInt(editReps, 10);
    dispatch({
      type: 'UPDATE_SET',
      exIndex,
      setIndex,
      weight: Number.isFinite(weight) ? weight : 0,
      reps: Number.isFinite(reps) ? reps : 0,
    });
    setEditOpen(false);
    triggerHaptic('lightConfirm', { enabled: hapticFeedback }).catch(() => {});
  }, [dispatch, exIndex, setIndex, editWeight, editReps, hapticFeedback]);

  const deleteSet = useCallback(() => {
    dispatch({ type: 'DELETE_SET', exIndex, setIndex });
    triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
  }, [dispatch, exIndex, setIndex, hapticFeedback]);

  const typeKey = set.type || 'normal';
  const color = TYPE_COLOR[typeKey] || TYPE_COLOR.normal;

  return (
    <View style={s.row}>
      <View style={s.left}>
        <Text style={s.setNum}>SET {setIndex + 1}</Text>
        <TouchableOpacity
          onPress={cycleType}
          style={[s.typeBadge, { borderColor: color + '66', backgroundColor: color + '18' }]}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[s.typeText, { color }]}>{TYPE_LABEL[typeKey] || typeKey.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.middle}>
        <Text style={s.valText}>
          {set.weight > 0 ? formatWeightFromKg(set.weight, weightUnit) : 'BW'} × {set.reps}
        </Text>
        {set.orm > 0 ? <Text style={s.ormText}>~{formatWeightFromKg(set.orm, weightUnit)} 1RM</Text> : null}
      </View>

      <View style={s.right}>
        {effortTracking === 'rpe' || effortTracking === 'both' ? (
          <View style={s.effortGroup}>
            <Text style={s.effortLabel}>RPE</Text>
            <TextInput
              style={s.effortInput}
              value={set.rpe != null ? String(set.rpe) : ''}
              onChangeText={onRpeChange}
              onFocus={onRpeFocus}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="#2a2a2a"
              maxLength={4}
            />
          </View>
        ) : null}

        {effortTracking === 'rir' || effortTracking === 'both' ? (
          <View style={s.effortGroup}>
            <Text style={s.effortLabel}>RIR</Text>
            <TextInput
              style={s.effortInput}
              value={set.rir != null ? String(set.rir) : ''}
              onChangeText={onRirChange}
              onFocus={onRpeFocus}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor="#2a2a2a"
              maxLength={2}
            />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => {
            triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
            setNoteOpen(o => !o);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbox-ellipses-outline" size={14} style={[s.noteIcon, set.note ? s.noteIconActive : null]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="create-outline" size={14} style={[s.noteIcon, editOpen ? s.noteIconActive : null]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={deleteSet} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={14} color="#993333" />
        </TouchableOpacity>
      </View>

      {editOpen ? (
        <View style={s.editRow}>
          <View style={s.editGroup}>
            <Text style={s.editLabel}>{String(weightUnit || 'kg').toUpperCase()}</Text>
            <TextInput
              style={s.editInput}
              value={editWeight}
              onChangeText={setEditWeight}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#2a2a2a"
            />
          </View>
          <View style={s.editGroup}>
            <Text style={s.editLabel}>REPS</Text>
            <TextInput
              style={s.editInput}
              value={editReps}
              onChangeText={setEditReps}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#2a2a2a"
            />
          </View>
          <TouchableOpacity style={s.editSaveBtn} onPress={saveEdit}>
            <Text style={s.editSaveText}>SAVE</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {noteOpen ? (
        <TextInput
          style={s.noteInput}
          value={set.note || ''}
          onChangeText={onNoteChange}
          placeholder="Set note..."
          placeholderTextColor="#2a2a2a"
          multiline
          autoFocus
        />
      ) : set.note ? (
        <TouchableOpacity onPress={() => {
          triggerHaptic('selection', { enabled: hapticFeedback }).catch(() => {});
          setNoteOpen(true);
        }}>
          <Text style={s.notePeek} numberOfLines={1}>{set.note}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default React.memo(SetRow);

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingVertical: 5,
    gap: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 78,
  },
  setNum: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#333',
    width: 36,
  },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  middle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f0f0f0',
  },
  ormText: {
    fontSize: 11,
    color: '#444',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  effortGroup: {
    alignItems: 'center',
  },
  effortLabel: {
    fontSize: 7,
    letterSpacing: 1,
    color: '#333',
    marginBottom: 1,
  },
  effortInput: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    textAlign: 'center',
    width: 36,
    paddingVertical: 2,
  },
  noteIcon: {
    fontSize: 14,
    color: '#2a2a2a',
  },
  noteIconActive: {
    color: '#FF4500',
  },
  noteInput: {
    width: '100%',
    marginTop: 4,
    fontSize: 12,
    color: '#888',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 6,
    minHeight: 32,
  },
  notePeek: {
    width: '100%',
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  editRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  editGroup: {
    flex: 1,
  },
  editLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: '#3a3a3a',
    marginBottom: 3,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  editSaveBtn: {
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editSaveText: {
    color: '#FF4500',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
});
