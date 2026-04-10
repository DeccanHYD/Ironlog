import { AppState, Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

const HAPTIC_EVENTS = {
  selection: {
    kind: 'selection',
    minGapMs: 28,
    priority: 1,
    assistMs: 18,
    androidPattern: [0, 18, 16, 12],
  },
  lightConfirm: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Light,
    minGapMs: 45,
    priority: 2,
    assistMs: 22,
    androidPattern: [0, 22, 18, 16],
  },
  countdownLightest: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Light,
    minGapMs: 110,
    priority: 2,
    assistMs: 12,
    androidPattern: [0, 10],
  },
  countdownLight: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Light,
    minGapMs: 120,
    priority: 2,
    assistMs: 16,
    androidPattern: [0, 14],
  },
  countdownMedium: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Medium,
    minGapMs: 135,
    priority: 3,
    assistMs: 20,
    androidPattern: [0, 20],
  },
  countdownHigh: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Heavy,
    minGapMs: 150,
    priority: 4,
    assistMs: 24,
    androidPattern: [0, 24],
  },
  countdownBuzz: {
    kind: 'sequence',
    sequence: [
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 0 },
      { kind: 'selection', delayMs: 45 },
    ],
    fallbackPattern: [0, 24, 20, 18],
    minGapMs: 220,
    priority: 5,
    assistMs: 30,
    androidPattern: [0, 18, 16, 30],
  },
  mediumConfirm: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Medium,
    minGapMs: 70,
    priority: 3,
    assistMs: 28,
    androidPattern: [0, 26, 22, 20],
  },
  success: {
    kind: 'notification',
    type: Haptics.NotificationFeedbackType.Success,
    minGapMs: 130,
    priority: 4,
    assistMs: 24,
    androidPattern: [0, 22, 28, 18, 34, 26],
  },
  milestoneSuccess: {
    kind: 'sequence',
    sequence: [
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delayMs: 0 },
      { kind: 'notification', type: Haptics.NotificationFeedbackType.Success, delayMs: 55 },
    ],
    fallbackPattern: [0, 20, 35, 35],
    minGapMs: 500,
    priority: 7,
    assistMs: 38,
    androidPattern: [0, 24, 34, 22, 42, 34],
  },
  warning: {
    kind: 'notification',
    type: Haptics.NotificationFeedbackType.Warning,
    minGapMs: 180,
    priority: 4,
    assistMs: 24,
    androidPattern: [0, 22, 34, 18, 44, 20],
  },
  error: {
    kind: 'notification',
    type: Haptics.NotificationFeedbackType.Error,
    fallbackPattern: [0, 40, 50, 65],
    minGapMs: 240,
    priority: 5,
    assistMs: 32,
    androidPattern: [0, 26, 38, 24, 52, 28],
  },
  timerDone: {
    kind: 'sequence',
    sequence: [
      { kind: 'notification', type: Haptics.NotificationFeedbackType.Warning, delayMs: 0 },
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 70 },
    ],
    fallbackPattern: [0, 60, 70, 100],
    minGapMs: 800,
    priority: 7,
    assistMs: 44,
    androidPattern: [0, 28, 40, 24, 56, 42],
  },
  setLogged: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Light,
    minGapMs: 90,
    priority: 3,
    assistMs: 20,
    androidPattern: [0, 24, 24, 18],
  },
  setCompleted: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Medium,
    minGapMs: 130,
    priority: 4,
    assistMs: 28,
    androidPattern: [0, 28, 28, 22],
  },
  workoutCompleted: {
    kind: 'sequence',
    sequence: [
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 0 },
      { kind: 'notification', type: Haptics.NotificationFeedbackType.Success, delayMs: 70 },
    ],
    fallbackPattern: [0, 25, 40, 40],
    minGapMs: 900,
    priority: 8,
    assistMs: 46,
    androidPattern: [0, 28, 38, 24, 52, 40],
  },
  prUnlocked: {
    kind: 'sequence',
    sequence: [
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 0 },
      { kind: 'notification', type: Haptics.NotificationFeedbackType.Success, delayMs: 60 },
    ],
    fallbackPattern: [0, 20, 30, 35],
    minGapMs: 650,
    priority: 7,
    assistMs: 42,
    androidPattern: [0, 24, 30, 20, 46, 34],
  },
  restoreSucceeded: {
    kind: 'sequence',
    sequence: [
      { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delayMs: 0 },
      { kind: 'notification', type: Haptics.NotificationFeedbackType.Success, delayMs: 45 },
    ],
    minGapMs: 400,
    priority: 6,
    assistMs: 34,
    androidPattern: [0, 22, 28, 18, 38, 28],
  },
  backupSucceeded: {
    kind: 'notification',
    type: Haptics.NotificationFeedbackType.Success,
    minGapMs: 300,
    priority: 6,
    assistMs: 30,
    androidPattern: [0, 20, 26, 18, 38, 24],
  },
  destructiveAction: {
    kind: 'impact',
    style: Haptics.ImpactFeedbackStyle.Heavy,
    minGapMs: 220,
    priority: 5,
    assistMs: 34,
    androidPattern: [0, 34, 24, 20],
  },
  invalidAction: {
    kind: 'notification',
    type: Haptics.NotificationFeedbackType.Warning,
    fallbackPattern: [0, 35],
    minGapMs: 180,
    priority: 4,
    assistMs: 22,
    androidPattern: [0, 18, 38, 18, 46, 18],
  },
};

const EVENT_LAST_FIRED = new Map();
const GLOBAL_MIN_GAP_MS = 14;
const AVAILABLE_TRUE_TTL_MS = 60 * 60 * 1000;
const AVAILABLE_FALSE_RETRY_MS = 15 * 1000;

let HAPTICS_ENABLED = true;
let LAST_GLOBAL_TS = 0;
let LAST_GLOBAL_PRIORITY = 0;
let AVAILABLE = null;
let AVAILABILITY_PROMISE = null;
let AVAILABILITY_TS = 0;
let WATCHER_ATTACHED = false;

function ensureAvailabilityWatcher() {
  if (WATCHER_ATTACHED) return;
  WATCHER_ATTACHED = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // Re-check after app resumes in case OS-level haptics state changed.
      AVAILABLE = null;
      AVAILABILITY_TS = 0;
    }
  });
}

function wait(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkAvailability() {
  ensureAvailabilityWatcher();
  const now = Date.now();
  if (AVAILABLE !== null) {
    const ttl = AVAILABLE ? AVAILABLE_TRUE_TTL_MS : AVAILABLE_FALSE_RETRY_MS;
    if (now - AVAILABILITY_TS < ttl) return AVAILABLE;
  }
  if (AVAILABILITY_PROMISE) return AVAILABILITY_PROMISE;
  AVAILABILITY_PROMISE = Haptics.isAvailableAsync()
    .then((value) => {
      AVAILABLE = !!value;
      AVAILABILITY_TS = Date.now();
      return AVAILABLE;
    })
    .catch(() => {
      AVAILABLE = false;
      AVAILABILITY_TS = Date.now();
      return false;
    })
    .finally(() => {
      AVAILABILITY_PROMISE = null;
    });
  return AVAILABILITY_PROMISE;
}

function shouldDropForSpam(eventName, config, force) {
  if (force) return false;
  const now = Date.now();
  const minGapMs = config.minGapMs ?? 60;
  const eventLast = EVENT_LAST_FIRED.get(eventName) ?? 0;
  if (now - eventLast < minGapMs) return true;
  if (now - LAST_GLOBAL_TS < GLOBAL_MIN_GAP_MS && (config.priority ?? 1) <= LAST_GLOBAL_PRIORITY) return true;

  EVENT_LAST_FIRED.set(eventName, now);
  LAST_GLOBAL_TS = now;
  LAST_GLOBAL_PRIORITY = config.priority ?? 1;
  return false;
}

function getAndroidPrimitive(step) {
  if (!Haptics.AndroidHaptics) return null;
  if (step.kind === 'selection') return Haptics.AndroidHaptics.Segment_Tick || Haptics.AndroidHaptics.Virtual_Key || null;
  if (step.kind === 'impact') {
    if (step.style === Haptics.ImpactFeedbackStyle.Heavy) return Haptics.AndroidHaptics.Long_Press || Haptics.AndroidHaptics.Confirm || null;
    if (step.style === Haptics.ImpactFeedbackStyle.Medium) return Haptics.AndroidHaptics.Context_Click || Haptics.AndroidHaptics.Virtual_Key || null;
    return Haptics.AndroidHaptics.Virtual_Key || Haptics.AndroidHaptics.Segment_Tick || null;
  }
  if (step.kind === 'notification') {
    if (step.type === Haptics.NotificationFeedbackType.Error) return Haptics.AndroidHaptics.Reject || null;
    if (step.type === Haptics.NotificationFeedbackType.Warning) return Haptics.AndroidHaptics.Long_Press || Haptics.AndroidHaptics.Reject || null;
    return Haptics.AndroidHaptics.Confirm || null;
  }
  return null;
}

async function runPrimitive(step) {
  if (!step) return;
  if (Platform.OS === 'android' && typeof Haptics.performAndroidHapticsAsync === 'function') {
    const androidPrimitive = getAndroidPrimitive(step);
    if (androidPrimitive) {
      await Haptics.performAndroidHapticsAsync(androidPrimitive);
      return;
    }
  }
  if (step.kind === 'selection') {
    await Haptics.selectionAsync();
    return;
  }
  if (step.kind === 'impact') {
    await Haptics.impactAsync(step.style ?? Haptics.ImpactFeedbackStyle.Light);
    return;
  }
  if (step.kind === 'notification') {
    await Haptics.notificationAsync(step.type ?? Haptics.NotificationFeedbackType.Success);
  }
}

function triggerPrimitiveInBackground(config) {
  if (Platform.OS !== 'android') return;
  if (!config || config.kind === 'sequence') return;
  runPrimitive(config).catch(() => {});
}

function runFallbackPattern(config) {
  const defaultPattern =
    config?.kind === 'selection' ? [0, 8] :
    config?.kind === 'impact' ? [0, 12] :
    config?.kind === 'notification' ? [0, 20, 30, 20] :
    [0, 10];
  const pattern = config?.fallbackPattern || defaultPattern;
  try {
    Vibration.vibrate(pattern);
  } catch (_) {
    // Ignore unsupported vibration behavior on some devices.
  }
}

function runAndroidAssist(config) {
  if (Platform.OS !== 'android') return;
  const assistPattern =
    config?.androidPattern ||
    config?.fallbackPattern ||
    (config?.kind === 'selection' ? [0, 18] :
      config?.kind === 'impact' ? [0, 24] :
      config?.kind === 'notification' ? [0, 20, 34, 24] :
      config?.kind === 'sequence' ? [0, 24, 40, 32] :
      [0, 20]);
  try {
    Vibration.vibrate(assistPattern, false);
  } catch (_) {
    // Ignore unsupported vibration behavior on some devices.
  }
}

export function setHapticsEnabled(enabled) {
  HAPTICS_ENABLED = enabled !== false;
}

export function resetHapticsEngine() {
  EVENT_LAST_FIRED.clear();
  LAST_GLOBAL_TS = 0;
  LAST_GLOBAL_PRIORITY = 0;
}

export async function triggerHaptic(eventName, options = {}) {
  const config = HAPTIC_EVENTS[eventName] || HAPTIC_EVENTS.selection;
  const enabled = options.enabled ?? HAPTICS_ENABLED;
  if (!enabled) return false;
  if (shouldDropForSpam(eventName, config, options.force)) return false;

  if (Platform.OS === 'android' && options.androidAssist !== false) {
    // Samsung devices in particular can ignore or stall the Expo primitive path,
    // while direct vibration remains reliable. Use direct patterns as the primary
    // tactile source on Android, then optionally try the native primitive behind it.
    runAndroidAssist(config);
    triggerPrimitiveInBackground(config);
    return true;
  }

  const available = await checkAvailability();
  if (!available) {
    runFallbackPattern(config);
    return false;
  }

  try {
    if (config.kind === 'sequence') {
      for (const step of config.sequence || []) {
        await wait(step.delayMs);
        await runPrimitive(step);
      }
      return true;
    }

    await runPrimitive(config);
    return true;
  } catch (_) {
    runFallbackPattern(config);
    return false;
  }
}

export { HAPTIC_EVENTS };
