import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockDocument, createMemoryStorage } from './test-helpers.js';
import {
  THEME_STORAGE_KEY,
  THEME_MODES,
  THEME_COLORS,
  normalizeTheme,
  resolveTheme,
  getThemePreference,
  setThemePreference,
  applyTheme,
  initTheme,
} from './theme.js';

function createThemeTestEnv({ initialStorage = {}, prefersDark = false } = {}) {
  const storage = createMemoryStorage(initialStorage);
  const doc = new MockDocument();
  const root = doc.createElement('html');
  doc.documentElement = root;
  const meta = doc.createElement('meta');
  meta.id = 'meta-theme-color';
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', THEME_COLORS.light);

  let currentMatches = prefersDark;
  const listeners = new Set();
  const mql = {
    media: '(prefers-color-scheme: dark)',
    get matches() {
      return currentMatches;
    },
    addEventListener: vi.fn((type, handler) => {
      if (type === 'change') listeners.add(handler);
    }),
    removeEventListener: vi.fn((type, handler) => {
      if (type === 'change') listeners.delete(handler);
    }),
  };

  const win = {
    matchMedia: vi.fn((query) => {
      if (query === '(prefers-color-scheme: dark)') return mql;
      return { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }),
    _setPrefersDark(next) {
      currentMatches = Boolean(next);
      for (const handler of [...listeners]) {
        handler({ matches: currentMatches, media: '(prefers-color-scheme: dark)' });
      }
    },
    _listenerCount() {
      return listeners.size;
    },
  };

  return { storage, doc, root, meta, win, mql };
}

describe('ui/theme.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeTheme & resolveTheme', () => {
    it('normalizes valid values and falls back to system for invalid inputs', () => {
      expect(normalizeTheme('light')).toBe(THEME_MODES.LIGHT);
      expect(normalizeTheme('dark')).toBe(THEME_MODES.DARK);
      expect(normalizeTheme('system')).toBe(THEME_MODES.SYSTEM);
      expect(normalizeTheme('')).toBe(THEME_MODES.SYSTEM);
      expect(normalizeTheme(null)).toBe(THEME_MODES.SYSTEM);
      expect(normalizeTheme(undefined)).toBe(THEME_MODES.SYSTEM);
      expect(normalizeTheme('sepia')).toBe(THEME_MODES.SYSTEM);
    });

    it('resolves effective theme from preference and OS dark mode', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('light', false)).toBe('light');
      expect(resolveTheme('dark', false)).toBe('dark');
      expect(resolveTheme('dark', true)).toBe('dark');
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
      expect(resolveTheme('invalid', true)).toBe('dark');
    });
  });

  describe('getThemePreference', () => {
    it('defaults to system when missing and reads valid stored values', () => {
      const emptyStorage = createMemoryStorage();
      expect(getThemePreference({ storage: emptyStorage })).toBe('system');

      expect(getThemePreference({ storage: createMemoryStorage({ [THEME_STORAGE_KEY]: 'dark' }) })).toBe('dark');
      expect(getThemePreference({ storage: createMemoryStorage({ [THEME_STORAGE_KEY]: 'light' }) })).toBe('light');
      expect(getThemePreference({ storage: createMemoryStorage({ [THEME_STORAGE_KEY]: 'system' }) })).toBe('system');
    });

    it('falls back to system on corrupted stored value or throwing storage', () => {
      const badStorage = createMemoryStorage({ [THEME_STORAGE_KEY]: 'midnight' });
      expect(getThemePreference({ storage: badStorage })).toBe('system');

      const throwingStorage = {
        getItem: () => {
          throw new Error('SecurityError');
        },
      };
      expect(getThemePreference({ storage: throwingStorage })).toBe('system');
    });
  });

  describe('applyTheme & setThemePreference', () => {
    it('applies dark class, data-theme, color-scheme, and theme-color meta for light/dark/system', () => {
      const { doc, root, meta, win } = createThemeTestEnv({ prefersDark: true });

      // Manual light overrides dark OS
      expect(applyTheme('light', { doc, win })).toBe('light');
      expect(root.classList.contains('dark')).toBe(false);
      expect(root.getAttribute('data-theme')).toBe('light');
      expect(root.style.colorScheme).toBe('light');
      expect(meta.getAttribute('content')).toBe('#F6F5F2');

      // Manual dark overrides light OS
      const lightOsEnv = createThemeTestEnv({ prefersDark: false });
      expect(applyTheme('dark', { doc: lightOsEnv.doc, win: lightOsEnv.win })).toBe('dark');
      expect(lightOsEnv.root.classList.contains('dark')).toBe(true);
      expect(lightOsEnv.root.getAttribute('data-theme')).toBe('dark');
      expect(lightOsEnv.root.style.colorScheme).toBe('dark');
      expect(lightOsEnv.meta.getAttribute('content')).toBe('#161514');

      // System follows OS
      expect(applyTheme('system', { doc, win })).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
      expect(meta.getAttribute('content')).toBe('#161514');
    });

    it('persists normalized preference to localStorage and still applies DOM if setItem throws', () => {
      const { storage, doc, root, meta, win } = createThemeTestEnv({ prefersDark: false });

      const resolved = setThemePreference('dark', { storage, doc, win });
      expect(resolved).toBe('dark');
      expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
      expect(meta.getAttribute('content')).toBe('#161514');

      const readOnlyStorage = {
        getItem: () => 'system',
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      };
      expect(() => setThemePreference('dark', { storage: readOnlyStorage, doc, win })).not.toThrow();
      expect(root.classList.contains('dark')).toBe(true);
    });
  });

  describe('initTheme', () => {
    it('applies stored preference on startup and reacts live only when set to system', () => {
      const env = createThemeTestEnv({
        initialStorage: { [THEME_STORAGE_KEY]: 'system' },
        prefersDark: false,
      });

      const cleanup = initTheme({ storage: env.storage, doc: env.doc, win: env.win });
      expect(env.root.classList.contains('dark')).toBe(false);
      expect(env.meta.getAttribute('content')).toBe('#F6F5F2');
      expect(env.win._listenerCount()).toBe(1);

      // OS switches to dark while preference is system -> updates live
      env.win._setPrefersDark(true);
      expect(env.root.classList.contains('dark')).toBe(true);
      expect(env.root.getAttribute('data-theme')).toBe('dark');
      expect(env.root.style.colorScheme).toBe('dark');
      expect(env.meta.getAttribute('content')).toBe('#161514');

      // User manually locks to light -> OS changes should be ignored
      setThemePreference('light', { storage: env.storage, doc: env.doc, win: env.win });
      env.win._setPrefersDark(false);
      env.win._setPrefersDark(true);
      expect(env.root.classList.contains('dark')).toBe(false);
      expect(env.meta.getAttribute('content')).toBe('#F6F5F2');

      // Cleanup detaches listener
      cleanup();
      expect(env.win._listenerCount()).toBe(0);
    });

    it('supports legacy addListener/removeListener MediaQueryList APIs', () => {
      const env = createThemeTestEnv({ prefersDark: false });
      let legacyHandler = null;
      const legacyMql = {
        matches: false,
        addListener: vi.fn((fn) => {
          legacyHandler = fn;
        }),
        removeListener: vi.fn((fn) => {
          if (legacyHandler === fn) legacyHandler = null;
        }),
      };
      const legacyWin = {
        matchMedia: vi.fn(() => legacyMql),
      };

      const cleanup = initTheme({ storage: env.storage, doc: env.doc, win: legacyWin });
      expect(legacyMql.addListener).toHaveBeenCalledTimes(1);

      legacyHandler({ matches: true });
      expect(env.root.classList.contains('dark')).toBe(true);

      cleanup();
      expect(legacyMql.removeListener).toHaveBeenCalledTimes(1);
    });

    it('ignores live OS theme changes after manual selection even when storage.setItem throws', () => {
      const env = createThemeTestEnv({ prefersDark: false });
      const readOnlyStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      };

      const cleanup = initTheme({ storage: readOnlyStorage, doc: env.doc, win: env.win });
      setThemePreference('light', { storage: readOnlyStorage, doc: env.doc, win: env.win });

      env.win._setPrefersDark(true);
      expect(getThemePreference({ storage: readOnlyStorage })).toBe('light');
      expect(env.root.classList.contains('dark')).toBe(false);
      expect(env.meta.getAttribute('content')).toBe('#F6F5F2');

      // Re-selecting 'system' re-enables live OS updates
      setThemePreference('system', { storage: readOnlyStorage, doc: env.doc, win: env.win });
      expect(env.root.classList.contains('dark')).toBe(true);
      expect(env.meta.getAttribute('content')).toBe('#161514');

      cleanup();
    });
  });
});
