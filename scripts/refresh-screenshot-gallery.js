const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.resolve('C:/Users/prana/Downloads/Phone Link');
const featuresRoot = path.join(repoRoot, 'features');
const screenshotsRoot = path.join(featuresRoot, 'screenshots');
const fullRoot = path.join(screenshotsRoot, 'full');

const manifest = [
  ['Screenshot_20260410_224033_IRONLOG.jpg', '01-home-dashboard-amoled-smart-overview.jpg'],
  ['Screenshot_20260410_222921_IRONLOG.jpg', '02-home-dashboard-light-theme.jpg'],
  ['Screenshot_20260410_224023_IRONLOG.jpg', '03-program-insights-adaptive-targets.jpg'],
  ['Screenshot_20260410_223017_IRONLOG.jpg', '04-plans-overview-and-import.jpg'],
  ['Screenshot_20260410_223956_IRONLOG.jpg', '05-log-history-session-cards.jpg'],
  ['Screenshot_20260410_223026_IRONLOG.jpg', '06-log-history-single-session.jpg'],
  ['Screenshot_20260410_223917_IRONLOG.jpg', '07-volume-analytics-radar-overview.jpg'],
  ['Screenshot_20260410_223934_IRONLOG.jpg', '08-volume-analytics-muscle-breakdown.jpg'],
  ['Screenshot_20260410_224243_IRONLOG.jpg', '09-muscle-recovery-front-map.jpg'],
  ['Screenshot_20260410_224245_IRONLOG.jpg', '10-muscle-recovery-back-map.jpg'],
  ['Screenshot_20260410_224302_IRONLOG.jpg', '11-bodyweight-tracker-30d.jpg'],
  ['Screenshot_20260410_224133_IRONLOG.jpg', '12-backup-center-drive-and-encrypted-backups.jpg'],
  ['Screenshot_20260410_224114_IRONLOG.jpg', '13-settings-notification-and-backup-controls.jpg'],
  ['Screenshot_20260410_223054_IRONLOG.jpg', '14-calendar-month-overview.jpg'],
  ['Screenshot_20260410_223057_IRONLOG.jpg', '15-calendar-session-detail-sheet.jpg'],
  ['Screenshot_20260410_224002_IRONLOG.jpg', '16-stats-dashboard-personal-bests.jpg'],
  ['Screenshot_20260410_223047_IRONLOG.jpg', '17-stats-dashboard-compact.jpg'],
  ['Screenshot_20260410_223033_IRONLOG.jpg', '18-progress-photos-calendar.jpg'],
  ['Screenshot_20260410_223041_IRONLOG.jpg', '19-progress-photos-add-photo-modal.jpg'],
  ['Screenshot_20260410_222859_IRONLOG.jpg', '20-home-dashboard-amoled-alt.jpg'],
  ['Screenshot_20260410_222908_IRONLOG.jpg', '21-home-dashboard-amoled-compact.jpg'],
  ['Screenshot_20260410_222949_IRONLOG.jpg', '22-log-history-full-scroll.jpg'],
  ['Screenshot_20260410_222940_IRONLOG.jpg', '23-add-exercise-library-filter-chips.jpg'],
];

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function cleanOldAssets() {
  await ensureDir(screenshotsRoot);
  await ensureDir(fullRoot);
  const featureEntries = await fs.promises.readdir(featuresRoot, { withFileTypes: true });
  await Promise.all(
    featureEntries
      .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
      .map((entry) => fs.promises.unlink(path.join(featuresRoot, entry.name)))
  );

  const screenshotEntries = await fs.promises.readdir(screenshotsRoot, { withFileTypes: true });
  await Promise.all(
    screenshotEntries
      .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
      .map((entry) => fs.promises.unlink(path.join(screenshotsRoot, entry.name)))
  );

  const fullEntries = await fs.promises.readdir(fullRoot, { withFileTypes: true });
  await Promise.all(
    fullEntries
      .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
      .map((entry) => fs.promises.unlink(path.join(fullRoot, entry.name)))
  );
}

async function buildGallery() {
  await cleanOldAssets();

  for (const [sourceName, outputName] of manifest) {
    const sourcePath = path.join(sourceRoot, sourceName);
    const outputPath = path.join(screenshotsRoot, outputName);
    const fullOutputPath = path.join(fullRoot, outputName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing source screenshot: ${sourcePath}`);
    }

    await fs.promises.copyFile(sourcePath, fullOutputPath);

    await sharp(sourcePath)
      .rotate()
      .resize({
        width: 810,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 90,
        mozjpeg: true,
      })
      .toFile(outputPath);
  }
}

buildGallery()
  .then(() => {
    console.log(`Processed ${manifest.length} screenshots into ${screenshotsRoot}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
