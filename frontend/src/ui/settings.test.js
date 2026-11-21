import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockElement, MockDocument, createMemoryStorage } from './test-helpers.js';
import { THEME_STORAGE_KEY } from './theme.js';

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

describe('ui/settings.js Manage Habits Scheduled Time', () => {
  let mockDoc;
  let shellModule;
  let repoModule;
  let mount;

  async function mountSettingsWithHabits(initialHabits = []) {
    vi.resetModules();

    const habits = initialHabits.map((h) => ({ ...h }));
    const memoryStorage = createMemoryStorage();
    mockDoc = new MockDocument();
    mockDoc.documentElement = mockDoc.createElement('html');

    global.document = mockDoc;
    global.HTMLElement = MockElement;
    global.localStorage = memoryStorage;
    global.window = {
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    };

    shellModule = {
      showToast: vi.fn(),
      navigate: vi.fn(),
    };
    repoModule = {
      listHabits: vi.fn(async ({ includeArchived = false } = {}) => {
        const list = includeArchived ? habits : habits.filter((h) => !h.archived);
        return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }),
      addHabit: vi.fn(async (name, { linkedActivity = null, scheduledTime = '' } = {}) => {
        const created = {
          id: `h-${habits.length + 1}`,
          name,
          sortOrder: habits.length + 1,
          archived: false,
          linkedActivity,
          scheduledTime,
          createdAt: '2026-10-20T00:00:00Z',
        };
        habits.push(created);
        return created;
      }),
      renameHabit: vi.fn(async (id, name, linkedActivity, scheduledTime) => {
        const target = habits.find((h) => h.id === id);
        if (!target) throw new Error('Not found');
        target.name = name;
        if (linkedActivity !== undefined) target.linkedActivity = linkedActivity;
        if (scheduledTime !== undefined) target.scheduledTime = scheduledTime;
        return { ...target };
      }),
      moveHabit: vi.fn(async () => [...habits]),
      setHabitArchived: vi.fn(async (id, archived) => {
        const target = habits.find((h) => h.id === id);
        if (target) target.archived = Boolean(archived);
        return target;
      }),
      getSetting: vi.fn(async () => '20:00'),
      setSetting: vi.fn(),
      onChange: vi.fn(() => () => {}),
    };

    vi.doMock('./shell.js', () => shellModule);
    vi.doMock('../data/repo.js', () => repoModule);
    vi.doMock('../data/config.js', () => ({
      getConfig: () => ({ gasUrl: '', pin: '', deviceId: 'dev-1' }),
      setConfig: vi.fn(),
      isValidGasUrl: vi.fn(() => true),
    }));
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
    await new Promise((r) => setTimeout(r, 20));
    return { root, cleanup, habits };
  }

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    delete global.localStorage;
    delete global.window;
    vi.restoreAllMocks();
  });

  it('supports setting and clearing optional Scheduled Time when adding a Habit in Settings', async () => {
    const { cleanup } = await mountSettingsWithHabits();

    const nameInput = mockDoc.getElementById('input-new-habit');
    const timeInput = mockDoc.getElementById('input-new-habit-time');
    const clearBtn = mockDoc.getElementById('btn-clear-new-habit-time');
    const addBtn = mockDoc.getElementById('btn-add-habit');

    expect(nameInput).not.toBeNull();
    expect(timeInput).not.toBeNull();
    expect(timeInput.type).toBe('time');
    expect(timeInput.style.fontSize).toBe('16px');
    expect(timeInput.classList.contains('min-h-[44px]')).toBe(true);
    expect(clearBtn).not.toBeNull();
    expect(clearBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(clearBtn.classList.contains('min-w-[44px]')).toBe(true);

    // Clear button resets time input back to ''
    timeInput.value = '09:00';
    clearBtn.click();
    expect(timeInput.value).toBe('');

    // Submit with Scheduled Time '05:00'
    nameInput.value = 'Journaling';
    timeInput.value = '05:00';
    addBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Journaling', {
      linkedActivity: null,
      scheduledTime: '05:00',
    });
    expect(timeInput.value).toBe('');

    cleanup();
  });

  it('mirrors Today grouping (Scheduled chronological above Anytime), shows explanatory note, locks timed move buttons with tap toast, and renders linkedActivity badge cleanly', async () => {
    const { root, cleanup } = await mountSettingsWithHabits([
      { id: 'any-1', name: 'Drink Water', sortOrder: 1, archived: false, scheduledTime: '' },
      { id: 'sched-late', name: 'Evening Walk', sortOrder: 2, archived: false, scheduledTime: '21:00' },
      { id: 'any-2', name: 'Stretch', sortOrder: 3, archived: false, scheduledTime: '' },
      { id: 'sched-early', name: 'Journaling', sortOrder: 4, archived: false, scheduledTime: '05:00', linkedActivity: 'journal' },
    ]);

    const activeList = mockDoc.getElementById('active-habits-list');
    const scheduledGroup = mockDoc.getElementById('settings-scheduled-habits-group');
    const anytimeGroup = mockDoc.getElementById('settings-anytime-habits-group');
    const noteEl = mockDoc.getElementById('settings-scheduled-order-note');

    expect(scheduledGroup).not.toBeNull();
    expect(anytimeGroup).not.toBeNull();
    expect(noteEl).not.toBeNull();
    expect(noteEl.textContent).toBe(
      "Scheduled habits follow clock order automatically. Clear a habit's time to reorder it manually."
    );

    // Scheduled group renders before Anytime group
    expect(activeList.children[0]).toBe(scheduledGroup);
    expect(activeList.children[1]).toBe(anytimeGroup);

    const scheduledRows = scheduledGroup.querySelectorAll('.habit-row');
    expect(scheduledRows.map((r) => r.dataset.habitId)).toEqual(['sched-early', 'sched-late']);
    expect(scheduledRows[0].querySelector('.habit-scheduled-time-badge').textContent.length).toBeGreaterThan(0);
    expect(scheduledRows[0].textContent).toContain('Journal');

    // Timed row ▲ / ▼ must be aria-disabled="true" (NOT disabled) and trigger explanatory toast on click
    const earlyUp = scheduledRows[0].querySelector('.btn-move-up');
    const earlyDown = scheduledRows[0].querySelector('.btn-move-down');
    expect(earlyUp.getAttribute('aria-disabled')).toBe('true');
    expect(earlyDown.getAttribute('aria-disabled')).toBe('true');
    expect(earlyUp.disabled).toBe(false);
    expect(earlyDown.disabled).toBe(false);

    earlyUp.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(repoModule.moveHabit).not.toHaveBeenCalled();
    expect(shellModule.showToast).toHaveBeenCalledWith(
      'Scheduled habits follow clock order — clear time to reorder'
    );

    earlyDown.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(repoModule.moveHabit).not.toHaveBeenCalled();

    // Anytime group bounds and moves
    const anytimeRows = anytimeGroup.querySelectorAll('.habit-row');
    expect(anytimeRows.map((r) => r.dataset.habitId)).toEqual(['any-1', 'any-2']);

    const any1Up = anytimeRows[0].querySelector('.btn-move-up');
    const any1Down = anytimeRows[0].querySelector('.btn-move-down');
    const any2Up = anytimeRows[1].querySelector('.btn-move-up');
    const any2Down = anytimeRows[1].querySelector('.btn-move-down');

    expect(any1Up.disabled).toBe(true);
    expect(any1Down.disabled).toBe(false);
    expect(any2Up.disabled).toBe(false);
    expect(any2Down.disabled).toBe(true);

    any2Up.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(repoModule.moveHabit).toHaveBeenCalledWith('any-2', 'up');

    cleanup();
  });

  it('supports changing and clearing Scheduled Time in inline Edit without premature blur submit, and aborts on Cancel/Escape', async () => {
    const { cleanup } = await mountSettingsWithHabits([
      { id: 'h-1', name: 'Journaling', sortOrder: 1, archived: false, scheduledTime: '05:00', linkedActivity: 'journal' },
    ]);

    const row = mockDoc.getElementById('settings-scheduled-habits-group').querySelector('.habit-row');
    row.querySelector('.btn-edit').click();

    const form = row.querySelector('.rename-form');
    const nameInput = row.querySelector('.rename-input');
    const timeInput = row.querySelector('.input-edit-scheduled-time');
    const clearTimeBtn = row.querySelector('.btn-clear-edit-time');
    const linkedSelect = row.querySelector('.select-edit-linked-activity');
    const cancelBtn = row.querySelector('.btn-cancel-edit');

    expect(form).not.toBeNull();
    expect(nameInput).not.toBeNull();
    expect(timeInput).not.toBeNull();
    expect(timeInput.value).toBe('05:00');
    expect(timeInput.style.fontSize).toBe('16px');
    expect(clearTimeBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();

    // Blur on name input must NOT close/commit the edit form prematurely
    nameInput.dispatchEvent({ type: 'blur' });
    await new Promise((r) => setTimeout(r, 20));
    expect(repoModule.renameHabit).not.toHaveBeenCalled();
    expect(row.querySelector('.rename-form')).not.toBeNull();

    // Test Cancel aborts without saving
    cancelBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(repoModule.renameHabit).not.toHaveBeenCalled();

    // Re-open, clear time, and submit -> clears scheduledTime to '' and unlocks moves
    const rowReopened = mockDoc.getElementById('settings-scheduled-habits-group').querySelector('.habit-row');
    rowReopened.querySelector('.btn-edit').click();
    const form2 = rowReopened.querySelector('.rename-form');
    const clearBtn2 = rowReopened.querySelector('.btn-clear-edit-time');
    clearBtn2.click();
    expect(rowReopened.querySelector('.input-edit-scheduled-time').value).toBe('');

    form2.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.renameHabit).toHaveBeenCalledWith('h-1', 'Journaling', 'journal', '');

    // After clearing scheduledTime, habit now lives under Anytime group
    expect(mockDoc.getElementById('settings-scheduled-habits-group')).toBeNull();
    expect(mockDoc.getElementById('settings-anytime-habits-group')).not.toBeNull();

    cleanup();
  });
});
