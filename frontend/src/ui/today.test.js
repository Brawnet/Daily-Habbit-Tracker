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
