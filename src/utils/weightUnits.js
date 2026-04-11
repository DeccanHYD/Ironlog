const KG_TO_LBS = 2.2046226218;

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function convertKgToUnit(kgValue, unit = 'kg', decimals = 1) {
  const kg = Number(kgValue || 0);
  if (!Number.isFinite(kg)) return 0;
  if (unit === 'lbs') return round(kg * KG_TO_LBS, decimals);
  return round(kg, decimals);
}

export function convertUnitToKg(value, unit = 'kg', decimals = 1) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  if (unit === 'lbs') return round(numeric / KG_TO_LBS, decimals);
  return round(numeric, decimals);
}

export function formatWeightFromKg(kgValue, unit = 'kg', options = {}) {
  const {
    decimals = unit === 'lbs' ? 0 : 1,
    trimTrailingZero = true,
    showUnit = true,
  } = options;
  const converted = convertKgToUnit(kgValue, unit, decimals);
  let text = String(converted.toFixed(decimals));
  if (trimTrailingZero && text.includes('.')) {
    text = text.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }
  return showUnit ? `${text}${unit}` : text;
}

export function formatVolumeFromKg(kgValue, unit = 'kg', options = {}) {
  const converted = convertKgToUnit(kgValue, unit, options.decimals ?? (unit === 'lbs' ? 0 : 1));
  return `${Math.round(converted).toLocaleString()} ${unit}`;
}
