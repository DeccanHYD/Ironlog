import * as Notifications from 'expo-notifications';

const MAX_DECISION_LOG = 64;
const DEFAULT_TOPICS = {
  TRAINING: 'training',
  RECOVERY: 'recovery',
  STREAK: 'streak',
  BODYWEIGHT: 'bodyweight',
  MILESTONE: 'milestone',
  BACKUP: 'backup',
};

const POLICY_PROFILES = {
  conservative: {
    maxPerDay: 1,
    maxPerWeek: 2,
    baseCooldownHours: 24,
    topicCooldownHours: {
      training: 18,
      recovery: 24,
      streak: 20,
      bodyweight: 24,
      milestone: 12,
      backup: 48,
    },
    deliveryJitterMinutes: 10,
  },
  balanced: {
    maxPerDay: 1,
    maxPerWeek: 3,
    baseCooldownHours: 12,
    topicCooldownHours: {
      training: 12,
      recovery: 16,
      streak: 16,
      bodyweight: 18,
      milestone: 8,
      backup: 36,
    },
    deliveryJitterMinutes: 12,
  },
  aggressive: {
    maxPerDay: 1,
    maxPerWeek: 5,
    baseCooldownHours: 8,
    topicCooldownHours: {
      training: 8,
      recovery: 10,
      streak: 12,
      bodyweight: 12,
      milestone: 6,
      backup: 24,
    },
    deliveryJitterMinutes: 8,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inQuietHours(minuteOfDay, startMinute, endMinute) {
  const minute = clamp(Math.round(Number(minuteOfDay || 0)), 0, 1439);
  const start = clamp(Math.round(Number(startMinute || 0)), 0, 1439);
  const end = clamp(Math.round(Number(endMinute || 0)), 0, 1439);
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toMinuteOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getQuietBoundaryMinutes(settings = {}) {
  const startMinutes = Number(settings?.quietHoursStartMinutes);
  const endMinutes = Number(settings?.quietHoursEndMinutes);
  const startHour = Number(settings?.quietHoursStart);
  const endHour = Number(settings?.quietHoursEnd);
  return {
    start: Number.isFinite(startMinutes) ? clamp(Math.round(startMinutes), 0, 1439) : clamp(Math.round((Number.isFinite(startHour) ? startHour : 22) * 60), 0, 1439),
    end: Number.isFinite(endMinutes) ? clamp(Math.round(endMinutes), 0, 1439) : clamp(Math.round((Number.isFinite(endHour) ? endHour : 8) * 60), 0, 1439),
  };
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inferUsualWorkoutMinute(history = []) {
  const minutes = (history || [])
    .slice(0, 16)
    .map((session) => new Date(session?.date || 0))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map(toMinuteOfDay);
  const med = median(minutes);
  if (!Number.isFinite(med)) return 18 * 60;
  return clamp(Math.round(med), 6 * 60, 22 * 60 + 30);
}

function getPlanDaysPerWeek(activePlan = null) {
  const planDays = Array.isArray(activePlan?.days) ? activePlan.days.length : 0;
  return clamp(planDays || Number(activePlan?.daysPerWeek || 3) || 3, 1, 7);
}

function getProfile(settings = {}) {
  const key = String(settings?.notificationProfile || 'balanced').toLowerCase();
  return POLICY_PROFILES[key] || POLICY_PROFILES.balanced;
}

function readOptionalPositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function getWeeklyCap(settings = {}, activePlan = null, profile = getProfile(settings)) {
  const override = readOptionalPositiveNumber(settings?.maxNotificationsPerWeekOverride);
  if (override != null) return clamp(override, 1, 7);
  const profileCap = clamp(Number(profile?.maxPerWeek || 3), 1, 7);
  if (settings?.weeklyCapMode === 'fixed_7') return Math.min(profileCap, 7);
  return Math.min(profileCap, getPlanDaysPerWeek(activePlan));
}

function getDecisionLog(settings = {}) {
  return Array.isArray(settings?.decisionLog) ? settings.decisionLog : [];
}

function getCandidateTopic(candidate = {}) {
  if (candidate.topic) return candidate.topic;
  const key = String(candidate.key || '');
  if (key.includes(':')) return key.split(':')[0];
  if (key.includes('_')) return key.split('_')[0];
  return key || DEFAULT_TOPICS.TRAINING;
}

function isCooldownActive(settings = {}, key = '', profile = getProfile(settings)) {
  const lastLog = getDecisionLog(settings).find((entry) => entry?.outcome === 'sent' && entry?.key === key)
    || (settings?.lastDecisionAt ? { at: settings.lastDecisionAt } : null);
  if (!lastLog?.at) return false;
  const at = new Date(lastLog.at).getTime();
  if (!Number.isFinite(at)) return false;
  const defaultHours = Number(settings?.cooldownHours || profile.baseCooldownHours || 12);
  const cooldownMs = defaultHours * 3600000;
  return (Date.now() - at) < cooldownMs;
}

function isTopicCooldownActive(settings = {}, topic = '', profile = getProfile(settings)) {
  const perTopic = settings?.perTopicCooldownHours || {};
  const topicHours = Number(perTopic?.[topic] || profile.topicCooldownHours?.[topic] || profile.baseCooldownHours || 12);
  const lastTopic = getDecisionLog(settings).find((entry) => entry?.outcome === 'sent' && entry?.topic === topic);
  if (!lastTopic?.at) return false;
  const at = new Date(lastTopic.at).getTime();
  if (!Number.isFinite(at)) return false;
  return (Date.now() - at) < (topicHours * 3600000);
}

function countThisWeek(log = []) {
  const start = getWeekStart().getTime();
  return log.filter((entry) => entry?.outcome === 'sent' && new Date(entry?.at || 0).getTime() >= start).length;
}

function countToday(log = []) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return log.filter((entry) => entry?.outcome === 'sent' && new Date(entry?.at || 0).getTime() >= start.getTime()).length;
}

function hasWorkoutToday(history = []) {
  const today = new Date().toISOString().slice(0, 10);
  return (history || []).some((session) => String(session?.date || '').slice(0, 10) === today);
}

function hasBodyweightLogToday(entries = []) {
  const today = new Date().toISOString().slice(0, 10);
  return (entries || []).some((entry) => String(entry?.date || entry?.loggedAt || '').slice(0, 10) === today);
}

function workoutsThisWeek(history = []) {
  const start = getWeekStart().getTime();
  return (history || []).filter((session) => new Date(session?.date || 0).getTime() >= start).length;
}

function daysRemainingThisWeekInclusive(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1 ... Sun=7
  return clamp(8 - day, 1, 7);
}

function getLastWorkoutDate(history = []) {
  const latest = (history || [])
    .map((session) => new Date(session?.date || 0))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return latest || null;
}

function daysBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function shouldNudgeForCadence({ history = [], targetDays = 3, sessionsRemaining = 0 } = {}) {
  const daysLeft = daysRemainingThisWeekInclusive();
  if (sessionsRemaining >= daysLeft) return true; // urgent: need near-daily adherence

  const expectedGapDays = clamp(Math.floor(7 / targetDays), 1, 3);
  const lastWorkout = getLastWorkoutDate(history);
  if (!lastWorkout) return true; // no history yet: allow reminder
  return daysBetween(lastWorkout, new Date()) >= expectedGapDays;
}

function buildNextReminderDate({
  history = [],
  leadMinutes = 90,
} = {}) {
  const now = new Date();
  const usualMinute = inferUsualWorkoutMinute(history);
  const targetMinute = clamp(usualMinute - leadMinutes, 5 * 60, 22 * 60);

  const candidate = new Date(now);
  candidate.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);

  if (candidate.getTime() <= now.getTime() + 15 * 60000) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function buildPlanAwareTrainingCandidate({
  settings = {},
  history = [],
  activePlan = null,
} = {}) {
  if (settings?.trainingReminders === false) return null;
  const targetDays = getPlanDaysPerWeek(activePlan);
  const doneThisWeek = workoutsThisWeek(history);
  if (doneThisWeek >= targetDays) return null;
  if (hasWorkoutToday(history)) return null;
  const sessionsRemaining = targetDays - doneThisWeek;
  if (!shouldNudgeForCadence({ history, targetDays, sessionsRemaining })) return null;

  const leadMinutes = clamp(Number(settings?.reminderLeadMinutes || 90), 60, 120);
  const triggerDate = buildNextReminderDate({ history, leadMinutes });
  const remaining = sessionsRemaining;

  return {
    key: 'train_reminder_plan_aware',
    topic: DEFAULT_TOPICS.TRAINING,
    title: 'Training reminder',
    body: `${remaining} session${remaining > 1 ? 's' : ''} left this week. Aim to train at your usual time.`,
    score: 100,
    windows: [{ start: 10, end: 21 }],
    triggerDate,
  };
}

function buildBackupHealthCandidate({ settings = {}, backupStatus = {} } = {}) {
  if (settings?.backupAlerts === false) return null;
  if (!backupStatus?.enabled) return null;
  if (!backupStatus?.dirty) return null;
  const lastBackupAt = new Date(backupStatus?.lastBackupAt || 0).getTime();
  const stale = !Number.isFinite(lastBackupAt) || (Date.now() - lastBackupAt) > 3 * 24 * 3600000;
  if (!stale) return null;
  return {
    key: 'backup_integrity',
    topic: DEFAULT_TOPICS.BACKUP,
    title: 'Backup reminder',
    body: 'Your training data has unsynced changes. Run a backup today.',
    score: 58,
    windows: [{ start: 18, end: 21 }],
    triggerDate: new Date(Date.now() + 45 * 60000),
  };
}

function applyDeliveryWindow(triggerDate, windows = [{ start: 10, end: 21 }]) {
  const now = new Date();
  const next = new Date(triggerDate || now);
  const preferred = windows[0] || { start: 10, end: 21 };
  const startHour = clamp(Number(preferred.start || 10), 0, 23);
  const endHour = clamp(Number(preferred.end || 21), 1, 24);

  if (next.getHours() < startHour) {
    next.setHours(startHour, 0, 0, 0);
  } else if (next.getHours() >= endHour) {
    next.setDate(next.getDate() + 1);
    next.setHours(startHour, 0, 0, 0);
  }
  if (next.getTime() <= now.getTime() + 10 * 60000) {
    next.setMinutes(next.getMinutes() + 15);
  }
  return next;
}

function withJitter(triggerDate, jitterMinutes = 12) {
  const jitter = clamp(Math.round(Number(jitterMinutes || 0)), 0, 30);
  if (!jitter) return triggerDate;
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  const next = new Date(triggerDate);
  next.setMinutes(next.getMinutes() + offset);
  return next;
}

function avoidQuietHours(triggerDate, start, end) {
  const next = new Date(triggerDate);
  if (!inQuietHours(toMinuteOfDay(next), start, end)) return next;
  next.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  if (inQuietHours(toMinuteOfDay(next), start, end)) {
    next.setMinutes(next.getMinutes() + 15);
  }
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next;
}

export async function getNotificationPermissionStatus() {
  const perms = await Notifications.getPermissionsAsync();
  const granted = !!(perms.granted || perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
  return {
    granted,
    canAskAgain: perms.canAskAgain !== false,
    status: perms.status || (granted ? 'granted' : 'denied'),
    raw: perms,
  };
}

export async function ensureNotificationPermissions() {
  const perms = await getNotificationPermissionStatus();
  if (perms.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return !!requested.granted;
}

export function buildDefaultNotificationCandidates({
  settings = {},
  workoutsLast7d = 0,
  bodyweightLoggingConsistency = 0,
  recoverySuggestions = [],
  streaks = null,
  newMilestones = [],
  history = [],
  bodyWeightEntries = [],
  backupStatus = {},
  activePlan = null,
} = {}) {
  const items = [];
  const planAware = buildPlanAwareTrainingCandidate({ settings, history, activePlan });
  if (planAware) items.push(planAware);

  if (settings?.milestoneNotifications !== false && newMilestones?.length) {
    items.push({
      key: `milestone:${newMilestones[0].key}`,
      topic: DEFAULT_TOPICS.MILESTONE,
      title: 'Milestone unlocked',
      body: `${newMilestones[0].label} achieved. Keep your momentum going.`,
      score: 95,
      windows: [{ start: 12, end: 20 }],
      triggerDate: new Date(Date.now() + 20 * 60000),
    });
  }
  if (settings?.planAdherenceAlerts !== false && bodyweightLoggingConsistency < 40 && !hasBodyweightLogToday(bodyWeightEntries)) {
    items.push({
      key: 'bw_reminder',
      topic: DEFAULT_TOPICS.BODYWEIGHT,
      title: 'Log body weight',
      body: 'A quick bodyweight entry keeps your trend accurate.',
      score: 40,
      windows: [{ start: 8, end: 11 }],
      triggerDate: new Date(Date.now() + 30 * 60000),
    });
  }
  if (settings?.recoverySuggestions !== false && recoverySuggestions?.length && workoutsLast7d > 0) {
    items.push({
      key: 'recovery_suggestion',
      topic: DEFAULT_TOPICS.RECOVERY,
      title: 'Recovery insight',
      body: recoverySuggestions[0],
      score: 35,
      windows: [{ start: 12, end: 20 }],
      triggerDate: new Date(Date.now() + 35 * 60000),
    });
  }
  if (settings?.trainingReminders !== false && streaks?.training?.current >= 1 && !hasWorkoutToday(history)) {
    items.push({
      key: 'streak_preserve',
      topic: DEFAULT_TOPICS.STREAK,
      title: 'Streak active',
      body: 'One more session this week keeps your streak alive.',
      score: 55,
      windows: [{ start: 10, end: 20 }],
      triggerDate: new Date(Date.now() + 25 * 60000),
    });
  }
  const backupCandidate = buildBackupHealthCandidate({ settings, backupStatus });
  if (backupCandidate) items.push(backupCandidate);

  return items;
}

export function chooseNotificationCandidate({
  settings = {},
  candidates = [],
  activePlan = null,
  alreadyActionedTopics = [],
  alreadyActionedKeys = [],
} = {}) {
  if (!settings?.enabled || !Array.isArray(candidates) || !candidates.length) {
    return { candidate: null, reason: 'disabled_or_no_candidates' };
  }
  const snoozeUntilTs = new Date(settings?.snoozeUntil || 0).getTime();
  if (Number.isFinite(snoozeUntilTs) && snoozeUntilTs > Date.now()) {
    return { candidate: null, reason: 'snoozed' };
  }

  const profile = getProfile(settings);
  const decisionLog = getDecisionLog(settings);
  const dailyOverride = readOptionalPositiveNumber(settings?.maxNotificationsPerDayOverride);
  const dailyCap = clamp(Number(dailyOverride != null ? dailyOverride : profile.maxPerDay), 1, 3);
  if (countToday(decisionLog) >= dailyCap) {
    return { candidate: null, reason: 'daily_cap' };
  }
  const weeklyCap = getWeeklyCap(settings, activePlan, profile);
  if (countThisWeek(decisionLog) >= weeklyCap) {
    return { candidate: null, reason: 'weekly_cap' };
  }

  const actionedTopicsSet = new Set((Array.isArray(alreadyActionedTopics) ? alreadyActionedTopics : []).map((value) => String(value || '').toLowerCase()));
  const actionedKeysSet = new Set((Array.isArray(alreadyActionedKeys) ? alreadyActionedKeys : []).map((value) => String(value || '').toLowerCase()));

  const scored = [...candidates]
    .filter((candidate) => candidate?.key)
    .filter((candidate) => {
      const key = String(candidate?.key || '').toLowerCase();
      const topic = String(getCandidateTopic(candidate) || '').toLowerCase();
      if (actionedKeysSet.has(key)) return false;
      if (actionedTopicsSet.has(topic)) return false;
      return true;
    })
    .filter((candidate) => !isCooldownActive(settings, candidate.key, profile))
    .filter((candidate) => !isTopicCooldownActive(settings, getCandidateTopic(candidate), profile))
    .map((candidate) => {
      const topic = getCandidateTopic(candidate);
      const lastTopic = decisionLog.find((entry) => entry?.outcome === 'sent' && entry?.topic === topic);
      let score = Number(candidate?.score || 0);
      if (lastTopic?.at) {
        const hours = (Date.now() - new Date(lastTopic.at).getTime()) / 3600000;
        if (hours < 48) score -= 18;
      }
      return { ...candidate, topic, score };
    })
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));

  if (!scored.length) {
    if (actionedTopicsSet.size || actionedKeysSet.size) {
      const hadAny = candidates.some((candidate) => candidate?.key);
      const blockedByActioned = hadAny && candidates
        .filter((candidate) => candidate?.key)
        .every((candidate) => {
          const key = String(candidate?.key || '').toLowerCase();
          const topic = String(getCandidateTopic(candidate) || '').toLowerCase();
          return actionedKeysSet.has(key) || actionedTopicsSet.has(topic);
        });
      if (blockedByActioned) return { candidate: null, reason: 'already_actioned' };
    }
    return { candidate: null, reason: 'cooldown_or_topic_gate' };
  }
  return { candidate: scored[0], reason: 'selected' };
}

function appendDecision(settings = {}, entry = {}) {
  const decisionLog = getDecisionLog(settings);
  const merged = [{ at: new Date().toISOString(), ...entry }, ...decisionLog].slice(0, MAX_DECISION_LOG);
  return {
    ...settings,
    decisionLog: merged,
    lastDecisionAt: merged[0]?.at || null,
    lastDecisionKey: merged[0]?.key || null,
    lastScheduledFor: merged[0]?.scheduledFor || settings?.lastScheduledFor || null,
  };
}

function shouldPersistSuppressed(settings = {}, key = '', reason = '') {
  const latest = getDecisionLog(settings)[0];
  if (!latest) return true;
  if (latest.outcome !== 'suppressed') return true;
  if (latest.key !== key || latest.reason !== reason) return true;
  const since = Date.now() - new Date(latest.at || 0).getTime();
  return !Number.isFinite(since) || since > 6 * 3600000;
}

export async function scheduleSmartNotification({
  settings = {},
  updateSettings,
  candidates = [],
  activePlan = null,
  alreadyActionedTopics = [],
  alreadyActionedKeys = [],
} = {}) {
  const profile = getProfile(settings);
  const result = chooseNotificationCandidate({
    settings,
    candidates,
    activePlan,
    alreadyActionedTopics,
    alreadyActionedKeys,
  });
  const chosen = result?.candidate || null;
  if (!chosen) {
    if (typeof updateSettings === 'function' && result?.reason) {
      const key = `suppressed:${result.reason}`;
      if (shouldPersistSuppressed(settings, key, result.reason)) {
        await updateSettings(appendDecision(settings, {
          outcome: 'suppressed',
          key,
          topic: 'system',
          reason: result.reason,
        }));
      }
    }
    return null;
  }
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    if (typeof updateSettings === 'function') {
      await updateSettings(appendDecision(settings, {
        outcome: 'suppressed',
        key: chosen.key,
        topic: chosen.topic || getCandidateTopic(chosen),
        reason: 'permission_denied',
      }));
    }
    return null;
  }

  const quietBounds = getQuietBoundaryMinutes(settings);
  const baseDate = chosen.triggerDate instanceof Date ? chosen.triggerDate : new Date(Date.now() + 30 * 60000);
  const windowed = applyDeliveryWindow(baseDate, chosen.windows);
  const jittered = withJitter(windowed, Number(settings?.deliveryJitterMinutes || profile.deliveryJitterMinutes));
  const triggerDate = avoidQuietHours(jittered, quietBounds.start, quietBounds.end);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: chosen.title,
      body: chosen.body,
      sound: 'default',
    },
    trigger: triggerDate,
  });

  if (typeof updateSettings === 'function') {
    await updateSettings(appendDecision(settings, {
      outcome: 'sent',
      key: chosen.key,
      topic: chosen.topic || getCandidateTopic(chosen),
      reason: 'selected',
      notificationId,
      scheduledFor: triggerDate.toISOString(),
    }));
  }
  return { ...chosen, notificationId, scheduledFor: triggerDate.toISOString() };
}
