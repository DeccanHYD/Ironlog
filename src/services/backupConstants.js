export const ACTIVE_WORKOUT_SESSION_PREFIX = '@ironlog/activeWorkoutSession/';

export const BACKUP_CONFIG_KEY = '@ironlog/backupConfig';
export const BACKUP_STATUS_KEY = '@ironlog/backupStatus';
export const BACKUP_INDEX_KEY = '@ironlog/backupIndex';
export const BACKUP_QUEUE_KEY = '@ironlog/backupQueue';
export const BACKUP_DEVICE_ID_KEY = '@ironlog/deviceId';
export const BACKUP_NOTIFICATION_SETTINGS_KEY = '@ironlog/notificationSettings';

export const BACKUP_KEY_MATERIAL_SECURE_KEY = 'ironlog.backup.keyMaterial';
export const BACKUP_DRIVE_TOKEN_SECURE_KEY = 'ironlog.backup.driveToken';

export const CURRENT_BACKUP_SCHEMA_VERSION = 2;
export const CURRENT_BACKUP_FORMAT = 'IRONLOG_ENCRYPTED_BACKUP_V2';

export const BACKUP_MANAGED_KEYS = {
  plans: ['ironlog_plans'],
  history: ['ironlog_history', '@ironlog/pr_index', '@ironlog/volume_index', '@ironlog/lastPerformance'],
  metrics: ['ironlog_bw', '@ironlog/bodyMeasurements'],
  notes: ['ironlog_notes'],
  settings: ['ironlog_settings'],
  gym: ['@ironlog/gymProfiles', '@ironlog/activeGymProfileId'],
  onboarding: ['@ironlog/onboardingComplete'],
  exerciseMap: ['ironlog_exerciseMap'],
  training: ['@ironlog/trainingMaxes', '@ironlog/nextTargets'],
  recovery: ['@ironlog/manualRecoveryInput'],
  milestones: ['@ironlog/milestoneUnlocks'],
  customExercises: ['@ironlog/customExercises'],
  notifications: [BACKUP_NOTIFICATION_SETTINGS_KEY],
  backupPreferences: [BACKUP_CONFIG_KEY],
};

export const BACKUP_RESTOREABLE_DOMAINS = ['plans', 'history', 'metrics', 'settings', 'recovery', 'milestones', 'customExercises'];

export const DEFAULT_BACKUP_CONFIG = {
  enabled: false,
  autoBackupOnWorkoutCompletion: true,
  autoBackupOnBackground: true,
  driveEnabled: true,
  retentionCount: 5,
  localRetentionCount: 8,
  exportIncludesPhotos: false,
  passphraseConfigured: false,
};

export const DEFAULT_BACKUP_STATUS = {
  enabled: false,
  driveLinked: false,
  lastBackupAt: null,
  lastBackupResult: null,
  lastSyncedAt: null,
  lastRestoreAt: null,
  lastRestoreResult: null,
  lastFailure: null,
  queuedReason: null,
  rollingVersionCount: 0,
  dirty: false,
  lastDataHash: null,
  lastSnapshotId: null,
};

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  notificationProfile: 'balanced',
  trainingReminders: true,
  recoverySuggestions: true,
  planAdherenceAlerts: true,
  backupAlerts: true,
  milestoneNotifications: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  quietHoursStartMinutes: 22 * 60,
  quietHoursEndMinutes: 8 * 60,
  cooldownHours: 12,
  maxNotificationsPerDayOverride: null,
  weeklyCapMode: 'plan_based',
  maxNotificationsPerWeekOverride: null,
  reminderLeadMinutes: 90,
  deliveryJitterMinutes: 12,
  perTopicCooldownHours: {},
  snoozeUntil: null,
  decisionLog: [],
  lastDecisionAt: null,
  lastDecisionKey: null,
  lastScheduledFor: null,
};

export const BACKUP_LOCAL_DIR_NAME = 'backups';

export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
