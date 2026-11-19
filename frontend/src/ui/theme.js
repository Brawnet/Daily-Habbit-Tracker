/**
 * Habbit Theme Manager
 * Manages per-Device Light / Dark / System theme preference, DOM application,
 * theme-color metadata, CSS color-scheme, and live OS preference updates.
 */

import { getStorage } from '../data/config.js';

export const THEME_STORAGE_KEY = 'habbit.theme';

export const THEME_MODES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

export const THEME_COLORS = Object.freeze({
  light: '#F6F5F2',
  dark: '#161514',
});

const VALID_THEMES = new Set([THEME_MODES.LIGHT, THEME_MODES.DARK, THEME_MODES.SYSTEM]);
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

let activeDefaultCleanup = null;

/**
 * Normalizes a theme value to one of 'light' | 'dark' | 'system'.
 * Falls back to 'system' for missing or unrecognized values.
 *
 * @param {unknown} value
 * @returns {'light' | 'dark' | 'system'}
 */
export function normalizeTheme(value) {
  return typeof value === 'string' && VALID_THEMES.has(value) ? value : THEME_MODES.SYSTEM;
}

/**
 * Resolves the effective appearance ('light' | 'dark') from a preference and OS setting.
 *
 * @param {'light' | 'dark' | 'system' | string} preference
 * @param {boolean} systemPrefersDark
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(preference, systemPrefersDark) {
  const normalized = normalizeTheme(preference);
  if (normalized === THEME_MODES.DARK) return THEME_MODES.DARK;
  if (normalized === THEME_MODES.LIGHT) return THEME_MODES.LIGHT;
  return systemPrefersDark ? THEME_MODES.DARK : THEME_MODES.LIGHT;
}

const inSessionWriteOverrides = new WeakMap();
const NO_STORAGE_KEY = Object.freeze({});

function getOverrideKey(store) {
  return store && typeof store === 'object' ? store : NO_STORAGE_KEY;
}

function resolveSafeStorage(storage) {
  if (storage) return storage;
  try {
    return getStorage();
  } catch {
    return null;
  }
}

/**
 * Reads the persisted per-Device theme preference, defaulting safely to 'system'.
 * Falls back to any in-session override recorded when storage writes failed.
 *
 * @param {{ storage?: Storage }} [options]
 * @returns {'light' | 'dark' | 'system'}
 */
export function getThemePreference({ storage } = {}) {
  try {
    const store = resolveSafeStorage(storage);
    const override = inSessionWriteOverrides.get(getOverrideKey(store));
    if (override) return override;
    if (!store || typeof store.getItem !== 'function') return THEME_MODES.SYSTEM;
    return normalizeTheme(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return inSessionWriteOverrides.get(NO_STORAGE_KEY) || THEME_MODES.SYSTEM;
  }
}

function getSystemPrefersDark(win) {
  try {
    return Boolean(win?.matchMedia?.(DARK_MEDIA_QUERY)?.matches);
  } catch {
    return false;
  }
}

/**
 * Applies the resolved theme to <html> (.dark class, data-theme, colorScheme)
 * and synchronizes <meta name="theme-color">.
 *
 * @param {'light' | 'dark' | 'system' | string} preference
 * @param {{ doc?: Document, win?: Window, systemPrefersDark?: boolean }} [options]
 * @returns {'light' | 'dark'}
 */
export function applyTheme(
  preference,
  {
    doc = typeof document !== 'undefined' ? document : undefined,
    win = typeof window !== 'undefined' ? window : undefined,
    systemPrefersDark,
  } = {}
) {
  const prefersDark =
    typeof systemPrefersDark === 'boolean' ? systemPrefersDark : getSystemPrefersDark(win);
  const resolved = resolveTheme(preference, prefersDark);

  const root = doc?.documentElement;
  if (root) {
    if (root.classList) {
      if (resolved === THEME_MODES.DARK) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
    root.setAttribute?.('data-theme', resolved);
    if (root.style) {
      root.style.colorScheme = resolved;
    }
  }

  const meta =
    doc?.getElementById?.('meta-theme-color') || doc?.querySelector?.('meta[name="theme-color"]');
  meta?.setAttribute?.('content', THEME_COLORS[resolved]);

  return resolved;
}

/**
 * Persists a per-Device theme preference to local storage and applies it immediately.
 * If storage writes throw or are unavailable, keeps an in-session override so live OS
 * preference changes do not silently overwrite the user's explicit choice.
 *
 * @param {'light' | 'dark' | 'system' | string} preference
 * @param {{ storage?: Storage, doc?: Document, win?: Window }} [options]
 * @returns {'light' | 'dark'}
 */
export function setThemePreference(preference, { storage, doc, win } = {}) {
  const normalized = normalizeTheme(preference);
  const store = resolveSafeStorage(storage);
  const key = getOverrideKey(store);
  try {
    if (store && typeof store.setItem === 'function') {
      store.setItem(THEME_STORAGE_KEY, normalized);
      inSessionWriteOverrides.delete(key);
    } else {
      inSessionWriteOverrides.set(key, normalized);
    }
  } catch {
    // Storage write failed (e.g. private mode / quota limits); preserve choice for this session
    inSessionWriteOverrides.set(key, normalized);
  }
  return applyTheme(normalized, { doc, win });
}

/**
 * Initializes the theme on startup and listens for live OS prefers-color-scheme changes
 * while the Device preference is 'system'.
 *
 * @param {{ storage?: Storage, doc?: Document, win?: Window }} [options]
 * @returns {() => void} cleanup
 */
export function initTheme(options = {}) {
  const isDefaultWindow = !options || options.win === undefined;
  if (isDefaultWindow && activeDefaultCleanup) {
    activeDefaultCleanup();
    activeDefaultCleanup = null;
  }

  const {
    storage,
    doc = typeof document !== 'undefined' ? document : undefined,
    win = typeof window !== 'undefined' ? window : undefined,
  } = options || {};

  inSessionWriteOverrides.delete(NO_STORAGE_KEY);
  applyTheme(getThemePreference({ storage }), { doc, win });

  let mql = null;
  try {
    mql = win?.matchMedia?.(DARK_MEDIA_QUERY) || null;
  } catch {
    mql = null;
  }

  if (!mql) {
    return () => {};
  }

  const onChange = (event) => {
    if (getThemePreference({ storage }) !== THEME_MODES.SYSTEM) return;
    const prefersDark =
      typeof event?.matches === 'boolean' ? event.matches : Boolean(mql.matches);
    applyTheme(THEME_MODES.SYSTEM, { doc, win, systemPrefersDark: prefersDark });
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(onChange);
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', onChange);
    } else if (typeof mql.removeListener === 'function') {
      mql.removeListener(onChange);
    }
    if (cleanup === activeDefaultCleanup) {
      activeDefaultCleanup = null;
    }
  };

  if (isDefaultWindow) {
    activeDefaultCleanup = cleanup;
  }

  return cleanup;
}
