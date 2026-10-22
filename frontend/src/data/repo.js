import { getDb } from './db.js';
import { STORES } from '../shared/contracts.js';
import { scheduleSync } from './sync.js';
import { isCheckInEditable, isJournalEditable, today } from '../domain/day.js';

const changeListeners = new Set();

/**
 * Registers a callback for repository mutations and sync merges.
 *
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onChange(listener) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Notifies all registered repository change listeners.
 */
export function notifyChange() {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Atomically commits a single record mutation to its target store and the outbox.
 *
 * @param {string} storeName
 * @param {any} record
 * @param {string} outboxType
 * @param {string} recordKey
 */
async function commitSingleMutation(storeName, record, outboxType, recordKey) {
  const db = await getDb();
  const tx = db.transaction([storeName, STORES.OUTBOX], 'readwrite');
  await tx.objectStore(storeName).put(record);
  await tx.objectStore(STORES.OUTBOX).put({
    key: `${outboxType}:${recordKey}`,
    type: outboxType,
    recordKey,
    record,
    updatedAt: record.updatedAt,
  });
  await tx.done;
  notifyChange();
  scheduleSync(3000);
}

/**
 * Atomically commits multiple record mutations to their target stores and the outbox.
 *
 * @param {Array<{ storeName: string, record: any, outboxType: string, recordKey: string }>} mutations
 */
async function commitMultiMutations(mutations) {
  const db = await getDb();
  const storeNames = Array.from(
    new Set(mutations.map((m) => m.storeName).concat([STORES.OUTBOX]))
  );
  const tx = db.transaction(storeNames, 'readwrite');
  for (const m of mutations) {
    await tx.objectStore(m.storeName).put(m.record);
    await tx.objectStore(STORES.OUTBOX).put({
      key: `${m.outboxType}:${m.recordKey}`,
      type: m.outboxType,
      recordKey: m.recordKey,
      record: m.record,
      updatedAt: m.record.updatedAt,
    });
  }
  await tx.done;
  notifyChange();
  scheduleSync(3000);
}

/**
 * Lists habits sorted by sortOrder ascending.
 *
 * @param {{ includeArchived?: boolean }} [options]
 * @returns {Promise<Array<import('../shared/contracts.js').Habit>>}
 */
export async function listHabits({ includeArchived = false } = {}) {
  const db = await getDb();
  const habits = await db.getAll(STORES.HABITS);
  const filtered = includeArchived ? habits : habits.filter((h) => !h.archived);
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Adds a new habit with sortOrder = maxSortOrder + 1.
 *
 * @param {string} name
 * @returns {Promise<import('../shared/contracts.js').Habit>}
 */
export async function addHabit(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Habit name cannot be empty');
  }

  const db = await getDb();
  const allHabits = await db.getAll(STORES.HABITS);
  const maxSortOrder = allHabits.reduce((max, h) => Math.max(max, h.sortOrder ?? 0), 0);
  const now = new Date().toISOString();
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `habit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  /** @type {import('../shared/contracts.js').Habit} */
  const habit = {
    id,
    name: trimmed,
    sortOrder: maxSortOrder + 1,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  await commitSingleMutation(STORES.HABITS, habit, 'habits', id);
  return habit;
}

/**
 * Renames an existing habit.
 *
 * @param {string} id
 * @param {string} name
 * @returns {Promise<import('../shared/contracts.js').Habit>}
 */
export async function renameHabit(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Habit name cannot be empty');
  }

  const db = await getDb();
  const existing = await db.get(STORES.HABITS, id);
  if (!existing) {
    throw new Error(`Habit not found: ${id}`);
  }

  const now = new Date().toISOString();
  /** @type {import('../shared/contracts.js').Habit} */
  const updated = {
    ...existing,
    name: trimmed,
    updatedAt: now,
  };

  await commitSingleMutation(STORES.HABITS, updated, 'habits', id);
  return updated;
}

/**
 * Swaps sortOrder with the adjacent active habit.
 *
 * @param {string} id
 * @param {'up' | 'down'} direction
 * @returns {Promise<Array<import('../shared/contracts.js').Habit>>}
 */
export async function moveHabit(id, direction) {
  const activeHabits = await listHabits({ includeArchived: false });
  const index = activeHabits.findIndex((h) => h.id === id);
  if (index === -1) {
    return activeHabits;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= activeHabits.length) {
    return activeHabits;
  }

  const current = { ...activeHabits[index] };
  const target = { ...activeHabits[targetIndex] };

  let currentOrder = current.sortOrder;
  let targetOrder = target.sortOrder;

  if (currentOrder === targetOrder) {
    currentOrder = direction === 'up' ? targetOrder - 1 : targetOrder + 1;
  } else {
    const tmp = currentOrder;
    currentOrder = targetOrder;
    targetOrder = tmp;
  }

  const now = new Date().toISOString();
  current.sortOrder = currentOrder;
  current.updatedAt = now;
  target.sortOrder = targetOrder;
  target.updatedAt = now;

  await commitMultiMutations([
    { storeName: STORES.HABITS, record: current, outboxType: 'habits', recordKey: current.id },
    { storeName: STORES.HABITS, record: target, outboxType: 'habits', recordKey: target.id },
  ]);

  return listHabits({ includeArchived: false });
}

/**
 * Sets archived status on a habit.
 *
 * @param {string} id
 * @param {boolean} archived
 * @returns {Promise<import('../shared/contracts.js').Habit>}
 */
export async function setHabitArchived(id, archived) {
  const db = await getDb();
  const existing = await db.get(STORES.HABITS, id);
  if (!existing) {
    throw new Error(`Habit not found: ${id}`);
  }

  const now = new Date().toISOString();
  /** @type {import('../shared/contracts.js').Habit} */
  const updated = {
    ...existing,
    archived: Boolean(archived),
    updatedAt: now,
  };

  await commitSingleMutation(STORES.HABITS, updated, 'habits', id);
  return updated;
}

/**
 * Returns a Set of days for which this habit has a non-deleted check-in.
 *
 * @param {string} habitId
 * @returns {Promise<Set<string>>}
 */
export async function getCheckInDays(habitId) {
  const db = await getDb();
  let checkIns;
  try {
    checkIns = await db.getAllFromIndex(STORES.CHECK_INS, 'habitId', habitId);
  } catch {
    const all = await db.getAll(STORES.CHECK_INS);
    checkIns = all.filter((c) => c.habitId === habitId);
  }

  const days = new Set();
  for (const c of checkIns) {
    if (!c.deleted) {
      days.add(c.day);
    }
  }
  return days;
}

/**
 * Toggles a check-in for the given habit on the given day.
 *
 * @param {string} habitId
 * @param {string} day
 * @returns {Promise<import('../shared/contracts.js').CheckIn>}
 */
export async function toggleCheckIn(habitId, day) {
  const currentDay = today();
  if (!isCheckInEditable(day, currentDay)) {
    throw new Error('Check-in window closed');
  }

  const id = `${habitId}:${day}`;
  const db = await getDb();
  const existing = await db.get(STORES.CHECK_INS, id);
  const now = new Date().toISOString();

  /** @type {import('../shared/contracts.js').CheckIn} */
  let record;
  if (existing) {
    record = {
      ...existing,
      deleted: !existing.deleted,
      updatedAt: now,
    };
  } else {
    record = {
      id,
      habitId,
      day,
      deleted: false,
      updatedAt: now,
    };
  }

  await commitSingleMutation(STORES.CHECK_INS, record, 'checkIns', id);
  return record;
}

/**
 * Gets a journal entry by day.
 *
 * @param {string} day
 * @returns {Promise<import('../shared/contracts.js').JournalEntry | null>}
 */
export async function getJournalEntry(day) {
  const db = await getDb();
  const entry = await db.get(STORES.JOURNAL_ENTRIES, day);
  return entry || null;
}

/**
 * Saves a journal entry for the given day.
 *
 * @param {string} day
 * @param {string} content
 * @returns {Promise<import('../shared/contracts.js').JournalEntry>}
 */
export async function saveJournalEntry(day, content) {
  const currentDay = today();
  if (!isJournalEditable(day, currentDay)) {
    throw new Error('Journal entry is read-only');
  }

  const db = await getDb();
  const existing = await db.get(STORES.JOURNAL_ENTRIES, day);
  const now = new Date().toISOString();

  /** @type {import('../shared/contracts.js').JournalEntry} */
  const record = {
    day,
    content: String(content ?? ''),
    updatedAt: now,
    printedToDiaryAt: existing?.printedToDiaryAt || '',
  };

  await commitSingleMutation(STORES.JOURNAL_ENTRIES, record, 'journalEntries', day);
  return record;
}

/**
 * Lists all journal entries sorted by day descending.
 *
 * @returns {Promise<Array<import('../shared/contracts.js').JournalEntry>>}
 */
export async function listJournalEntries() {
  const db = await getDb();
  const entries = await db.getAll(STORES.JOURNAL_ENTRIES);
  return entries.sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Gets a setting value by key.
 *
 * @param {string} key
 * @returns {Promise<string | null>}
 */
export async function getSetting(key) {
  const db = await getDb();
  const record = await db.get(STORES.SETTINGS, key);
  return record ? record.value : null;
}

/**
 * Sets a setting value by key.
 *
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  const now = new Date().toISOString();
  /** @type {import('../shared/contracts.js').Setting} */
  const record = {
    key,
    value: String(value),
    updatedAt: now,
  };

  await commitSingleMutation(STORES.SETTINGS, record, 'settings', key);
}

/**
 * Lists activities with optional status filtering and archived inclusion.
 *
 * @param {{ includeArchived?: boolean, status?: string }} [options]
 * @returns {Promise<Array<import('../shared/contracts.js').Activity>>}
 */
export async function listActivities({ includeArchived = false, status } = {}) {
  const db = await getDb();
  let activities = await db.getAll(STORES.ACTIVITIES);

  if (!includeArchived) {
    activities = activities.filter((a) => !a.archived);
  }
  if (status && status !== 'All') {
    activities = activities.filter((a) => a.status === status);
  }

  return activities.sort((a, b) => {
    const aTime = a.createdAt || a.updatedAt || '';
    const bTime = b.createdAt || b.updatedAt || '';
    return bTime.localeCompare(aTime);
  });
}

/**
 * Gets a single activity by id.
 *
 * @param {string} id
 * @returns {Promise<import('../shared/contracts.js').Activity | null>}
 */
export async function getActivity(id) {
  if (!id) return null;
  const db = await getDb();
  const record = await db.get(STORES.ACTIVITIES, id);
  return record || null;
}

/**
 * Creates and commits a new activity record.
 *
 * @param {{ title: string, author?: string, type?: string, status?: string, totalPages?: number, summary?: string }} params
 * @returns {Promise<import('../shared/contracts.js').Activity>}
 */
export async function addActivity({
  title,
  author = '',
  type = 'Book',
  status = 'Backlog',
  totalPages = 0,
  summary = '',
}) {
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) {
    throw new Error('Activity title cannot be empty');
  }

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);

  const now = new Date().toISOString();
  /** @type {import('../shared/contracts.js').Activity} */
  const record = {
    id,
    title: trimmedTitle,
    author: (author || '').trim(),
    type: (type || 'Book').trim(),
    status: (status || 'Backlog').trim(),
    totalPages: Math.max(0, parseInt(totalPages, 10) || 0),
    summary: (summary || '').trim(),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  await commitSingleMutation(STORES.ACTIVITIES, record, 'activities', id);
  return record;
}

/**
 * Updates an existing activity.
 *
 * @param {string} id
 * @param {Partial<import('../shared/contracts.js').Activity>} updates
 * @returns {Promise<import('../shared/contracts.js').Activity>}
 */
export async function updateActivity(id, updates = {}) {
  const db = await getDb();
  const existing = await db.get(STORES.ACTIVITIES, id);
  if (!existing) {
    throw new Error(`Activity not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...updates,
    id,
    title: updates.title !== undefined ? String(updates.title).trim() : existing.title,
    author: updates.author !== undefined ? String(updates.author).trim() : existing.author,
    type: updates.type !== undefined ? String(updates.type).trim() : existing.type,
    status: updates.status !== undefined ? String(updates.status).trim() : existing.status,
    totalPages:
      updates.totalPages !== undefined
        ? Math.max(0, parseInt(updates.totalPages, 10) || 0)
        : existing.totalPages,
    summary: updates.summary !== undefined ? String(updates.summary).trim() : existing.summary,
    archived: updates.archived !== undefined ? Boolean(updates.archived) : existing.archived,
    updatedAt: now,
  };

  if (!updated.title) {
    throw new Error('Activity title cannot be empty');
  }

  await commitSingleMutation(STORES.ACTIVITIES, updated, 'activities', id);
  return updated;
}

/**
 * Sets archived status for an activity.
 *
 * @param {string} id
 * @param {boolean} [archived=true]
 * @returns {Promise<import('../shared/contracts.js').Activity>}
 */
export async function setActivityArchived(id, archived = true) {
  return updateActivity(id, { archived: Boolean(archived) });
}
