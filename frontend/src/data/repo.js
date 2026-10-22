import { getDb } from './db.js';
import { STORES, ACTIVITY_STATUS } from '../shared/contracts.js';
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
export async function addHabit(name, { linkedActivity = null } = {}) {
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
    linkedActivity: linkedActivity || null,
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
  if (day === currentDay && record.content.replace(/<[^>]*>/g, ' ').trim() !== '') {
    try {
      await triggerActivityCheckIn('journal');
    } catch (err) {
      console.warn('Journal auto-checkin failed:', err);
    }
  }
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
 * Sanitizes and validates activity fields.
 *
 * @param {{ title?: string, author?: string, type?: string, status?: string, totalPages?: number, summary?: string }} [input]
 * @returns {{ title: string, author: string, type: string, status: string, totalPages: number, summary: string }}
 */
export function normalizeActivityInput(input = {}) {
  const title = String(input.title ?? '').trim();
  if (!title) {
    throw new Error('Activity title cannot be empty');
  }

  return {
    title,
    author: String(input.author ?? '').trim(),
    type: String(input.type ?? 'Book').trim(),
    status: String(input.status ?? ACTIVITY_STATUS.BACKLOG).trim(),
    totalPages: Math.max(0, parseInt(input.totalPages, 10) || 0),
    summary: String(input.summary ?? '').trim(),
  };
}

/**
 * Creates and commits a new activity record.
 *
 * @param {{ title: string, author?: string, type?: string, status?: string, totalPages?: number, summary?: string }} params
 * @returns {Promise<import('../shared/contracts.js').Activity>}
 */
export async function addActivity(params = {}) {
  const normalized = normalizeActivityInput(params);
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);

  const now = new Date().toISOString();
  /** @type {import('../shared/contracts.js').Activity} */
  const record = {
    id,
    ...normalized,
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

  const merged = { ...existing, ...updates };
  const normalized = normalizeActivityInput(merged);
  const now = new Date().toISOString();

  const updated = {
    ...existing,
    ...normalized,
    id,
    archived: updates.archived !== undefined ? Boolean(updates.archived) : existing.archived,
    updatedAt: now,
  };

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

/**
 * Triggers auto-check-in for habits linked to an activity.
 * @param {'journal' | 'book_summary'} activityType
 */
export async function triggerActivityCheckIn(activityType) {
  const habits = await listHabits({ includeArchived: false });
  const linkedHabits = habits.filter((h) => h.linkedActivity === activityType);
  if (linkedHabits.length === 0) return;

  const currentDay = today();
  for (const habit of linkedHabits) {
    const days = await getCheckInDays(habit.id);
    if (!days.has(currentDay)) {
      await toggleCheckIn(habit.id, currentDay);
    }
  }
}

/**
 * Adds a new book to the library.
 * @param {{ title: string, author?: string }} data
 * @returns {Promise<import('../shared/contracts.js').Book>}
 */
export async function addBook({ title, author = '' }) {
  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) {
    throw new Error('Book title cannot be empty');
  }
  const now = new Date().toISOString();
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `book-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  /** @type {import('../shared/contracts.js').Book} */
  const book = {
    id,
    title: trimmedTitle,
    author: (author || '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  await commitSingleMutation(STORES.BOOKS, book, 'books', id);
  return book;
}

/**
 * Lists all books sorted newest first.
 * @returns {Promise<Array<import('../shared/contracts.js').Book>>}
 */
export async function listBooks() {
  const db = await getDb();
  const books = await db.getAll(STORES.BOOKS);
  return books.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Gets a book by id.
 * @param {string} id
 * @returns {Promise<import('../shared/contracts.js').Book | null>}
 */
export async function getBook(id) {
  const db = await getDb();
  const book = await db.get(STORES.BOOKS, id);
  return book || null;
}

/**
 * Saves a chapter for a book (create or update).
 * @param {{ id?: string, bookId: string, title?: string, content?: string }} data
 * @returns {Promise<import('../shared/contracts.js').BookChapter>}
 */
export async function saveBookChapter({ id, bookId, title = '', content = '' }) {
  if (!bookId) {
    throw new Error('bookId is required');
  }
  const db = await getDb();
  const now = new Date().toISOString();
  let existing = null;
  if (id) {
    existing = await db.get(STORES.BOOK_CHAPTERS, id);
  }
  let sortOrder = existing?.sortOrder;
  if (sortOrder === undefined) {
    const existingChapters = await listBookChapters(bookId);
    const maxSort = existingChapters.reduce((max, c) => Math.max(max, c.sortOrder ?? 0), 0);
    sortOrder = maxSort + 1;
  }

  const chapterId = id || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  /** @type {import('../shared/contracts.js').BookChapter} */
  const chapter = {
    id: chapterId,
    bookId,
    title: (title || '').trim(),
    content: String(content ?? ''),
    sortOrder,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await commitSingleMutation(STORES.BOOK_CHAPTERS, chapter, 'bookChapters', chapterId);

  // Auto-check in linked habit for today if content is present
  if (chapter.content.replace(/<[^>]*>/g, ' ').trim() !== '') {
    try {
      await triggerActivityCheckIn('book_summary');
    } catch (err) {
      console.warn('Auto-checkin failed:', err);
    }
  }

  return chapter;
}

/**
 * Lists all chapters for a given book, sorted chronologically (oldest first).
 * @param {string} bookId
 * @returns {Promise<Array<import('../shared/contracts.js').BookChapter>>}
 */
export async function listBookChapters(bookId) {
  const db = await getDb();
  let chapters = [];
  try {
    chapters = await db.getAllFromIndex(STORES.BOOK_CHAPTERS, 'bookId', bookId);
  } catch {
    const all = await db.getAll(STORES.BOOK_CHAPTERS);
    chapters = all.filter((c) => c.bookId === bookId);
  }
  return chapters.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
