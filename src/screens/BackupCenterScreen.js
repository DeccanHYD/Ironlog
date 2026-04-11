import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { triggerHaptic } from '../services/hapticsEngine';
import {
  BACKUP_RESTOREABLE_DOMAINS,
  buildRestorePreview,
  exportPreviewAndShareLatest,
  fetchRemoteSnapshot,
  getCurrentBackupPreview,
  importBackupWithPreview,
  readSnapshotContainer,
  refreshBackupHistory,
  restoreBackupContainer,
  validateLatestBackup,
} from '../services/backupService';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '—';
  }
}

function StatusCard({ label, value, hint, colors }) {
  return (
    <View style={[s.statusCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[s.statusLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[s.statusValue, { color: colors.text }]}>{value}</Text>
      {!!hint && <Text style={[s.statusHint, { color: colors.subtext }]}>{hint}</Text>}
    </View>
  );
}

function ActionButton({ label, hint, icon, colors, onPress, tone = 'normal', disabled = false }) {
  const accent = tone === 'danger' ? '#CC3333' : colors.accent;
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: disabled ? 0.55 : 1 }]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <View style={[s.iconWrap, { backgroundColor: `${accent}22`, borderColor: `${accent}44` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.actionTitle, { color: colors.text }]}>{label}</Text>
        {!!hint && <Text style={[s.actionHint, { color: colors.subtext }]}>{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function Section({ title, colors, children }) {
  return (
    <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[s.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function RecordCountsList({ counts, colors }) {
  return (
    <View style={s.countGrid}>
      {Object.entries(counts || {})
        .filter(([key]) => key !== 'total')
        .map(([key, value]) => (
          <View key={key} style={[s.countCard, { borderColor: colors.faint }]}>
            <Text style={[s.countValue, { color: colors.text }]}>{value}</Text>
            <Text style={[s.countLabel, { color: colors.subtext }]}>{key}</Text>
          </View>
        ))}
    </View>
  );
}

export default function BackupCenterScreen({ navigation }) {
  const {
    backupConfig,
    backupStatus,
    refreshBackupState,
    reloadFromStorage,
    runManualBackup,
    setupBackupPassphrase,
    updateBackupPreferences,
    linkDriveBackup,
    unlinkDriveBackup,
    updateDriveBackupFolder,
    updateDriveSyncMode,
    saveDriveOAuthClient,
    clearDriveOAuthClient,
    settings,
  } = useContext(AppContext);
  const colors = useTheme();
  const haptic = settings?.hapticFeedback !== false;

  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [passphraseModal, setPassphraseModal] = useState({ visible: false, mode: null, target: null });
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [restoreCandidate, setRestoreCandidate] = useState(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [oauthModalVisible, setOauthModalVisible] = useState(false);
  const [oauthClientIdInput, setOauthClientIdInput] = useState('');

  const refreshScreen = async () => {
    setLoadingPreview(true);
    try {
      const [nextPreview, nextHistory] = await Promise.all([
        getCurrentBackupPreview(),
        refreshBackupHistory(),
      ]);
      setPreview(nextPreview);
      setHistory(nextHistory);
      await refreshBackupState();
    } catch (error) {
      setAlertConfig({
        title: 'Backup center error',
        message: String(error?.message || error),
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    refreshScreen();
  }, []);

  const latestRegularBackup = useMemo(
    () => history.find((record) => !record.isRollback),
    [history]
  );

  const openPassphraseModal = (mode, target = null) => {
    setPassphrase('');
    setConfirmPassphrase('');
    setPassphraseModal({ visible: true, mode, target });
  };

  const closePassphraseModal = () => {
    setPassphrase('');
    setConfirmPassphrase('');
    setPassphraseModal({ visible: false, mode: null, target: null });
  };

  const ensurePassphraseConfigured = (nextMode) => {
    if (backupConfig.passphraseConfigured) return true;
    openPassphraseModal(nextMode || 'set');
    return false;
  };

  const handleConfigurePassphrase = async () => {
    if (!passphrase.trim() || passphrase.trim().length < 8) {
      setAlertConfig({ title: 'Passphrase too short', message: 'Use at least 8 characters for your backup passphrase.', buttons: [{ text: 'OK', style: 'default' }] });
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setAlertConfig({ title: 'Passphrases do not match', message: 'Please confirm the same passphrase twice.', buttons: [{ text: 'OK', style: 'default' }] });
      return;
    }
    setBusy(true);
    try {
      await setupBackupPassphrase(passphrase);
      triggerHaptic('success', { enabled: haptic }).catch(() => {});
      closePassphraseModal();
      await refreshScreen();
      setAlertConfig({ title: 'Passphrase saved', message: 'Encrypted backups are now enabled on this device.', buttons: [{ text: 'OK', style: 'default' }] });
    } catch (error) {
      setAlertConfig({ title: 'Could not save passphrase', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleManualBackup = async () => {
    if (!ensurePassphraseConfigured('set')) return;
    setBusy(true);
    try {
      const result = await runManualBackup();
      triggerHaptic('backupSucceeded', { enabled: haptic }).catch(() => {});
      await refreshScreen();
      setAlertConfig({
        title: 'Backup complete',
        message: result?.remote ? 'Encrypted snapshot saved locally and synced to Google Drive.' : 'Encrypted snapshot saved locally.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } catch (error) {
      setAlertConfig({ title: 'Backup failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleShareExport = async () => {
    if (!ensurePassphraseConfigured('set')) return;
    setBusy(true);
    try {
      await exportPreviewAndShareLatest();
      triggerHaptic('backupSucceeded', { enabled: haptic }).catch(() => {});
      await refreshScreen();
    } catch (error) {
      setAlertConfig({ title: 'Export failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectDrive = async (connectOptions = {}) => {
    if (backupStatus.driveConfigured === false) {
      openOauthModal();
      return;
    }
    if (!ensurePassphraseConfigured('set')) return;
    setBusy(true);
    try {
      const preferredMode = connectOptions?.mode || backupStatus.driveMode || 'appdata';
      const result = await linkDriveBackup({
        mode: preferredMode === 'folder' ? 'folder' : 'appdata',
        folderName: connectOptions?.folderName || backupStatus.driveFolderName || 'IRONLOG Backups',
      });
      if (!result?.connected) {
        setAlertConfig({ title: 'Drive link cancelled', message: 'Google Drive backup stays disabled until you finish the sign-in flow.', buttons: [{ text: 'OK', style: 'default' }] });
      } else {
        triggerHaptic('success', { enabled: haptic }).catch(() => {});
      }
      await refreshScreen();
    } catch (error) {
      setAlertConfig({ title: 'Drive link failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchDriveMode = async (mode) => {
    setBusy(true);
    try {
      await updateDriveSyncMode(mode);
      await refreshScreen();
      setAlertConfig({
        title: 'Drive mode updated',
        message: mode === 'folder'
          ? 'Backups will sync to your selected Drive folder.'
          : 'Backups will sync to Google Drive AppData (hidden app storage).',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } catch (error) {
      setAlertConfig({ title: 'Mode update failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const openFolderModal = () => {
    setFolderNameInput(backupStatus.driveFolderName || 'IRONLOG Backups');
    setFolderModalVisible(true);
  };

  const handleSetDriveFolder = async () => {
    const next = String(folderNameInput || '').trim();
    if (!next) {
      setAlertConfig({ title: 'Folder required', message: 'Enter a Drive folder name.', buttons: [{ text: 'OK', style: 'default' }] });
      return;
    }
    setBusy(true);
    try {
      await updateDriveBackupFolder(next);
      setFolderModalVisible(false);
      await refreshScreen();
      setAlertConfig({ title: 'Drive folder updated', message: `Backups will sync to "${next}".`, buttons: [{ text: 'OK', style: 'default' }] });
    } catch (error) {
      setAlertConfig({ title: 'Folder update failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectDrive = async () => {
    setBusy(true);
    try {
      await unlinkDriveBackup();
      await refreshScreen();
    } catch (error) {
      setAlertConfig({ title: 'Could not disconnect Drive', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const openOauthModal = () => {
    setOauthClientIdInput('');
    setOauthModalVisible(true);
  };

  const handleSaveOAuthClient = async (connectAfterSave = false) => {
    const next = String(oauthClientIdInput || '').trim();
    if (!next) {
      setAlertConfig({ title: 'Client ID required', message: 'Paste your Google OAuth Android client ID to enable Drive sign-in.', buttons: [{ text: 'OK', style: 'default' }] });
      return;
    }
    setBusy(true);
    try {
      await saveDriveOAuthClient(next);
      setOauthModalVisible(false);
      await refreshScreen();
      if (connectAfterSave) {
        await handleConnectDrive();
        return;
      }
      setAlertConfig({ title: 'Drive OAuth saved', message: 'Google Drive can now be linked from this device.', buttons: [{ text: 'OK', style: 'default' }] });
    } catch (error) {
      setAlertConfig({ title: 'Could not save OAuth', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleClearOAuthClient = async () => {
    setBusy(true);
    try {
      await clearDriveOAuthClient();
      await refreshScreen();
      setAlertConfig({ title: 'OAuth removed', message: 'Local Google OAuth client ID was cleared for this device.', buttons: [{ text: 'OK', style: 'default' }] });
    } catch (error) {
      setAlertConfig({ title: 'Could not clear OAuth', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handleValidateBackup = async () => {
    if (!ensurePassphraseConfigured('set')) return;
    openPassphraseModal('validate');
  };

  const handleImportBackup = async () => {
    openPassphraseModal('import');
  };

  const handleHistoryRestore = async (record) => {
    openPassphraseModal('history_restore', record);
  };

  const continueRestore = async (container, selectedPassphrase) => {
    setBusy(true);
    try {
      await restoreBackupContainer(container, {
        passphrase: selectedPassphrase,
        selectedDomains: BACKUP_RESTOREABLE_DOMAINS,
        createRollback: true,
      });
      triggerHaptic('restoreSucceeded', { enabled: haptic, force: true }).catch(() => {});
      setRestoreCandidate(null);
      closePassphraseModal();
      await reloadFromStorage();
      await refreshScreen();
      setAlertConfig({ title: 'Restore complete', message: 'Your data was restored and a rollback snapshot was created locally.', buttons: [{ text: 'OK', style: 'default' }] });
    } catch (error) {
      setAlertConfig({ title: 'Restore failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  const handlePassphraseSubmit = async () => {
    if (passphraseModal.mode === 'set') {
      await handleConfigurePassphrase();
      return;
    }

    setBusy(true);
    try {
      if (passphraseModal.mode === 'validate') {
        const validation = await validateLatestBackup(passphrase);
        closePassphraseModal();
        setAlertConfig({
          title: validation.valid ? 'Backup looks healthy' : 'Backup validation warning',
          message: validation.preview?.checksumValid === false
            ? 'Checksum validation failed for the latest snapshot.'
            : `Latest snapshot: ${validation.preview?.snapshotId || latestRegularBackup?.snapshotId || '—'}`,
          buttons: [{ text: 'OK', style: 'default' }],
        });
      } else if (passphraseModal.mode === 'import') {
        const imported = await importBackupWithPreview(passphrase);
        if (!imported) {
          closePassphraseModal();
        } else {
          setRestoreCandidate({ ...imported, passphrase });
          closePassphraseModal();
        }
      } else if (passphraseModal.mode === 'history_restore') {
        const target = passphraseModal.target;
        const container = target?.remote && !target?.localUri
          ? await fetchRemoteSnapshot(target)
          : await readSnapshotContainer(target);
        const previewData = await buildRestorePreview(container, passphrase);
        setRestoreCandidate({ container, preview: previewData, record: target, passphrase });
        closePassphraseModal();
      }
    } catch (error) {
      setAlertConfig({ title: 'Passphrase failed', message: String(error?.message || error), buttons: [{ text: 'OK', style: 'default' }] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
      <Section title="TRUST STATUS" colors={colors}>
        <View style={s.statusGrid}>
          <StatusCard label="Last Backed Up" value={formatWhen(backupStatus.lastBackupAt)} hint={backupStatus.lastBackupResult || 'No local snapshot yet'} colors={colors} />
          <StatusCard label="Last Synced" value={formatWhen(backupStatus.lastSyncedAt)} hint={backupStatus.driveLinked ? 'Google Drive linked' : 'Drive not linked'} colors={colors} />
          <StatusCard label="Last Restored" value={formatWhen(backupStatus.lastRestoreAt)} hint={backupStatus.lastRestoreResult || 'No restore yet'} colors={colors} />
          <StatusCard label="Versions Kept" value={String(backupStatus.rollingVersionCount || 0)} hint="Latest snapshot + rolling history" colors={colors} />
        </View>
        {!!backupStatus.lastFailure && (
          <View style={[s.warningBox, { borderColor: '#883333', backgroundColor: '#221010' }]}>
            <Text style={[s.warningTitle, { color: '#FF9A9A' }]}>Last issue</Text>
            <Text style={[s.warningText, { color: '#F0B9B9' }]}>{backupStatus.lastFailure}</Text>
          </View>
        )}
      </Section>

      <Section title="AUTO BACKUP" colors={colors}>
        <View style={[s.toggleRow, { borderBottomColor: colors.faint }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.toggleTitle, { color: colors.text }]}>Encrypted backups enabled</Text>
            <Text style={[s.toggleHint, { color: colors.subtext }]}>Uses your saved passphrase and local-first snapshots.</Text>
          </View>
          <Switch
            value={backupConfig.enabled}
            onValueChange={(value) => updateBackupPreferences({ enabled: value })}
            trackColor={{ false: colors.faint, true: colors.accentSoft }}
            thumbColor={backupConfig.enabled ? colors.accent : colors.muted}
          />
        </View>
        <View style={[s.toggleRow, { borderBottomColor: colors.faint }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.toggleTitle, { color: colors.text }]}>On workout completion</Text>
            <Text style={[s.toggleHint, { color: colors.subtext }]}>Queues one encrypted backup after you finish a session.</Text>
          </View>
          <Switch
            value={backupConfig.autoBackupOnWorkoutCompletion}
            onValueChange={(value) => updateBackupPreferences({ autoBackupOnWorkoutCompletion: value })}
            trackColor={{ false: colors.faint, true: colors.accentSoft }}
            thumbColor={backupConfig.autoBackupOnWorkoutCompletion ? colors.accent : colors.muted}
          />
        </View>
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.toggleTitle, { color: colors.text }]}>On app background</Text>
            <Text style={[s.toggleHint, { color: colors.subtext }]}>Schedules a debounced backup after you leave the app.</Text>
          </View>
          <Switch
            value={backupConfig.autoBackupOnBackground}
            onValueChange={(value) => updateBackupPreferences({ autoBackupOnBackground: value })}
            trackColor={{ false: colors.faint, true: colors.accentSoft }}
            thumbColor={backupConfig.autoBackupOnBackground ? colors.accent : colors.muted}
          />
        </View>
      </Section>

      <Section title="ENCRYPTION & DRIVE" colors={colors}>
        <ActionButton
          label={backupConfig.passphraseConfigured ? 'Change backup passphrase' : 'Set backup passphrase'}
          hint={backupConfig.passphraseConfigured ? 'Encrypted auto-backups are ready on this device.' : 'Required before encrypted backup can run.'}
          icon="lock-closed-outline"
          colors={colors}
          onPress={() => openPassphraseModal('set')}
        />
        <ActionButton
          label={backupStatus.driveLinked ? 'Disconnect Google Drive' : 'Connect Google Drive'}
          hint={
            backupStatus.driveConfigured === false
              ? (backupStatus.driveConfigMessage || 'Drive setup is needed before first sign-in.')
              : backupStatus.driveLinked
                ? (
                    backupStatus.driveMode === 'folder'
                      ? `Folder sync active${backupStatus.driveFolderName ? `: ${backupStatus.driveFolderName}` : ''}.`
                      : 'AppData sync active (hidden app storage).'
                  )
                : 'Connect Google Drive for cloud backup.'
          }
          icon={backupStatus.driveLinked ? 'cloud-done-outline' : 'cloud-outline'}
          colors={colors}
          onPress={backupStatus.driveLinked ? handleDisconnectDrive : handleConnectDrive}
          tone={backupStatus.driveLinked ? 'danger' : 'normal'}
        />
        {!backupStatus.driveLinked ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[s.modalBtn, { borderColor: colors.faint, flex: 1 }]}
              onPress={() => handleConnectDrive({ mode: 'appdata' })}
            >
              <Text style={[s.modalBtnText, { color: colors.subtext }]}>Connect AppData</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft, flex: 1 }]}
              onPress={() => handleConnectDrive({ mode: 'folder' })}
            >
              <Text style={[s.modalBtnText, { color: colors.accent }]}>Connect Folder Sync</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!backupStatus.driveLinked ? (
          <ActionButton
            label="Set Google OAuth Client ID"
            hint="One-time setup. After saving, connect your own Google account."
            icon="key-outline"
            colors={colors}
            onPress={openOauthModal}
          />
        ) : null}
        {!backupStatus.driveLinked && backupStatus.driveConfigured !== false ? (
          <ActionButton
            label="Clear Google OAuth Client ID"
            hint="Remove local OAuth override from this device."
            icon="trash-outline"
            colors={colors}
            onPress={handleClearOAuthClient}
            tone="danger"
          />
        ) : null}
        {backupStatus.driveLinked ? (
          <>
            <ActionButton
              label={backupStatus.driveMode === 'folder' ? 'Use AppData Sync' : 'Use Drive Folder Sync'}
              hint={backupStatus.driveMode === 'folder'
                ? 'Switch to hidden appDataFolder backups.'
                : 'Switch to a visible Drive folder for backups.'}
              icon="swap-horizontal-outline"
              colors={colors}
              onPress={() => handleSwitchDriveMode(backupStatus.driveMode === 'folder' ? 'appdata' : 'folder')}
            />
            {backupStatus.driveMode === 'folder' ? (
              <ActionButton
                label="Set Drive Folder"
                hint={backupStatus.driveFolderName ? `Current: ${backupStatus.driveFolderName}` : 'Choose backup folder name.'}
                icon="folder-open-outline"
                colors={colors}
                onPress={openFolderModal}
              />
            ) : null}
          </>
        ) : null}
        <View style={[s.guideBox, { borderColor: colors.faint, backgroundColor: colors.bg }]}>
          <Text style={[s.guideTitle, { color: colors.text }]}>HOW DRIVE AUTH WORKS</Text>
          <Text style={[s.guideText, { color: colors.subtext }]}>1. Set your backup passphrase first.</Text>
          <Text style={[s.guideText, { color: colors.subtext }]}>
            2. If this build says Drive is unavailable, tap `Set Google OAuth Client ID` in this section.
          </Text>
          <Text style={[s.guideText, { color: colors.subtext }]}>3. Tap `Connect Google Drive` to open Google sign-in and consent.</Text>
          <Text style={[s.guideText, { color: colors.subtext }]}>
            4. After linking, choose hidden `AppData` sync or a visible Drive folder. Folder mode creates or reuses `IRONLOG Backups` in your Drive root.
          </Text>
        </View>
      </Section>

      <Section title="BACKUP ACTIONS" colors={colors}>
        <ActionButton label="Back Up Now" hint="Create a fresh encrypted snapshot immediately." icon="save-outline" colors={colors} onPress={handleManualBackup} />
        <ActionButton label="Export Encrypted Backup" hint="Preview included data and share the encrypted snapshot file." icon="share-social-outline" colors={colors} onPress={handleShareExport} />
        <ActionButton label="Validate Latest Backup" hint="Checksum-validate the newest snapshot before you need it." icon="shield-checkmark-outline" colors={colors} onPress={handleValidateBackup} />
        <ActionButton label="Import Backup File" hint="Pick an encrypted backup, preview it, then confirm restore." icon="download-outline" colors={colors} onPress={handleImportBackup} />
        <ActionButton label="Privacy & Local-First" hint="See exactly what stays local and what backup uploads." icon="document-text-outline" colors={colors} onPress={() => navigation.navigate('Privacy')} />
      </Section>

      <Section title="EXPORT PREVIEW" colors={colors}>
        {loadingPreview || !preview ? (
          <Text style={[s.previewEmpty, { color: colors.muted }]}>Preparing backup preview...</Text>
        ) : (
          <>
            <Text style={[s.previewText, { color: colors.subtext }]}>
              Structured data only. Progress photos and custom media stay local in this release.
            </Text>
            <RecordCountsList counts={preview.recordCounts} colors={colors} />
          </>
        )}
      </Section>

      <Section title="BACKUP HISTORY" colors={colors}>
        {!history.length ? (
          <Text style={[s.previewEmpty, { color: colors.muted }]}>No encrypted snapshots yet.</Text>
        ) : history.slice(0, 8).map((record) => (
          <View key={`${record.source}-${record.snapshotId}`} style={[s.historyRow, { borderBottomColor: colors.faint }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{record.isRollback ? 'ROLLBACK SNAPSHOT' : 'ENCRYPTED SNAPSHOT'}</Text>
                <View style={[s.badge, { borderColor: colors.faint }]}>
                  <Text style={[s.badgeText, { color: colors.muted }]}>{(record.source || 'local').toUpperCase()}</Text>
                </View>
              </View>
              <Text style={[s.historyMeta, { color: colors.subtext }]}>{formatWhen(record.createdAt)}</Text>
              <Text style={[s.historyMeta, { color: colors.muted }]} numberOfLines={1}>{record.snapshotId}</Text>
            </View>
            <TouchableOpacity style={[s.restoreBtn, { borderColor: colors.accent }]} onPress={() => handleHistoryRestore(record)}>
              <Text style={[s.restoreBtnText, { color: colors.accent }]}>RESTORE</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Section>

      <Modal visible={passphraseModal.visible} transparent animationType="fade" onRequestClose={closePassphraseModal}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>
              {passphraseModal.mode === 'set' ? 'Set Backup Passphrase' : 'Enter Backup Passphrase'}
            </Text>
            <Text style={[s.modalHint, { color: colors.subtext }]}>
              {passphraseModal.mode === 'set'
                ? 'This passphrase protects your encrypted snapshots and is required on a new phone.'
                : 'Used to validate checksum and decrypt the selected snapshot.'}
            </Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.faint, backgroundColor: colors.bg }]}
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              placeholder="Passphrase"
              placeholderTextColor={colors.muted}
            />
            {passphraseModal.mode === 'set' && (
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.faint, backgroundColor: colors.bg }]}
                value={confirmPassphrase}
                onChangeText={setConfirmPassphrase}
                secureTextEntry
                placeholder="Confirm passphrase"
                placeholderTextColor={colors.muted}
              />
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={closePassphraseModal}>
                <Text style={[s.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]} onPress={handlePassphraseSubmit} disabled={busy}>
                <Text style={[s.modalBtnText, { color: colors.accent }]}>{busy ? 'Working...' : 'Continue'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!restoreCandidate} transparent animationType="fade" onRequestClose={() => setRestoreCandidate(null)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Restore Preview</Text>
            <Text style={[s.modalHint, { color: colors.subtext }]}>
              {restoreCandidate?.preview?.checksumValid === false
                ? 'Checksum validation failed. Do not restore this backup.'
                : 'Review this snapshot before overwriting your current local data.'}
            </Text>
            <Text style={[s.previewLine, { color: colors.text }]}>Snapshot: {restoreCandidate?.preview?.snapshotId || restoreCandidate?.record?.snapshotId || '—'}</Text>
            <Text style={[s.previewLine, { color: colors.subtext }]}>Created: {formatWhen(restoreCandidate?.preview?.createdAt || restoreCandidate?.record?.createdAt)}</Text>
            <Text style={[s.previewLine, { color: colors.subtext }]}>Conflict: {restoreCandidate?.preview?.conflictSummary || '—'}</Text>
            <RecordCountsList counts={restoreCandidate?.preview?.recordCounts || {}} colors={colors} />
            {!!restoreCandidate?.preview?.warnings?.length && (
              <View style={[s.warningBox, { borderColor: '#886020', backgroundColor: '#21190D' }]}>
                {restoreCandidate.preview.warnings.map((warning) => (
                  <Text key={warning} style={[s.warningText, { color: '#F8DDA0' }]}>{warning}</Text>
                ))}
              </View>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={() => setRestoreCandidate(null)}>
                <Text style={[s.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                disabled={restoreCandidate?.preview?.checksumValid === false || busy}
                onPress={() => continueRestore(restoreCandidate.container || restoreCandidate.file?.uri || restoreCandidate.record, restoreCandidate.passphrase || passphrase)}
              >
                <Text style={[s.modalBtnText, { color: colors.accent }]}>{busy ? 'Restoring...' : 'Restore Now'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={folderModalVisible} transparent animationType="fade" onRequestClose={() => setFolderModalVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Set Drive Folder</Text>
            <Text style={[s.modalHint, { color: colors.subtext }]}>Backups will sync to a folder in your Drive root. Existing folder names are reused.</Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.faint, backgroundColor: colors.bg }]}
              value={folderNameInput}
              onChangeText={setFolderNameInput}
              placeholder="IRONLOG Backups"
              placeholderTextColor={colors.muted}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={() => setFolderModalVisible(false)}>
                <Text style={[s.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]} onPress={handleSetDriveFolder}>
                <Text style={[s.modalBtnText, { color: colors.accent }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={oauthModalVisible} transparent animationType="fade" onRequestClose={() => setOauthModalVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Google OAuth Client ID</Text>
            <Text style={[s.modalHint, { color: colors.subtext }]}>Paste your Android OAuth client ID (ends with `.apps.googleusercontent.com`) to enable Drive auth in this build.</Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.faint, backgroundColor: colors.bg }]}
              value={oauthClientIdInput}
              onChangeText={setOauthClientIdInput}
              placeholder="12345-abc.apps.googleusercontent.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={() => setOauthModalVisible(false)}>
                <Text style={[s.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.faint }]} onPress={() => handleSaveOAuthClient(false)} disabled={busy}>
                <Text style={[s.modalBtnText, { color: colors.subtext }]}>{busy ? 'Saving...' : 'Save only'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]} onPress={() => handleSaveOAuthClient(true)} disabled={busy}>
                <Text style={[s.modalBtnText, { color: colors.accent }]}>{busy ? 'Saving...' : 'Save & Connect'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons || [{ text: 'OK', style: 'default' }]}
        onDismiss={() => setAlertConfig(null)}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  section: { borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2.5 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusCard: { width: '48%', borderWidth: 1, padding: 12, minHeight: 90 },
  statusLabel: { fontSize: 9, letterSpacing: 2, marginBottom: 6 },
  statusValue: { fontSize: 16, fontWeight: '900', lineHeight: 20 },
  statusHint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  warningBox: { borderWidth: 1, padding: 12, gap: 6 },
  warningTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  warningText: { fontSize: 12, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '700' },
  toggleHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 14 },
  iconWrap: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '800' },
  actionHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  guideBox: { borderWidth: 1, padding: 12, gap: 6 },
  guideTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  guideText: { fontSize: 12, lineHeight: 18 },
  previewText: { fontSize: 12, lineHeight: 18 },
  previewEmpty: { fontSize: 12, lineHeight: 18 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countCard: { width: '31%', borderWidth: 1, padding: 10, minHeight: 76 },
  countValue: { fontSize: 18, fontWeight: '900' },
  countLabel: { fontSize: 10, marginTop: 4, textTransform: 'capitalize' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  historyTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  historyMeta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  badge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  restoreBtn: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  restoreBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.84)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  modalHint: { fontSize: 12, lineHeight: 18 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  modalBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  previewLine: { fontSize: 12, lineHeight: 18 },
});
