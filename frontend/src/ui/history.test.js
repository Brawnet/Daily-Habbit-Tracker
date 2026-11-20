import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';

describe('ui/history.js Habit History view', () => {
  let mockDoc;
  let repoModule;
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
        today: () => '2026-10-20',
      };
    });

    vi.doMock('./shell.js', () => ({
      showToast: vi.fn(),
    }));

    const habits = [
      {
        id: 'h1',
        name: 'Morning Run',
        sortOrder: 1,
        archived: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'h2',
        name: 'Evening Walk',
        sortOrder: 2,
        archived: true,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-10T00:00:00Z',
      },
    ];

    repoModule = {
      listHabits: vi.fn(async () => habits),
      getCheckInDays: vi.fn(async () => new Set(['2026-10-20', '2026-10-19'])),
      toggleCheckIn: vi.fn(async () => {}),
      listJournalEntries: vi.fn(async () => [
        { day: '2026-10-20', content: '<p>Today journal</p>' },
      ]),
      onChange: vi.fn(() => () => {}),
    };

    vi.doMock('../data/repo.js', () => repoModule);

    const historyUi = await import('./history.js');
    mount = historyUi.mount;
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('renders active and archived habit heatmaps without any Journal History UI', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const cards = root.querySelectorAll('.habit-card');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('.heatmap-grid').getAttribute('aria-label')).toContain('Morning Run');
    expect(cards[1].querySelector('.heatmap-grid').getAttribute('aria-label')).toContain('Evening Walk');

    expect(root.querySelector('.journal-history-section')).toBeNull();
    expect(root.querySelector('.journal-search-input')).toBeNull();
    expect(root.querySelector('.journal-entry-item')).toBeNull();
    expect(root.querySelector('.reader-modal-backdrop')).toBeNull();
    expect(root.textContent).not.toContain('Journal History');

    cleanup();
  });
});
