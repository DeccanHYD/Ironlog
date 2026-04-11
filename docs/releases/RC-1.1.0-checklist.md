# IRONLOG 1.1.0 RC Checklist (Android)

Last updated: 2026-04-11

## 1) Build + Install
- [x] Release build compiles (`gradlew assembleRelease`)
- [x] APK installed on physical device (`adb install -r`)
- [x] RC artifact copied to `release_builds/IRONLOG-v1.1.0-beta-rc.apk`

## 2) Notifications (Balanced, non-annoying)
- [x] Balanced policy enforced (`max 1/day`, `max 3/week`)
- [x] Quiet hours + cooldown + per-topic cooldown enforced
- [x] Candidate arbitration selects one highest-scoring candidate
- [x] Already-actioned suppression added (training/bodyweight/streak)
- [x] Decision log includes suppression reasons

## 3) Migration + Restore Safety
- [x] AsyncStorage -> SQLite migration guard and count verification present
- [x] SQLite export/import validation passes
- [x] SQLite export now includes continuity app-state:
  - notification settings/state
  - backup prefs/status
  - manual recovery input
  - milestone unlocks
  - app settings/profile keys

## 4) Automated QA Gates
- [x] `npm run validate:plans`
- [x] `npm run qa:notifications`
- [x] `npm run qa:migration`
- [x] `npm run qa:rc`

## 5) Remaining before stable tag
- [ ] Manual exploratory pass on low-end device for navigation smoothness
- [ ] Drive auth flow final smoke test (appData + folder mode)
- [ ] Final release notes polish and tag cut
