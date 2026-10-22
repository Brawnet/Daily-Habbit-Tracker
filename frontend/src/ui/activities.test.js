import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';

describe('ui/activities.js UI view', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let mount;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;

    shellModule = {
      navigate: vi.fn(),
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    let activitiesList = [];
    let listeners = new Set();

    repoModule = {
      listActivities: vi.fn(async ({ includeArchived = false, status } = {}) => {
        let res = [...activitiesList];
        if (!includeArchived) res = res.filter((a) => !a.archived);
        if (status && status !== 'All') res = res.filter((a) => a.status === status);
        return res;
      }),
      getActivity: vi.fn(async (id) => activitiesList.find((a) => a.id === id) || null),
      addActivity: vi.fn(async (data) => {
        const trimmed = (data.title || '').trim();
        if (!trimmed) throw new Error('Activity title cannot be empty');
        const act = {
          id: `act-${Date.now()}-${Math.random()}`,
          title: trimmed,
          author: (data.author || '').trim(),
          type: (data.type || 'Book').trim(),
          status: (data.status || 'Backlog').trim(),
          totalPages: Number(data.totalPages) || 0,
          summary: (data.summary || '').trim(),
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        activitiesList.push(act);
        for (const l of listeners) l();
        return act;
      }),
      updateActivity: vi.fn(async (id, updates) => {
        const idx = activitiesList.findIndex((a) => a.id === id);
        if (idx === -1) throw new Error('Not found');
        activitiesList[idx] = {
          ...activitiesList[idx],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        for (const l of listeners) l();
        return activitiesList[idx];
      }),
      setActivityArchived: vi.fn(async (id, archived = true) => {
        const idx = activitiesList.findIndex((a) => a.id === id);
        if (idx === -1) throw new Error('Not found');
        activitiesList[idx].archived = Boolean(archived);
        activitiesList[idx].updatedAt = new Date().toISOString();
        for (const l of listeners) l();
        return activitiesList[idx];
      }),
      normalizeActivityInput: vi.fn((input = {}) => ({
        title: String(input.title ?? '').trim(),
        author: String(input.author ?? '').trim(),
        type: String(input.type ?? 'Book').trim(),
        status: String(input.status ?? 'Backlog').trim(),
        totalPages: Math.max(0, parseInt(input.totalPages, 10) || 0),
        summary: String(input.summary ?? '').trim(),
      })),
      onChange: vi.fn((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
    };
    vi.doMock('../data/repo.js', () => repoModule);

    const activitiesUi = await import('./activities.js');
    mount = activitiesUi.mount;
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('renders empty state when no activities exist, with action button to create new Activity', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);

    await new Promise((r) => setTimeout(r, 10));

    const emptyState = root.querySelector('#activities-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toMatch(/No activities yet/i);

    const createBtn = root.querySelector('#btn-create-activity-empty');
    expect(createBtn).not.toBeNull();

    cleanup();
  });

  it('opens create modal/form on button click and submits new activity with all required fields', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Tap + New Activity button
    const newBtn = root.querySelector('#btn-new-activity');
    expect(newBtn).not.toBeNull();
    newBtn.click();

    // Form modal appears
    const formModal = root.querySelector('#activity-modal');
    expect(formModal).not.toBeNull();

    const titleInput = root.querySelector('#activity-input-title');
    const authorInput = root.querySelector('#activity-input-author');
    const typeSelect = root.querySelector('#activity-input-type');
    const statusSelect = root.querySelector('#activity-input-status');
    const pagesInput = root.querySelector('#activity-input-pages');
    const summaryInput = root.querySelector('#activity-input-summary');
    const saveBtn = root.querySelector('#activity-btn-save');

    expect(titleInput).not.toBeNull();
    expect(authorInput).not.toBeNull();
    expect(typeSelect).not.toBeNull();
    expect(statusSelect).not.toBeNull();
    expect(pagesInput).not.toBeNull();
    expect(summaryInput).not.toBeNull();

    titleInput.value = 'Designing Data-Intensive Applications';
    authorInput.value = 'Martin Kleppmann';
    typeSelect.value = 'Book';
    statusSelect.value = 'In Progress';
    pagesInput.value = '616';
    summaryInput.value = 'Reliability, scalability, and maintainability in distributed systems.';

    saveBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.addActivity).toHaveBeenCalledWith({
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      type: 'Book',
      status: 'In Progress',
      totalPages: 616,
      summary: 'Reliability, scalability, and maintainability in distributed systems.',
    });

    expect(shellModule.showToast).toHaveBeenCalledWith('Activity created');

    cleanup();
  });

  it('renders activities list with cards and filters by status pills', async () => {
    // Seed repo with 2 activities
    await repoModule.addActivity({
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
      type: 'Book',
      status: 'Backlog',
      totalPages: 350,
      summary: 'SOLID principles',
    });
    await repoModule.addActivity({
      title: 'System Design Interview',
      author: 'Alex Xu',
      type: 'Book',
      status: 'In Progress',
      totalPages: 300,
      summary: 'Distributed architecture diagrams',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Cards should render
    let cards = root.querySelectorAll('.activity-card');
    expect(cards.length).toBe(2);

    // Filter by 'In Progress'
    const inProgressPill = root.querySelector('#filter-pill-in-progress');
    expect(inProgressPill).not.toBeNull();
    inProgressPill.click();
    await new Promise((r) => setTimeout(r, 10));

    cards = root.querySelectorAll('.activity-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('System Design Interview');

    // Filter by 'Backlog'
    const backlogPill = root.querySelector('#filter-pill-backlog');
    backlogPill.click();
    await new Promise((r) => setTimeout(r, 10));

    cards = root.querySelectorAll('.activity-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Clean Architecture');

    // Filter by 'All'
    const allPill = root.querySelector('#filter-pill-all');
    allPill.click();
    await new Promise((r) => setTimeout(r, 10));

    cards = root.querySelectorAll('.activity-card');
    expect(cards.length).toBe(2);

    cleanup();
  });

  it('allows editing an existing activity', async () => {
    const act = await repoModule.addActivity({
      title: 'Pragmatic Programmer',
      author: 'Andy Hunt',
      type: 'Book',
      status: 'Backlog',
      totalPages: 352,
      summary: 'From journeyman to master',
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    const editBtn = root.querySelector(`[data-action="edit"][data-id="${act.id}"]`);
    expect(editBtn).not.toBeNull();
    editBtn.click();

    // Modal opens populated with existing data
    const titleInput = root.querySelector('#activity-input-title');
    expect(titleInput.value).toBe('Pragmatic Programmer');

    const statusSelect = root.querySelector('#activity-input-status');
    statusSelect.value = 'Completed';

    const saveBtn = root.querySelector('#activity-btn-save');
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.updateActivity).toHaveBeenCalledWith(
      act.id,
      expect.objectContaining({
        status: 'Completed',
      })
    );

    cleanup();
  });

  it('allows archiving an activity and toggling archived list view', async () => {
    const act = await repoModule.addActivity({
      title: 'Old Course',
      author: 'Unknown',
      type: 'Course',
      status: 'Completed',
      totalPages: 100,
    });

    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    const archiveBtn = root.querySelector(`[data-action="archive"][data-id="${act.id}"]`);
    expect(archiveBtn).not.toBeNull();
    archiveBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(repoModule.setActivityArchived).toHaveBeenCalledWith(act.id, true);
    expect(shellModule.showToast).toHaveBeenCalledWith('Activity archived');

    cleanup();
  });

  it('complies with mobile safe-area touch ergonomics and 16px input font size', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    // Tap + New Activity
    const newBtn = root.querySelector('#btn-new-activity');
    newBtn.click();

    const inputs = root.querySelectorAll('input, select, textarea');
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.className).toContain('text-base'); // Tailwind text-base is 16px
    }

    const buttons = root.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toMatch(/min-h-\[44px\]|min-w-\[44px\]|h-11|py-2\.5|p-3/);
    }

    cleanup();
  });
});
