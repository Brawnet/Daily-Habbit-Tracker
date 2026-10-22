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

  it('renders 1-tap starter chips and creates habit on chip click', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const chips = root.querySelectorAll('[data-starter-chip]');
    expect(chips.length).toBeGreaterThanOrEqual(3);

    // Click the first chip
    chips[0].click();

    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.addHabit).toHaveBeenCalled();
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
    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    const manageBtn = mockDoc.getElementById('manage-habits-btn');
    const chips = root.querySelectorAll('[data-starter-chip]');

    expect(input.classList.contains('min-h-[44px]')).toBe(true);
    expect(input.classList.contains('min-w-[44px]')).toBe(true);
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
});
