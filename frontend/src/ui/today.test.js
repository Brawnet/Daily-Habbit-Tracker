import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';

describe('ui/today.js empty state & first-launch onboarding', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;

    // Mock day
    vi.doMock('../domain/day.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        today: () => '2026-10-21',
        formatLong: () => 'Wednesday, October 21, 2026',
      };
    });

    // Mock shell
    shellModule = {
      navigate: vi.fn(),
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    // Mock repo
    let habitsList = [];
    let listeners = new Set();
    repoModule = {
      listHabits: vi.fn(async () => [...habitsList]),
      getCheckInDays: vi.fn(async () => new Set()),
      toggleCheckIn: vi.fn(async () => {}),
      getJournalEntry: vi.fn(async () => null),
      saveJournalEntry: vi.fn(async () => {}),
      addHabit: vi.fn(async (name) => {
        const trimmed = (name || '').trim();
        if (!trimmed) throw new Error('Habit name cannot be empty');
        const h = { id: `h-${Date.now()}`, name: trimmed, sortOrder: habitsList.length };
        habitsList.push(h);
        for (const l of listeners) l();
        return h;
      }),
      onChange: vi.fn((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
      _setHabits: (h) => {
        habitsList = h;
      },
      _triggerChange: () => {
        for (const l of listeners) l();
      },
    };

    vi.doMock('../data/repo.js', () => repoModule);

    const todayModule = await import('./today.js');
    mount = todayModule.mount;
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('renders welcoming empty state with friendly message when no habits exist', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    // Wait for async renderHabits
    await new Promise((r) => setTimeout(r, 20));

    const emptyContainer = mockDoc.getElementById('habits-empty-state');
    expect(emptyContainer).toBeDefined();

    const subtitle = mockDoc.getElementById('today-empty-subtitle');
    expect(subtitle).toBeDefined();
    expect(subtitle.textContent).toContain('Start building your daily momentum');
    expect(subtitle.textContent).toContain('stays on this Device');

    const input = mockDoc.getElementById('today-empty-add-input');
    expect(input).toBeDefined();
    expect(input.placeholder).toBeTruthy();

    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    expect(addBtn).toBeDefined();
    expect(addBtn.textContent).toBe('Add Habit');

    const manageBtn = mockDoc.getElementById('manage-habits-btn');
    expect(manageBtn).toBeDefined();
    expect(manageBtn.textContent).toContain('Manage Habits');
  });

  it('allows adding habit inline by clicking Add Habit button', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');

    input.value = 'Drink 2L Water';
    addBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Drink 2L Water');
  });

  it('allows adding habit inline by pressing Enter key in the input', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    input.value = 'Morning Meditation';

    input.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      preventDefault: () => {},
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Morning Meditation');
  });

  it('fills habit name and focuses Scheduled Time when clicking a starter chip without auto-creating', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const timeTrigger = mockDoc.getElementById('today-empty-scheduled-time');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    const chips = root.querySelectorAll('[data-starter-chip]');

    expect(timeTrigger).not.toBeNull();
    expect(timeTrigger.tagName).toBe('BUTTON');
    expect(timeTrigger.textContent).toContain('Anytime');
    expect(chips.length).toBeGreaterThanOrEqual(3);

    const focusSpy = vi.spyOn(timeTrigger, 'focus');
    chips[0].click();

    await new Promise((r) => setTimeout(r, 20));

    expect(input.value).toBe(chips[0].dataset.starterChip);
    expect(focusSpy).toHaveBeenCalled();
    expect(mockDoc.activeElement).toBe(timeTrigger);
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(repoModule.addHabit).not.toHaveBeenCalled();

    // Clicking Add Habit immediately creates the Habit as Anytime
    addBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith(chips[0].dataset.starterChip);
  });

  it('allows setting optional Scheduled Time on Welcome form via custom popover', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const timeTrigger = mockDoc.getElementById('today-empty-scheduled-time');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');

    input.value = 'Morning Walk';
    timeTrigger.click();
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('true');

    const dialog = root.querySelector('#today-empty-form [role="dialog"]') || root.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const amBtn = dialog.querySelector('[data-period="AM"]');
    if (amBtn) {
      amBtn.click();
      dialog.querySelector('[data-hour="6"]').click();
    } else {
      dialog.querySelector('[data-hour="06"]').click();
    }
    dialog.querySelector('[data-minute="30"]').click();
    dialog.querySelector('.time-picker-done-btn').click();

    expect(timeTrigger.dataset.time).toBe('06:30');

    addBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Morning Walk', { scheduledTime: '06:30' });
  });

  it('navigates to settings when Manage Habits link is clicked', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const manageBtn = mockDoc.getElementById('manage-habits-btn');
    expect(manageBtn).toBeDefined();
    manageBtn.click();

    expect(shellModule.navigate).toHaveBeenCalledWith('settings');
  });

  it('ensures interactive elements on empty state satisfy min 44x44px touch targets', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const timeTrigger = mockDoc.getElementById('today-empty-scheduled-time');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    const manageBtn = mockDoc.getElementById('manage-habits-btn');
    const chips = root.querySelectorAll('[data-starter-chip]');

    expect(input.classList.contains('min-h-[44px]')).toBe(true);
    expect(input.classList.contains('min-w-[44px]')).toBe(true);
    expect(timeTrigger.classList.contains('min-h-[44px]')).toBe(true);
    expect(timeTrigger.classList.contains('min-w-[44px]')).toBe(true);
    expect(addBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(addBtn.classList.contains('min-w-[44px]')).toBe(true);
    expect(manageBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(manageBtn.classList.contains('min-w-[44px]')).toBe(true);
    for (const chip of chips) {
      expect(chip.classList.contains('min-h-[44px]')).toBe(true);
      expect(chip.classList.contains('min-w-[44px]')).toBe(true);
    }
  });

  it('prevents duplicate habit creation on rapid concurrent clicks', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');

    input.value = 'Fast Double Click';
    // Trigger rapid clicks before promise settles
    addBtn.click();
    addBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledTimes(1);
  });
});

describe('ui/today.js persistent quick-add when habits exist', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;

    vi.doMock('../domain/day.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        today: () => '2026-10-21',
        formatLong: () => 'Wednesday, October 21, 2026',
      };
    });

    shellModule = {
      navigate: vi.fn(),
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    let habitsList = [
      { id: 'h-1', name: 'Drink 2L Water', sortOrder: 0 },
      { id: 'h-2', name: 'Read 10 mins', sortOrder: 1 },
    ];
    let listeners = new Set();
    repoModule = {
      listHabits: vi.fn(async () => [...habitsList]),
      getCheckInDays: vi.fn(async () => new Set(['2026-10-21'])),
      toggleCheckIn: vi.fn(async () => {}),
      getJournalEntry: vi.fn(async () => null),
      saveJournalEntry: vi.fn(async () => {}),
      addHabit: vi.fn(async (name) => {
        const trimmed = (name || '').trim();
        if (!trimmed) throw new Error('Habit name cannot be empty');
        const h = { id: `h-${Date.now()}`, name: trimmed, sortOrder: habitsList.length };
        habitsList.push(h);
        for (const l of listeners) l();
        return h;
      }),
      onChange: vi.fn((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
      _setHabits: (h) => {
        habitsList = h;
      },
    };
    vi.doMock('../data/repo.js', () => repoModule);

    const mod = await import('./today.js');
    mount = mod.mount;
  });

  it('renders collapsed + Add Habit trigger and Manage in Settings link when habits exist', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    // Empty state should NOT be rendered
    expect(mockDoc.getElementById('habits-empty-state')).toBeNull();

    // + Add Habit trigger button should be rendered
    const triggerBtn = mockDoc.getElementById('today-add-habit-trigger');
    expect(triggerBtn).not.toBeNull();
    expect(triggerBtn.textContent).toContain('Add Habit');
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');

    // Manage in settings link should be rendered
    const manageLink = mockDoc.getElementById('today-manage-habits-link');
    expect(manageLink).not.toBeNull();
    expect(manageLink.textContent).toContain('Manage & reorder in Settings →');

    manageLink.click();
    expect(shellModule.navigate).toHaveBeenCalledWith('settings');
  });

  it('expands form on trigger click, focuses input, and collapses on Cancel or Escape', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const triggerBtn = mockDoc.getElementById('today-add-habit-trigger');
    expect(triggerBtn).not.toBeNull();

    // Click trigger to expand
    triggerBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    // Form elements should now exist
    const form = mockDoc.getElementById('today-add-habit-form');
    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');
    const cancelBtn = mockDoc.getElementById('today-add-habit-cancel');

    expect(form).not.toBeNull();
    expect(input).not.toBeNull();
    expect(submitBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
    expect(mockDoc.getElementById('today-add-habit-trigger')).toBeNull();

    // Click Cancel to collapse
    cancelBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockDoc.getElementById('today-add-habit-form')).toBeNull();
    const restoredTrigger = mockDoc.getElementById('today-add-habit-trigger');
    expect(restoredTrigger).not.toBeNull();

    // Re-expand and press Escape
    restoredTrigger.click();
    await new Promise((r) => setTimeout(r, 20));

    const inputAgain = mockDoc.getElementById('today-add-habit-input');
    const formAgain = mockDoc.getElementById('today-add-habit-form');
    expect(inputAgain).not.toBeNull();

    inputAgain.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(mockDoc.getElementById('today-add-habit-form')).toBeNull();
    expect(mockDoc.getElementById('today-add-habit-trigger')).not.toBeNull();
  });

  it('creates habit on Add button click with trimmed text and displays toast', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');

    input.value = '  Journaling 15m  ';
    submitBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Journaling 15m');
    expect(shellModule.showToast).toHaveBeenCalledWith('Habit "Journaling 15m" created!');

    // Form should be collapsed back to trigger
    expect(mockDoc.getElementById('today-add-habit-form')).toBeNull();
    expect(mockDoc.getElementById('today-add-habit-trigger')).not.toBeNull();
  });

  it('creates habit on Enter keydown in input', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-add-habit-input');
    input.value = 'Evening stretch';

    input.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      preventDefault: () => {},
      stopPropagation: () => {},
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Evening stretch');
    expect(shellModule.showToast).toHaveBeenCalledWith('Habit "Evening stretch" created!');
  });

  it('ignores empty and whitespace-only input without calling addHabit', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');

    input.value = '   ';
    submitBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).not.toHaveBeenCalled();
  });

  it('prevents duplicate habit creation on rapid concurrent clicks in expanded form', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');

    input.value = 'Rapid Tap Habit';
    submitBtn.click();
    submitBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledTimes(1);
  });

  it('satisfies touch target minimums (44x44px) and ARIA attributes', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const triggerBtn = mockDoc.getElementById('today-add-habit-trigger');
    const manageLink = mockDoc.getElementById('today-manage-habits-link');

    expect(triggerBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(triggerBtn.classList.contains('min-w-[44px]')).toBe(true);
    expect(manageLink.classList.contains('min-h-[44px]')).toBe(true);
    expect(manageLink.classList.contains('min-w-[44px]')).toBe(true);
    expect(triggerBtn.getAttribute('aria-label')).toBe('+ Add Habit');
    expect(manageLink.getAttribute('role')).toBe('link');
    expect(manageLink.getAttribute('aria-label')).toBe('Manage and reorder habits in Settings');
    // Expand form
    triggerBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    const form = mockDoc.getElementById('today-add-habit-form');
    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');
    const cancelBtn = mockDoc.getElementById('today-add-habit-cancel');

    expect(form.getAttribute('role')).toBe('form');
    expect(form.getAttribute('aria-label')).toBe('Add new habit');
    expect(input.getAttribute('aria-label')).toBe('New habit name');
    expect(input.style.fontSize).toBe('16px');
    expect(input.classList.contains('min-h-[44px]')).toBe(true);
    expect(input.classList.contains('min-w-[44px]')).toBe(true);
    expect(submitBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(submitBtn.classList.contains('min-w-[44px]')).toBe(true);
    expect(submitBtn.getAttribute('aria-label')).toBe('Add habit');
    expect(cancelBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(cancelBtn.classList.contains('min-w-[44px]')).toBe(true);
    expect(cancelBtn.getAttribute('aria-label')).toBe('Cancel adding habit');
  });

  it('retains input value and displays error toast when addHabit rejects', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    repoModule.addHabit.mockRejectedValueOnce(new Error('Storage failure'));

    const input = mockDoc.getElementById('today-add-habit-input');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');

    input.value = 'Unsaved Habit';
    submitBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Unsaved Habit');
    expect(shellModule.showToast).toHaveBeenCalledWith('Failed to create habit: Storage failure');
    expect(mockDoc.getElementById('today-add-habit-form')).not.toBeNull();
    expect(mockDoc.getElementById('today-add-habit-input').value).toBe('Unsaved Habit');
  });

  it('does not render the daily journal textarea on the Today tab', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const journalInput = mockDoc.getElementById('today-journal-input');
    expect(journalInput).toBeNull();
    cleanup();
  });

  it('supports linking habit to activity and navigates to activities on badge click', async () => {
    repoModule._setHabits([
      { id: 'h-1', name: 'Read Book', sortOrder: 0, linkedActivity: 'book_summary' },
    ]);

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const badge = root.querySelector('.habit-activity-link');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Book Summary');

    badge.click();
    expect(shellModule.navigate).toHaveBeenCalledWith('activities');

    // Open add habit form and verify linked activity selector
    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const select = mockDoc.getElementById('today-add-habit-linked-activity');
    expect(select).not.toBeNull();
    select.value = 'book_summary';

    const input = mockDoc.getElementById('today-add-habit-input');
    input.value = 'Atomic Reading';
    mockDoc.getElementById('today-add-habit-submit').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalledWith('Atomic Reading', {
      linkedActivity: 'book_summary',
    });

    cleanup();
  });

  it('supports linking habit to journal and navigates with subview=journal on badge click', async () => {
    repoModule._setHabits([
      { id: 'h-2', name: 'Daily Reflection', sortOrder: 0, linkedActivity: 'journal' },
    ]);

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const badge = root.querySelector('.habit-activity-link');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Journal');

    badge.click();
    expect(shellModule.navigate).toHaveBeenCalledWith('activities');

    cleanup();
  });
});

describe('ui/today.js Scheduled Time', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;

    vi.doMock('../domain/day.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        today: () => '2026-10-21',
        formatLong: () => 'Wednesday, October 21, 2026',
      };
    });

    shellModule = {
      navigate: vi.fn(),
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    let habitsList = [];
    let checkedIds = new Set();
    const listeners = new Set();
    repoModule = {
      listHabits: vi.fn(async () => [...habitsList]),
      getCheckInDays: vi.fn(async (id) =>
        checkedIds.has(id) ? new Set(['2026-10-21']) : new Set()
      ),
      toggleCheckIn: vi.fn(async () => {}),
      addHabit: vi.fn(async (name, { linkedActivity = null, scheduledTime = '' } = {}) => {
        const trimmed = (name || '').trim();
        if (!trimmed) throw new Error('Habit name cannot be empty');
        const h = {
          id: `h-${habitsList.length + 1}`,
          name: trimmed,
          sortOrder: habitsList.length,
          linkedActivity,
          scheduledTime,
        };
        habitsList.push(h);
        for (const l of listeners) l();
        return h;
      }),
      onChange: vi.fn((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
      _setHabits: (h) => {
        habitsList = h;
      },
      _setChecked: (ids) => {
        checkedIds = new Set(ids);
      },
    };
    vi.doMock('../data/repo.js', () => repoModule);

    const mod = await import('./today.js');
    mount = mod.mount;
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('orders timed Habits chronologically (ties by sortOrder) before Anytime Habits and renders conditional Anytime header', async () => {
    repoModule._setHabits([
      { id: 'any-2', name: 'Untimed B', sortOrder: 5, scheduledTime: '' },
      { id: 'night', name: 'Evening Walk', sortOrder: 0, scheduledTime: '21:00' },
      { id: 'morning-2', name: 'Stretch', sortOrder: 4, scheduledTime: '05:00' },
      { id: 'any-1', name: 'Drink Water', sortOrder: 1, scheduledTime: '' },
      { id: 'morning-1', name: 'Journaling', sortOrder: 2, scheduledTime: '05:00', linkedActivity: 'journal' },
    ]);
    // Check off earliest Habit to verify checked-in items stay in their chronological slot
    repoModule._setChecked(['morning-1']);

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const container = mockDoc.getElementById('habits-list-container');
    const items = container.querySelectorAll('li');
    expect(items.map((el) => el.dataset.habitId)).toEqual([
      'morning-1',
      'morning-2',
      'night',
      'any-1',
      'any-2',
    ]);

    const anytimeHeading = mockDoc.getElementById('today-anytime-heading');
    expect(anytimeHeading).not.toBeNull();
    expect(anytimeHeading.textContent).toBe('Anytime');

    const firstTimeEl = items[0].querySelector('.habit-scheduled-time');
    expect(firstTimeEl).not.toBeNull();
    expect(firstTimeEl.dataset.scheduledTime).toBe('05:00');
    expect(firstTimeEl.textContent.length).toBeGreaterThan(0);

    // Linked activity badge still renders alongside Scheduled Time on secondary metadata line
    expect(items[0].querySelector('.habit-activity-link')).not.toBeNull();

    // Checked-in Habit remains in first slot with check button pressed
    const firstCheckBtn = items[0].querySelector('[data-action="toggle-checkin"]');
    expect(firstCheckBtn.getAttribute('aria-pressed')).toBe('true');

    // Anytime items have no scheduled time label
    expect(items[3].querySelector('.habit-scheduled-time')).toBeNull();

    cleanup();
  });

  it('omits Anytime header when all Habits are timed or all Habits are untimed', async () => {
    repoModule._setHabits([
      { id: 't2', name: 'Night', sortOrder: 0, scheduledTime: '22:00' },
      { id: 't1', name: 'Dawn', sortOrder: 1, scheduledTime: '05:00' },
    ]);

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockDoc.getElementById('today-anytime-heading')).toBeNull();
    expect(mockDoc.getElementById('habits-list-container').querySelectorAll('li').map((el) => el.dataset.habitId)).toEqual([
      't1',
      't2',
    ]);
    cleanup();

    repoModule._setHabits([
      { id: 'u1', name: 'Water', sortOrder: 0, scheduledTime: '' },
      { id: 'u2', name: 'Read', sortOrder: 1 },
    ]);
    const root2 = mockDoc.createElement('div');
    const cleanup2 = mount(root2);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockDoc.getElementById('today-anytime-heading')).toBeNull();
    cleanup2();
  });

  it('supports optional custom time picker and popover Clear in + Add Habit form without breaking untimed adds', async () => {
    function pickTime(formEl, hour24, minuteStr) {
      const dialog = formEl.querySelector('[role="dialog"]');
      const pmBtn = dialog.querySelector('[data-period="PM"]');
      const amBtn = dialog.querySelector('[data-period="AM"]');
      if (pmBtn && amBtn) {
        if (hour24 >= 12) pmBtn.click();
        else amBtn.click();
        const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        dialog.querySelector(`[data-hour="${h12}"]`).click();
      } else {
        dialog.querySelector(`[data-hour="${String(hour24).padStart(2, '0')}"]`).click();
      }
      dialog.querySelector(`[data-minute="${minuteStr}"]`).click();
    }

    repoModule._setHabits([{ id: 'h-init', name: 'Existing', sortOrder: 0 }]);

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    // 1. Add Habit with scheduledTime and linkedActivity
    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const form1 = mockDoc.getElementById('today-add-habit-form');
    const nameInput = mockDoc.getElementById('today-add-habit-input');
    const timeTrigger = mockDoc.getElementById('today-add-habit-scheduled-time');
    const linkedSelect = mockDoc.getElementById('today-add-habit-linked-activity');
    const submitBtn = mockDoc.getElementById('today-add-habit-submit');

    expect(timeTrigger).not.toBeNull();
    expect(timeTrigger.tagName).toBe('BUTTON');
    expect(timeTrigger.classList.contains('min-h-[44px]')).toBe(true);
    expect(timeTrigger.classList.contains('min-w-[44px]')).toBe(true);

    timeTrigger.click();
    const clearBtn = form1.querySelector('.time-picker-clear-btn');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(clearBtn.classList.contains('min-w-[44px]')).toBe(true);

    pickTime(form1, 5, '00');
    form1.querySelector('.time-picker-done-btn').click();
    expect(timeTrigger.dataset.time).toBe('05:00');

    // Escape closes open popover first without collapsing form; second Escape collapses form
    timeTrigger.click();
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('true');
    mockDoc.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(timeTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(mockDoc.getElementById('today-add-habit-form')).not.toBeNull();

    nameInput.value = 'Journaling';
    linkedSelect.value = 'journal';
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenLastCalledWith('Journaling', {
      linkedActivity: 'journal',
      scheduledTime: '05:00',
    });

    // 2. Add Habit with scheduledTime only
    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const form2 = mockDoc.getElementById('today-add-habit-form');
    mockDoc.getElementById('today-add-habit-input').value = 'Walk';
    mockDoc.getElementById('today-add-habit-scheduled-time').click();
    pickTime(form2, 18, '30');
    form2.querySelector('.time-picker-done-btn').click();
    mockDoc.getElementById('today-add-habit-submit').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenLastCalledWith('Walk', {
      scheduledTime: '18:30',
    });

    // 3. Clearing scheduledTime in popover resets value back to '' and calls single-arg addHabit
    mockDoc.getElementById('today-add-habit-trigger').click();
    await new Promise((r) => setTimeout(r, 20));

    const form3 = mockDoc.getElementById('today-add-habit-form');
    const trigger3 = mockDoc.getElementById('today-add-habit-scheduled-time');
    trigger3.click();
    pickTime(form3, 7, '00');
    expect(trigger3.dataset.time).toBe('07:00');
    form3.querySelector('.time-picker-clear-btn').click();
    expect(trigger3.dataset.time).toBe('');

    mockDoc.getElementById('today-add-habit-input').value = 'Hydrate';
    mockDoc.getElementById('today-add-habit-submit').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenLastCalledWith('Hydrate');

    cleanup();
  });
});
