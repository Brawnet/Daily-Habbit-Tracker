import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';
import { THEME_STORAGE_KEY } from './theme.js';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('ui/settings.js Appearance section', () => {
  let mockDoc;
  let metaThemeColor;
  let memoryStorage;
  let shellModule;
  let repoModule;
  let mount;

  async function mountSettings({ initialTheme, prefersDark = false } = {}) {
    vi.resetModules();

    const initial = {};
    if (initialTheme !== undefined) {
      initial[THEME_STORAGE_KEY] = initialTheme;
    }
    memoryStorage = createMemoryStorage(initial);
    mockDoc = new MockDocument();
    mockDoc.documentElement = mockDoc.createElement('html');
    metaThemeColor = mockDoc.createElement('meta');
    metaThemeColor.id = 'meta-theme-color';
    metaThemeColor.setAttribute('name', 'theme-color');
    metaThemeColor.setAttribute('content', '#F6F5F2');

    global.document = mockDoc;
    global.HTMLElement = MockElement;
    global.localStorage = memoryStorage;
    global.window = {
      matchMedia: vi.fn(() => ({
        matches: prefersDark,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    };

    shellModule = {
      showToast: vi.fn(),
      navigate: vi.fn(),
    };
    repoModule = {
      listHabits: vi.fn(async () => []),
      addHabit: vi.fn(),
      renameHabit: vi.fn(),
      moveHabit: vi.fn(),
      setHabitArchived: vi.fn(),
      getSetting: vi.fn(async () => '20:00'),
      setSetting: vi.fn(),
      onChange: vi.fn(() => () => {}),
    };

    vi.doMock('./shell.js', () => shellModule);
    vi.doMock('../data/repo.js', () => repoModule);
    vi.doMock('../data/api.js', () => ({ callApi: vi.fn() }));
    vi.doMock('../data/sync.js', () => ({
      syncNow: vi.fn(async () => {}),
      getSyncStatus: vi.fn(() => ({ state: 'not-configured', pending: 0, lastSyncedAt: null, error: null })),
      onSyncStatus: vi.fn(() => () => {}),
    }));
    vi.doMock('../pwa/install.js', () => ({
      getInstallState: vi.fn(() => 'unsupported'),
      promptInstall: vi.fn(async () => false),
      onInstallStateChange: vi.fn(() => () => {}),
    }));
    vi.doMock('../pwa/push.js', () => ({
      getPushState: vi.fn(async () => 'unsupported'),
      enablePush: vi.fn(async () => false),
      sendTestPush: vi.fn(async () => {}),
    }));

    const settingsMod = await import('./settings.js');
    mount = settingsMod.mount;

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    return { root, cleanup };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    delete global.localStorage;
    delete global.window;
    vi.restoreAllMocks();
  });

  it('renders Appearance section at the top of Settings above Sync with 44px radio options and defaults to System', async () => {
    const { root, cleanup } = await mountSettings();

    const wrapper = root.children[0];
    expect(wrapper).toBeDefined();
    expect(wrapper.children[0].tagName).toBe('HEADER');
    expect(wrapper.children[1].id).toBe('settings-appearance');
    expect(wrapper.children[2].innerHTML).toContain('id="settings-sync"');

    const group = mockDoc.getElementById('theme-segmented-control');
    expect(group).not.toBeNull();
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Theme');

    const optLight = mockDoc.getElementById('theme-option-light');
    const optDark = mockDoc.getElementById('theme-option-dark');
    const optSystem = mockDoc.getElementById('theme-option-system');

    expect(optLight).not.toBeNull();
    expect(optDark).not.toBeNull();
    expect(optSystem).not.toBeNull();

    for (const btn of [optLight, optDark, optSystem]) {
      expect(btn.getAttribute('role')).toBe('radio');
      expect(btn.classList.contains('min-h-[44px]')).toBe(true);
      expect(btn.classList.contains('min-w-[44px]')).toBe(true);
    }

    expect(optLight.getAttribute('aria-checked')).toBe('false');
    expect(optDark.getAttribute('aria-checked')).toBe('false');
    expect(optSystem.getAttribute('aria-checked')).toBe('true');
    expect(optSystem.getAttribute('tabindex')).toBe('0');
    expect(optLight.getAttribute('tabindex')).toBe('-1');

    cleanup();
  });

  it('switches immediately on Dark and Light click without toast or repo.setSetting sync', async () => {
    const { cleanup } = await mountSettings({ prefersDark: false });

    const optLight = mockDoc.getElementById('theme-option-light');
    const optDark = mockDoc.getElementById('theme-option-dark');
    const optSystem = mockDoc.getElementById('theme-option-system');

    optDark.click();

    expect(memoryStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(mockDoc.documentElement.classList.contains('dark')).toBe(true);
    expect(mockDoc.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(metaThemeColor.getAttribute('content')).toBe('#161514');
    expect(optDark.getAttribute('aria-checked')).toBe('true');
    expect(optDark.getAttribute('tabindex')).toBe('0');
    expect(optSystem.getAttribute('aria-checked')).toBe('false');
    expect(optSystem.getAttribute('tabindex')).toBe('-1');
    expect(shellModule.showToast).not.toHaveBeenCalled();
    expect(repoModule.setSetting).not.toHaveBeenCalled();

    optLight.click();

    expect(memoryStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(mockDoc.documentElement.classList.contains('dark')).toBe(false);
    expect(mockDoc.documentElement.getAttribute('data-theme')).toBe('light');
    expect(metaThemeColor.getAttribute('content')).toBe('#F6F5F2');
    expect(optLight.getAttribute('aria-checked')).toBe('true');
    expect(optDark.getAttribute('aria-checked')).toBe('false');
    expect(shellModule.showToast).not.toHaveBeenCalled();
    expect(repoModule.setSetting).not.toHaveBeenCalled();

    cleanup();
  });

  it('pre-selects previously persisted dark preference when mounted', async () => {
    const { cleanup } = await mountSettings({ initialTheme: 'dark' });

    expect(mockDoc.getElementById('theme-option-dark').getAttribute('aria-checked')).toBe('true');
    expect(mockDoc.getElementById('theme-option-light').getAttribute('aria-checked')).toBe('false');
    expect(mockDoc.getElementById('theme-option-system').getAttribute('aria-checked')).toBe('false');

    cleanup();
  });

  it('supports arrow key navigation with wrap-around across Light, Dark, and System', async () => {
    const { cleanup } = await mountSettings();

    const optLight = mockDoc.getElementById('theme-option-light');
    const optDark = mockDoc.getElementById('theme-option-dark');
    const optSystem = mockDoc.getElementById('theme-option-system');

    optLight.focus = vi.fn();
    optDark.focus = vi.fn();
    optSystem.focus = vi.fn();

    // Currently selected is System (index 2); ArrowRight wraps to Light (index 0)
    optSystem.dispatchEvent({
      type: 'keydown',
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    });
    expect(memoryStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(optLight.getAttribute('aria-checked')).toBe('true');
    expect(optLight.focus).toHaveBeenCalledTimes(1);

    // From Light (index 0), ArrowLeft wraps back to System (index 2)
    optLight.dispatchEvent({
      type: 'keydown',
      key: 'ArrowLeft',
      preventDefault: vi.fn(),
    });
    expect(memoryStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(optSystem.getAttribute('aria-checked')).toBe('true');
    expect(optSystem.focus).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
