
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { epley } from '../utils/oneRM';

const WorkoutContext = createContext();

const initialState = {
  inputs: {},           // { [exIndex]: { weight: string, reps: string } }
  setLog: {},           // { [exIndex]: [{ id, weight, reps, type, rpe, rir, note, orm }] }
  ghostData: {},        // { [exIndex]: { sets: [...], date } } — read-only
  exerciseNotes: {},    // { [exIndex]: string }
  supersetGroups: {},   // { [exIndex]: 'A'|'B'|'C'|null } — Phase 2b
  restTimer: {
    active: false,
    endTime: null,      // ms timestamp
    total: 0,           // original duration in seconds
    paused: false,
    pausedAt: null,     // ms timestamp when paused
    triggerExIndex: null,
  },
  swappedExercises: {}, // { [exIndex]: exerciseObject } — Phase 2b
  pbNotif: null,        // string | null
  copiedPrevious: false,
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_INPUT': {
      const { exIndex, weight, reps } = action;
      const prev = state.inputs[exIndex] || { weight: '', reps: '' };
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [exIndex]: {
            weight: weight !== undefined ? weight : prev.weight,
            reps: reps !== undefined ? reps : prev.reps,
          },
        },
      };
    }

    case 'LOG_SET': {
      const { exIndex, set } = action;
      const orm = set.weight > 0 && set.reps > 0 ? epley(set.weight, set.reps) : 0;
      const newSet = { id: genId(), orm, type: 'normal', rpe: null, rir: null, note: null, ...set };
      const existing = state.setLog[exIndex] || [];
      return {
        ...state,
        setLog: { ...state.setLog, [exIndex]: [...existing, newSet] },
      };
    }

    case 'SET_TYPE': {
      const { exIndex, setIndex, type } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      sets[setIndex] = { ...sets[setIndex], type };
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'SET_NOTE': {
      const { exIndex, setIndex, note } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      sets[setIndex] = { ...sets[setIndex], note };
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'SET_RPE': {
      const { exIndex, setIndex, rpe } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      sets[setIndex] = { ...sets[setIndex], rpe };
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'SET_RIR': {
      const { exIndex, setIndex, rir } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      sets[setIndex] = { ...sets[setIndex], rir };
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'UPDATE_SET': {
      const { exIndex, setIndex, weight, reps } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      const current = sets[setIndex];
      const nextWeight = Number.isFinite(Number(weight)) ? Number(weight) : Number(current.weight || 0);
      const nextReps = Number.isFinite(Number(reps)) ? Number(reps) : Number(current.reps || 0);
      const orm = nextWeight > 0 && nextReps > 0 ? epley(nextWeight, nextReps) : 0;
      sets[setIndex] = { ...current, weight: nextWeight, reps: nextReps, orm };
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'DELETE_SET': {
      const { exIndex, setIndex } = action;
      const sets = [...(state.setLog[exIndex] || [])];
      if (!sets[setIndex]) return state;
      sets.splice(setIndex, 1);
      return { ...state, setLog: { ...state.setLog, [exIndex]: sets } };
    }

    case 'LOAD_GHOST':
      return { ...state, ghostData: action.ghostData };

    case 'SET_EXERCISE_NOTE': {
      const { exIndex, note } = action;
      return { ...state, exerciseNotes: { ...state.exerciseNotes, [exIndex]: note } };
    }

    case 'ASSIGN_SUPERSET': {
      const { exIndex, group } = action;
      return { ...state, supersetGroups: { ...state.supersetGroups, [exIndex]: group } };
    }

    case 'START_REST': {
      const { endTime, total, triggerExIndex } = action;
      return {
        ...state,
        restTimer: { active: true, endTime, total, paused: false, pausedAt: null, triggerExIndex },
      };
    }

    case 'PAUSE_REST': {
      if (!state.restTimer.active || state.restTimer.paused) return state;
      return {
        ...state,
        restTimer: { ...state.restTimer, paused: true, pausedAt: action.pausedAt },
      };
    }

    case 'RESUME_REST': {
      if (!state.restTimer.paused) return state;
      return {
        ...state,
        restTimer: { ...state.restTimer, paused: false, pausedAt: null, endTime: action.newEndTime },
      };
    }

    case 'SKIP_REST':
      return {
        ...state,
        restTimer: { ...initialState.restTimer },
      };

    case 'ADD_30S': {
      if (!state.restTimer.active) return state;
      return {
        ...state,
        restTimer: {
          ...state.restTimer,
          endTime: state.restTimer.paused
            ? state.restTimer.endTime  // extend happens on resume side when paused
            : (state.restTimer.endTime || Date.now()) + 30000,
          total: state.restTimer.total + 30,
          // if paused, also extend the pausedAt-relative remaining by 30s via endTime shift
          ...(state.restTimer.paused ? { endTime: (state.restTimer.endTime || Date.now()) + 30000 } : {}),
        },
      };
    }

    case 'QUICK_ADD_SET': {
      const { exIndex } = action;
      const lastSet = (state.setLog[exIndex] || []).slice(-1)[0];
      if (!lastSet) return state;
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [exIndex]: { weight: String(lastSet.weight), reps: String(lastSet.reps) },
        },
      };
    }

    case 'SWAP_EXERCISE': {
      const { exIndex, exercise } = action;
      return { ...state, swappedExercises: { ...state.swappedExercises, [exIndex]: exercise } };
    }

    case 'SET_PB_NOTIF':
      return { ...state, pbNotif: action.message };

    case 'INSERT_WARMUPS': {
      const { exIndex, warmupSets } = action;
      const existing = state.setLog[exIndex] || [];
      const workingSets = existing.filter((setItem) => (setItem?.type || 'normal') !== 'warmup');
      return {
        ...state,
        setLog: { ...state.setLog, [exIndex]: [...warmupSets, ...workingSets] },
      };
    }

    case 'UPDATE_GHOST': {
      const { exIndex, ghost } = action;
      return {
        ...state,
        ghostData: { ...state.ghostData, [exIndex]: ghost },
      };
    }

    case 'COPY_PREVIOUS': {
      // Pre-fill inputs from ghost data
      const newInputs = { ...state.inputs };
      Object.entries(state.ghostData).forEach(([idx, ghost]) => {
        const firstSet = ghost.sets?.[0];
        if (firstSet) {
          newInputs[idx] = {
            weight: firstSet.weight > 0 ? String(firstSet.weight) : '',
            reps: firstSet.reps > 0 ? String(firstSet.reps) : '',
          };
        }
      });
      return { ...state, inputs: newInputs, copiedPrevious: true };
    }

    case 'HYDRATE_STATE': {
      const payload = action.payload || {};
      return {
        ...initialState,
        ...payload,
        ghostData: state.ghostData,
        pbNotif: null,
      };
    }

    default:
      return state;
  }
}

export function WorkoutProvider({ children, exercises }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!exercises || exercises.length === 0) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@ironlog/lastPerformance');
        const lastPerf = raw ? JSON.parse(raw) : {};
        const ghostData = {};
        exercises.forEach((ex, i) => {
          const id = ex.exerciseId || ex.name;
          if (lastPerf[id]) ghostData[i] = lastPerf[id];
        });
        dispatch({ type: 'LOAD_GHOST', ghostData });
      } catch (_) {}
    })();
  }, []);

  return (
    <WorkoutContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  return useContext(WorkoutContext);
}
