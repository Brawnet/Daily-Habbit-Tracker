const STORAGE_KEYS = {
  gasUrl: 'habbit.gasUrl',
  pin: 'habbit.pin',
  deviceId: 'habbit.deviceId',
};

export function getStorage() {
  if (typeof localStorage !== 'undefined' && localStorage !== null) {
    return localStorage;
  }
  if (!globalThis.__habbitMemoryStorage) {
    const memory = new Map();
    globalThis.__habbitMemoryStorage = {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
      clear: () => memory.clear(),
    };
  }
  return globalThis.__habbitMemoryStorage;
}

function getOrCreateDeviceId() {
  const storage = getStorage();
  let deviceId = storage.getItem(STORAGE_KEYS.deviceId);
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    storage.setItem(STORAGE_KEYS.deviceId, deviceId);
  }
  return deviceId;
}

/**
 * @returns {{ gasUrl: string, pin: string, deviceId: string }}
 */
export function getConfig() {
  const storage = getStorage();
  const gasUrl = storage.getItem(STORAGE_KEYS.gasUrl) || '';
  const pin = storage.getItem(STORAGE_KEYS.pin) || '';
  const deviceId = getOrCreateDeviceId();
  return { gasUrl, pin, deviceId };
}

export const GAS_URL_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec(\?.*)?$/;

/**
 * Validates whether a URL is a legitimate Google Apps Script Web App exec URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidGasUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return GAS_URL_REGEX.test(url.trim());
}

/**
 * @param {Partial<{ gasUrl: string, pin: string, deviceId: string }>} partial
 */
export function setConfig(partial = {}) {
  const storage = getStorage();
  if (partial.gasUrl !== undefined) {
    if (partial.gasUrl === null || partial.gasUrl === '') {
      storage.removeItem(STORAGE_KEYS.gasUrl);
    } else {
      const trimmed = String(partial.gasUrl).trim();
      if (!isValidGasUrl(trimmed)) {
        throw new Error('Invalid Google Apps Script Web App URL. Must match https://script.google.com/macros/s/.../exec');
      }
      storage.setItem(STORAGE_KEYS.gasUrl, trimmed);
    }
  }
  if (partial.pin !== undefined) {
    if (partial.pin === null || partial.pin === '') {
      storage.removeItem(STORAGE_KEYS.pin);
    } else {
      storage.setItem(STORAGE_KEYS.pin, String(partial.pin).trim());
    }
  }
  if (partial.deviceId !== undefined) {
    if (partial.deviceId === null || partial.deviceId === '') {
      storage.removeItem(STORAGE_KEYS.deviceId);
    } else {
      storage.setItem(STORAGE_KEYS.deviceId, String(partial.deviceId));
    }
  }
}

/**
 * @returns {boolean}
 */
export function isConfigured() {
  const { gasUrl, pin } = getConfig();
  return Boolean(gasUrl && pin);
}
