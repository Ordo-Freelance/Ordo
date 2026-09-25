export function imageBytes(value) {
  if (typeof value === 'string') {
    if (value[0] === '{' || value[0] === '[') {
      try { return imageBytes(JSON.parse(value)); } catch { return 0; }
    }
    const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i.exec(value);
    if (!match) return 0;
    const base64 = match[1];
    return Math.max(0, Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0));
  }
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value).reduce((sum, item) => sum + imageBytes(item), 0);
}

export function storageLimitBytes(planFeatures = {}, override = {}) {
  const candidate = Number(override.quota_mb ?? planFeatures.storage_mb ?? 25) + Number(override.purchased_mb || 0);
  const mb = Number(candidate);
  return Math.max(0, Math.min(Number.isFinite(mb) ? mb : 25, 10240)) * 1024 * 1024;
}

export function mayIncreaseImageUsage(previousBytes, nextBytes, limitBytes, uploadsEnabled = true) {
  if (nextBytes <= previousBytes) return true;
  return uploadsEnabled && nextBytes <= limitBytes;
}
