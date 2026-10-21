import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MockClassList {
  constructor(el) {
    this.el = el;
    this.classes = new Set();
  }
  add(...names) {
    for (const name of names) {
      if (name) this.classes.add(name);
    }
    this.el._className = Array.from(this.classes).join(' ');
  }
  remove(...names) {
    for (const name of names) {
      this.classes.delete(name);
    }
    this.el._className = Array.from(this.classes).join(' ');
  }
  contains(name) {
    return this.classes.has(name);
  }
}

class MockElement {
  constructor(tagName, doc) {
    this.tagName = tagName.toUpperCase();
    this.doc = doc;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.parentElement = null;
    this._className = '';
    this.classList = new MockClassList(this);
    this._textContent = '';
    this._innerHTML = '';
    this._value = '';
    this.disabled = false;
    this._id = '';
    this.type = 'button';
  }

  get id() {
    return this._id;
  }
  set id(val) {
    this._id = String(val || '');
    this.attributes['id'] = this._id;
    if (this.doc && this._id) {
      this.doc.elementsById.set(this._id, this);
    }
  }

  get value() {
    return this._value;
  }
  set value(val) {
    this._value = String(val ?? '');
  }

  get className() {
    return this._className;
  }
  set className(val) {
    this._className = val || '';
    this.classList.classes.clear();
    for (const part of this._className.split(/\s+/)) {
      if (part) this.classList.classes.add(part);
    }
  }

  get textContent() {
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = String(val ?? '');
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = String(val ?? '');
    this.children = [];
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') {
      this.id = val;
    }
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(val);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') {
      if (this.doc && this._id) {
        this.doc.elementsById.delete(this._id);
      }
      this._id = '';
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const handler of handlers) {
      handler(event);
    }
    return true;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    this.dispatchEvent(event);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      let match = true;
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.id !== id && el.getAttribute('id') !== id) match = false;
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (!el.classList.contains(cls)) match = false;
      } else if (selector.includes('[data-action=')) {
        const action = selector.match(/\[data-action="?([^"\]]+)"?\]/)?.[1];
        if (el.dataset.action !== action) match = false;
      } else if (selector.includes('[data-starter-chip]')) {
        if (!('starterChip' in el.dataset)) match = false;
      }
      if (match && el !== this) results.push(el);

      for (const child of el.children) {
        check(child);
      }
    };
    check(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }
}

describe('ui/today.js empty state & first-launch onboarding', () => {
  let mockDoc;
  let repoModule;
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
    vi.doMock('./shell.js', () => ({
      navigate: vi.fn(),
      showToast: vi.fn(),
    }));

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
    expect(subtitle.textContent).toContain('stays on this device');

    const input = mockDoc.getElementById('today-empty-add-input');
    expect(input).toBeDefined();
    expect(input.placeholder).toBeTruthy();

    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    expect(addBtn).toBeDefined();
    expect(addBtn.textContent).toBe('Add Habit');
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

  it('ensures interactive elements on empty state satisfy min 44x44px touch targets', async () => {
    const root = mockDoc.createElement('div');
    mount(root);

    await new Promise((r) => setTimeout(r, 20));

    const input = mockDoc.getElementById('today-empty-add-input');
    const addBtn = mockDoc.getElementById('today-empty-add-btn');
    const chips = root.querySelectorAll('[data-starter-chip]');

    expect(input.classList.contains('min-h-[44px]')).toBe(true);
    expect(input.classList.contains('min-w-[44px]')).toBe(true);
    expect(addBtn.classList.contains('min-h-[44px]')).toBe(true);
    expect(addBtn.classList.contains('min-w-[44px]')).toBe(true);
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
