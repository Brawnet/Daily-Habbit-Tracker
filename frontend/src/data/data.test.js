import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DB_NAME, getDb, closeDb } from './db.js';
import { getConfig, setConfig, isConfigured, isValidGasUrl, getStorage } from './config.js';
import {
  listHabits,
  addHabit,
  renameHabit,
  moveHabit,
  setHabitArchived,
  getCheckInDays,
  toggleCheckIn,
  getJournalEntry,
  saveJournalEntry,
  listJournalEntries,
  getSetting,
  setSetting,
  onChange,
  listActivities,
  getActivity,
  addActivity,
  updateActivity,
  setActivityArchived,
  addBook,
  listBooks,
  getBook,
  saveBookChapter,
  listBookChapters,
  triggerActivityCheckIn,
  triggerActivityUncheck,
} from './repo.js';
import {
  getOutboxEntries,
  putOutboxEntry,
  removeOutboxEntries,
  countOutbox,
} from './outbox.js';
import { shouldIncomingWin, mergeRecord, applyIncomingChanges, isValidRecordShape } from './merge.js';
import { callApi } from './api.js';
import {
  syncNow,
  scheduleSync,
  startAutoSync,
  stopAutoSync,
  getSyncStatus,
  onSyncStatus,
  _resetSyncForTesting,
} from './sync.js';
import { ApiError, STORES } from '../shared/contracts.js';
vi.mock('../domain/day.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    today: () => '2026-10-20',
  };
});

describe('Data Layer - Config', () => {
  beforeEach(() => {
    setConfig({ gasUrl: '', pin: '', deviceId: '' });
  });

  it('generates and persists deviceId if not present', () => {
    const config1 = getConfig();
    expect(config1.deviceId).toBeDefined();
    expect(typeof config1.deviceId).toBe('string');
    expect(config1.deviceId.length).toBeGreaterThan(0);

    const config2 = getConfig();
    expect(config2.deviceId).toBe(config1.deviceId);
  });

  it('reports isConfigured correctly', () => {
    expect(isConfigured()).toBe(false);

    setConfig({ gasUrl: 'https://script.google.com/macros/s/xyz/exec' });
    expect(isConfigured()).toBe(false);

    setConfig({ pin: 'secret123' });
    expect(isConfigured()).toBe(true);

    const config = getConfig();
    expect(config.gasUrl).toBe('https://script.google.com/macros/s/xyz/exec');
    expect(config.pin).toBe('secret123');
  });

  describe('isValidGasUrl and setConfig validation (Issue #43 Domain 2)', () => {
    it('validates authentic Google Apps Script web app URLs', () => {
      expect(isValidGasUrl('https://script.google.com/macros/s/AKfycbz_1234567890/exec')).toBe(true);
      expect(isValidGasUrl('https://script.google.com/macros/s/AKfycbz_1234567890/exec?foo=bar')).toBe(true);
    });

    it('rejects malicious or arbitrary origins', () => {
      expect(isValidGasUrl('https://attacker.com/steal-creds')).toBe(false);
      expect(isValidGasUrl('http://script.google.com/macros/s/xyz/exec')).toBe(false);
      expect(isValidGasUrl('https://script.google.com/macros/s/xyz/dev')).toBe(false);
      expect(isValidGasUrl('https://script.google.com.attacker.com/macros/s/xyz/exec')).toBe(false);
      expect(isValidGasUrl('javascript:alert(1)')).toBe(false);
      expect(isValidGasUrl('')).toBe(false);
      expect(isValidGasUrl(null)).toBe(false);
    });

    it('setConfig throws descriptive Error on invalid gasUrl', () => {
      expect(() => {
        setConfig({ gasUrl: 'https://evil.com/exfiltrate' });
      }).toThrow('Invalid Google Apps Script Web App URL');
    });

    it('callApi throws INVALID_CONFIG ApiError if stored gasUrl is invalid', async () => {
      // Simulate corrupted/tampered storage
      const storage = getStorage();
      storage.setItem('habbit.gasUrl', 'https://evil.com/fake');
      await expect(callApi('ping')).rejects.toMatchObject({
        code: 'INVALID_CONFIG',
      });
      storage.removeItem('habbit.gasUrl');
    });
  });
});

describe('Data Layer - Local CRUD & Outbox Coalescing', () => {
  beforeEach(async () => {
    _resetSyncForTesting();
    await closeDb();
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  afterEach(async () => {
    await closeDb();
  });

  it('performs habit CRUD and coalesces outbox entries', async () => {
    let changeNotified = 0;
    const unsubscribe = onChange(() => {
      changeNotified++;
    });

    // 1. Add habit
    const habit1 = await addHabit('  Drink Water  ');
    expect(habit1.name).toBe('Drink Water');
    expect(habit1.sortOrder).toBe(1);
    expect(habit1.archived).toBe(false);
    expect(habit1.createdAt).toBeDefined();
    expect(changeNotified).toBe(1);

    const habit2 = await addHabit('Read 10 pages');
    expect(habit2.sortOrder).toBe(2);
    expect(changeNotified).toBe(2);

    // Verify outbox has 2 items
    let outbox = await getOutboxEntries();
    expect(outbox.length).toBe(2);
    expect(outbox.map((o) => o.key).sort()).toEqual(
      [`habits:${habit1.id}`, `habits:${habit2.id}`].sort()
    );

    // 2. Rename habit1 (should coalesce in outbox)
    const renamed = await renameHabit(habit1.id, 'Drink 2L Water');
    expect(renamed.name).toBe('Drink 2L Water');
    expect(changeNotified).toBe(3);

    outbox = await getOutboxEntries();
    expect(outbox.length).toBe(2);
    const habit1Outbox = outbox.find((o) => o.key === `habits:${habit1.id}`);
    expect(habit1Outbox.record.name).toBe('Drink 2L Water');

    // 3. Move habit
    const reordered = await moveHabit(habit2.id, 'up');
    expect(reordered[0].id).toBe(habit2.id);
    expect(reordered[1].id).toBe(habit1.id);
    expect(reordered[0].sortOrder).toBeLessThan(reordered[1].sortOrder);

    // 4. Archive habit
    const archived = await setHabitArchived(habit1.id, true);
    expect(archived.archived).toBe(true);

    const activeList = await listHabits({ includeArchived: false });
    expect(activeList.length).toBe(1);
    expect(activeList[0].id).toBe(habit2.id);

    const allList = await listHabits({ includeArchived: true });
    expect(allList.length).toBe(2);

    unsubscribe();
  });

  it('handles check-in toggling, deterministic IDs, and window validation', async () => {
    const habit = await addHabit('Morning Run');
    const today = '2026-10-20';
    const yesterday = '2026-10-19';
    const twoDaysAgo = '2026-10-18';

    // Check-in on today: creates deterministic id habitId:day
    const c1 = await toggleCheckIn(habit.id, today);
    expect(c1.id).toBe(`${habit.id}:${today}`);
    expect(c1.deleted).toBe(false);

    let days = await getCheckInDays(habit.id);
    expect(days.has(today)).toBe(true);

    // Toggle again: sets deleted = true
    const c2 = await toggleCheckIn(habit.id, today);
    expect(c2.id).toBe(`${habit.id}:${today}`);
    expect(c2.deleted).toBe(true);

    days = await getCheckInDays(habit.id);
    expect(days.has(today)).toBe(false);

    // Check-in on yesterday: allowed
    const cYesterday = await toggleCheckIn(habit.id, yesterday);
    expect(cYesterday.deleted).toBe(false);
    days = await getCheckInDays(habit.id);
    expect(days.has(yesterday)).toBe(true);

    // Check-in on twoDaysAgo: outside window -> throws Error
    await expect(toggleCheckIn(habit.id, twoDaysAgo)).rejects.toThrow(
      'Check-in window closed'
    );
  });

  it('handles journal entries, 7-day backfill cap for new entries, and unlimited edit window for existing entries', async () => {
    const today = '2026-10-20';
    const yesterday = '2026-10-19';
    const sevenDaysAgo = '2026-10-13';
    const eightDaysAgo = '2026-10-12';
    const twentyDaysAgo = '2026-09-30';
    const tomorrow = '2026-10-21';

    // Save journal entry for today
    const entry = await saveJournalEntry(today, 'Wrote code all day.');
    expect(entry.day).toBe(today);
    expect(entry.content).toBe('Wrote code all day.');
    expect(entry.printedToDiaryAt).toBe('');

    const fetched = await getJournalEntry(today);
    expect(fetched.content).toBe('Wrote code all day.');

    // Save brand-new journal entry for yesterday and exactly 7 days ago -> succeeds
    const yEntry = await saveJournalEntry(yesterday, 'Yesterday reflection');
    expect(yEntry.day).toBe(yesterday);
    const wEntry = await saveJournalEntry(sevenDaysAgo, 'One week ago reflection');
    expect(wEntry.day).toBe(sevenDaysAgo);

    // Save brand-new journal entry 8 days ago -> throws
    await expect(saveJournalEntry(eightDaysAgo, 'Too old to backfill')).rejects.toThrow(
      'New journal entries can only be created within the last 7 days'
    );

    // Save future journal entry -> throws
    await expect(saveJournalEntry(tomorrow, 'Future thoughts')).rejects.toThrow(
      'Journal entry is read-only'
    );

    // Editing an existing entry older than 7 days succeeds and preserves printedToDiaryAt
    const db = await getDb();
    await db.put(STORES.JOURNAL_ENTRIES, {
      day: twentyDaysAgo,
      content: 'Old September entry',
      updatedAt: '2026-09-30T20:00:00Z',
      printedToDiaryAt: '2026-10-01T02:00:00Z',
    });

    const editedOld = await saveJournalEntry(twentyDaysAgo, 'Updated September entry');
    expect(editedOld.content).toBe('Updated September entry');
    expect(editedOld.printedToDiaryAt).toBe('2026-10-01T02:00:00Z');

    const entries = await listJournalEntries();
    expect(entries.length).toBe(4);
    expect(entries[0].day).toBe(today);
  });

  it('normalizes, preserves, and clears optional Journal Entry title across saveJournalEntry calls', async () => {
    const today = '2026-10-20';
    const yesterday = '2026-10-19';

    // Default when 3rd arg omitted on new entry -> title: ''
    const untitled = await saveJournalEntry(today, 'Notes without title');
    expect(untitled.title).toBe('');

    // Save trimmed & 120-char-capped title
    const overLongTitle = '  ' + 'X'.repeat(130) + '  ';
    const titled = await saveJournalEntry(today, 'Notes with title', { title: overLongTitle });
    expect(titled.title).toBe('X'.repeat(120));
    expect((await getJournalEntry(today)).title).toBe('X'.repeat(120));

    // Omitting options on an existing titled entry preserves its title
    const updatedContent = await saveJournalEntry(today, 'Updated body only');
    expect(updatedContent.title).toBe('X'.repeat(120));

    // Explicit whitespace-only or '' clears title
    const cleared = await saveJournalEntry(today, 'Updated body only', { title: '   ' });
    expect(cleared.title).toBe('');

    // Whitespace-only on new entry stores ''
    const blankNew = await saveJournalEntry(yesterday, 'Some body', { title: '  \t ' });
    expect(blankNew.title).toBe('');
  });

  it('handles settings get and set', async () => {
    expect(await getSetting('reminderTime')).toBeNull();

    await setSetting('reminderTime', '20:30');
    expect(await getSetting('reminderTime')).toBe('20:30');

    const outbox = await getOutboxEntries();
    const settingEntry = outbox.find((o) => o.key === 'settings:reminderTime');
    expect(settingEntry).toBeDefined();
    expect(settingEntry.record.value).toBe('20:30');
  });

  it('performs activity CRUD and persists outbox mutations', async () => {
    let notified = 0;
    const unsub = onChange(() => {
      notified++;
    });

    // 1. Add activity with Title, Author, Type, default Status, Total Pages, Summary
    const act1 = await addActivity({
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      type: 'Book',
      status: 'In Progress',
      totalPages: 616,
      summary: 'Deep dive into distributed systems reliability, scalability, and maintainability.',
    });

    expect(act1.id).toBeDefined();
    expect(act1.title).toBe('Designing Data-Intensive Applications');
    expect(act1.author).toBe('Martin Kleppmann');
    expect(act1.type).toBe('Book');
    expect(act1.status).toBe('In Progress');
    expect(act1.totalPages).toBe(616);
    expect(act1.summary).toBe('Deep dive into distributed systems reliability, scalability, and maintainability.');
    expect(act1.archived).toBe(false);
    expect(act1.createdAt).toBeDefined();
    expect(act1.updatedAt).toBeDefined();
    expect(notified).toBe(1);

    // Verify stored in IndexedDB
    const fetched = await getActivity(act1.id);
    expect(fetched).toEqual(act1);

    // Verify in outbox
    let outbox = await getOutboxEntries();
    const actOutbox = outbox.find((o) => o.key === `activities:${act1.id}`);
    expect(actOutbox).toBeDefined();
    expect(actOutbox.type).toBe('activities');
    expect(actOutbox.record.title).toBe('Designing Data-Intensive Applications');

    // 2. Add another activity with default status ('Backlog')
    const act2 = await addActivity({
      title: 'Building Microservices',
      author: 'Sam Newman',
      type: 'Book',
      totalPages: 300,
    });
    expect(act2.status).toBe('Backlog');
    expect(act2.summary).toBe('');

    // 3. List activities and test status filtering
    const allActive = await listActivities();
    expect(allActive.length).toBe(2);

    const inProgressList = await listActivities({ status: 'In Progress' });
    expect(inProgressList.length).toBe(1);
    expect(inProgressList[0].id).toBe(act1.id);

    const backlogList = await listActivities({ status: 'Backlog' });
    expect(backlogList.length).toBe(1);
    expect(backlogList[0].id).toBe(act2.id);

    // 4. Update activity
    const updated = await updateActivity(act1.id, {
      status: 'Completed',
      summary: 'Finished reading all 12 chapters.',
    });
    expect(updated.status).toBe('Completed');
    expect(updated.summary).toBe('Finished reading all 12 chapters.');
    expect(updated.title).toBe('Designing Data-Intensive Applications');

    // Outbox should coalesce
    outbox = await getOutboxEntries();
    const act1OutboxAfter = outbox.find((o) => o.key === `activities:${act1.id}`);
    expect(act1OutboxAfter.record.status).toBe('Completed');

    // 5. Archive activity
    await setActivityArchived(act1.id, true);
    const activeOnly = await listActivities();
    expect(activeOnly.map((a) => a.id)).toEqual([act2.id]);

    const withArchived = await listActivities({ includeArchived: true });
    expect(withArchived.length).toBe(2);

    // Unarchive
    await setActivityArchived(act1.id, false);
    const restored = await listActivities();
    expect(restored.length).toBe(2);

    unsub();
  });
});

describe('Data Layer - Outbox Retention on Concurrent Mutation', () => {
  beforeEach(async () => {
    await closeDb();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });

  afterEach(async () => {
    await closeDb();
  });

  it('retains outbox item if record is modified during sync in-flight', async () => {
    const habit = await addHabit('Workout');
    const sentUpdatedAt = habit.updatedAt;

    // Simulate mutation while sync is in-flight
    // Sleep briefly to ensure new timestamp
    await new Promise((r) => setTimeout(r, 5));
    const modified = await renameHabit(habit.id, 'Workout & Stretch');
    expect(modified.updatedAt > sentUpdatedAt).toBe(true);

    // When sync finishes, it tries to remove what was sent (sentUpdatedAt)
    await removeOutboxEntries([{ key: `habits:${habit.id}`, updatedAt: sentUpdatedAt }]);

    // Outbox entry MUST still exist because updatedAt changed!
    const remaining = await getOutboxEntries();
    expect(remaining.length).toBe(1);
    expect(remaining[0].record.name).toBe('Workout & Stretch');

    // If removed with the new updatedAt, it is deleted
    await removeOutboxEntries([{ key: `habits:${habit.id}`, updatedAt: modified.updatedAt }]);
    expect(await countOutbox()).toBe(0);
  });
});

describe('Data Layer - LWW Merge and LOCKED Precedence', () => {
  it('applies LWW logic correctly with shouldIncomingWin', () => {
    // 1. Incoming wins if local does not exist
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T10:00:00Z' },
        local: null,
      })
    ).toBe(true);

    // 2. Incoming wins if incoming.updatedAt > local.updatedAt
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T12:00:00Z' },
        local: { id: 'h1', updatedAt: '2026-10-20T10:00:00Z' },
      })
    ).toBe(true);

    // 3. Local wins if local.updatedAt >= incoming.updatedAt and no outbox
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T09:00:00Z' },
        local: { id: 'h1', updatedAt: '2026-10-20T10:00:00Z' },
      })
    ).toBe(false);

    // 4. Local wins if local has un-synced outbox record with newer updatedAt
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T11:00:00Z' },
        local: { id: 'h1', updatedAt: '2026-10-20T10:00:00Z' },
        outboxEntry: { updatedAt: '2026-10-20T11:30:00Z' },
      })
    ).toBe(false);

    // 5. Incoming wins if outbox is older than incoming
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T12:00:00Z' },
        local: { id: 'h1', updatedAt: '2026-10-20T10:00:00Z' },
        outboxEntry: { updatedAt: '2026-10-20T11:00:00Z' },
      })
    ).toBe(true);

    // 6. Server record ALWAYS wins if isLocked is true
    expect(
      shouldIncomingWin({
        incoming: { id: 'h1', updatedAt: '2026-10-20T08:00:00Z' },
        local: { id: 'h1', updatedAt: '2026-10-20T12:00:00Z' },
        outboxEntry: { updatedAt: '2026-10-20T12:00:00Z' },
        isLocked: true,
      })
    ).toBe(true);
  });

  it('adopts printedToDiaryAt from server for journal entries', () => {
    // When incoming wins
    const m1 = mergeRecord(
      'journalEntries',
      { day: '2026-10-18', content: 'Server', updatedAt: '2026-10-20T10:00:00Z', printedToDiaryAt: '2026-10-20T02:00:00Z' },
      { day: '2026-10-18', content: 'Local', updatedAt: '2026-10-19T10:00:00Z', printedToDiaryAt: '' }
    );
    expect(m1.winner).toBe('incoming');
    expect(m1.record.printedToDiaryAt).toBe('2026-10-20T02:00:00Z');

    // When local wins (newer un-synced edit), server's printedToDiaryAt is still adopted!
    const m2 = mergeRecord(
      'journalEntries',
      { day: '2026-10-18', content: 'Old server', updatedAt: '2026-10-18T10:00:00Z', printedToDiaryAt: '2026-10-19T02:00:00Z' },
      { day: '2026-10-18', content: 'New local edit', updatedAt: '2026-10-20T10:00:00Z', printedToDiaryAt: '' },
      { updatedAt: '2026-10-20T10:00:00Z' }
    );
    expect(m2.winner).toBe('local');
    expect(m2.record.content).toBe('New local edit');
    expect(m2.record.printedToDiaryAt).toBe('2026-10-19T02:00:00Z');
  });

  it('merges and normalizes optional title on journalEntries via LWW and LOCKED precedence', () => {
    // Incoming wins and adopts normalized title
    const mWin = mergeRecord(
      'journalEntries',
      { day: '2026-10-18', title: '  Server Headline  ', content: '', updatedAt: '2026-10-20T12:00:00Z', printedToDiaryAt: '' },
      { day: '2026-10-18', title: 'Local Old', content: '', updatedAt: '2026-10-19T12:00:00Z', printedToDiaryAt: '' }
    );
    expect(mWin.winner).toBe('incoming');
    expect(mWin.record.title).toBe('Server Headline');

    // Local outbox wins -> keeps local title
    const mLocal = mergeRecord(
      'journalEntries',
      { day: '2026-10-18', title: 'Server Old', content: '', updatedAt: '2026-10-19T12:00:00Z', printedToDiaryAt: '' },
      { day: '2026-10-18', title: 'Local Newer', content: '', updatedAt: '2026-10-20T12:00:00Z', printedToDiaryAt: '' },
      { updatedAt: '2026-10-20T12:00:00Z' }
    );
    expect(mLocal.winner).toBe('local');
    expect(mLocal.record.title).toBe('Local Newer');

    // Missing incoming title normalizes to ''
    const mMissing = mergeRecord(
      'journalEntries',
      { day: '2026-10-17', content: 'Legacy entry', updatedAt: '2026-10-17T10:00:00Z', printedToDiaryAt: '' },
      null
    );
    expect(mMissing.record.title).toBe('');
  });

  it('handles applyIncomingChanges with LOCKED and LWW in IndexedDB', async () => {
    await closeDb();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });

    const db = await getDb();

    // Setup local state:
    // 1. A local habit h1 (older than server)
    await db.put(STORES.HABITS, {
      id: 'h1',
      name: 'Old Habit',
      sortOrder: 1,
      archived: false,
      updatedAt: '2026-10-20T08:00:00Z',
    });

    // 2. A local journal entry j1 that was rejected as LOCKED
    await db.put(STORES.JOURNAL_ENTRIES, {
      day: '2026-10-18',
      content: 'Attempted edit',
      updatedAt: '2026-10-20T09:00:00Z',
      printedToDiaryAt: '',
    });
    await putOutboxEntry('journalEntries', '2026-10-18', {
      day: '2026-10-18',
      content: 'Attempted edit',
      updatedAt: '2026-10-20T09:00:00Z',
    });

    expect(await countOutbox(db)).toBe(1);

    // Apply incoming changes:
    // Server has updated h1, and server rejected j1 with LOCKED
    const syncResult = {
      changes: {
        habits: [
          {
            id: 'h1',
            name: 'Server Habit',
            sortOrder: 1,
            archived: false,
            updatedAt: '2026-10-20T10:00:00Z',
          },
        ],
        journalEntries: [
          {
            day: '2026-10-18',
            content: 'Original Diary entry',
            updatedAt: '2026-10-18T20:00:00Z',
            printedToDiaryAt: '2026-10-19T02:00:00Z',
          },
        ],
      },
      rejected: [
        {
          type: 'journalEntries',
          key: '2026-10-18',
          reason: 'LOCKED',
        },
      ],
    };

    await applyIncomingChanges(db, syncResult);

    // 1. Habit h1 should be updated to server version
    const habit = await db.get(STORES.HABITS, 'h1');
    expect(habit.name).toBe('Server Habit');

    // 2. Journal entry j1 should take server version due to LOCKED
    const journal = await db.get(STORES.JOURNAL_ENTRIES, '2026-10-18');
    expect(journal.content).toBe('Original Diary entry');
    expect(journal.printedToDiaryAt).toBe('2026-10-19T02:00:00Z');

    // 3. Outbox entry for j1 should be cleared!
    expect(await countOutbox(db)).toBe(0);
  });

  it('rejects malformed incoming records with isValidRecordShape (Issue #43 Domain 2)', async () => {
    expect(isValidRecordShape('habits', { id: 'h1' })).toBe(true);
    expect(isValidRecordShape('habits', { id: '' })).toBe(false);
    expect(isValidRecordShape('habits', null)).toBe(false);

    expect(isValidRecordShape('checkIns', { id: 'c1', habitId: 'h1', day: '2026-10-20' })).toBe(true);
    expect(isValidRecordShape('checkIns', { id: 'c1', habitId: 'h1', day: 'invalid-date' })).toBe(false);
    expect(isValidRecordShape('checkIns', { id: 'c1', habitId: '', day: '2026-10-20' })).toBe(false);

    expect(isValidRecordShape('journalEntries', { day: '2026-10-20' })).toBe(true);
    expect(isValidRecordShape('journalEntries', { day: 'bad-day' })).toBe(false);

    const db = await getDb();
    const syncResult = {
      changes: {
        checkIns: [
          { id: 'bad-checkin', habitId: 'h1', day: 'malicious-script-tag' },
        ],
      },
    };
    await applyIncomingChanges(db, syncResult);
    const stored = await db.get(STORES.CHECK_INS, 'bad-checkin');
    expect(stored).toBeUndefined();
  });
});

describe('Data Layer - API & Sync Flow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    _resetSyncForTesting();
    setConfig({
      gasUrl: 'https://script.google.com/macros/s/test/exec',
      pin: 'test-pin',
    });
    await closeDb();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    stopAutoSync();
    _resetSyncForTesting();
    await closeDb();
  });

  it('throws ApiError NOT_CONFIGURED when gasUrl is missing', async () => {
    setConfig({ gasUrl: '', pin: '' });
    await expect(callApi('ping')).rejects.toThrow(ApiError);
    await expect(callApi('ping')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('throws ApiError on server error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid PIN provided',
      }),
    });

    await expect(callApi('ping')).rejects.toThrow(ApiError);
    await expect(callApi('ping')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid PIN provided',
    });
  });

  it('runs syncNow end-to-end, clears outbox, updates cursor and status', async () => {
    const habit = await addHabit('Meditate');
    expect(await countOutbox()).toBe(1);

    const serverNow = '2026-10-20T12:00:00Z';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        cursor: serverNow,
        changes: {
          habits: [],
          checkIns: [],
          journalEntries: [],
          settings: [],
        },
        rejected: [],
      }),
    });

    expect(getSyncStatus().state).toBe('idle');
    await syncNow();

    // Verify outbox cleared
    expect(await countOutbox()).toBe(0);

    // Verify status updated
    const status = getSyncStatus();
    expect(status.state).toBe('idle');
    expect(status.pending).toBe(0);
    expect(status.lastSyncedAt).toBeDefined();
    expect(status.error).toBeNull();

    // Verify meta stored cursor
    const db = await getDb();
    const cursorRecord = await db.get(STORES.META, 'cursor');
    expect(cursorRecord.value).toBe(serverNow);
  });

  it('serializes activities in outbox to changes.activities during syncNow and applies incoming', async () => {
    const act = await addActivity({
      title: 'Refactoring',
      author: 'Martin Fowler',
      type: 'Book',
      status: 'In Progress',
      totalPages: 448,
      summary: 'Improving the design of existing code.',
    });
    expect(await countOutbox()).toBe(1);

    let sentBody = null;
    const serverNow = '2026-10-20T14:00:00Z';
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          cursor: serverNow,
          changes: {
            habits: [],
            checkIns: [],
            journalEntries: [],
            settings: [],
            activities: [
              {
                id: 'act-server-1',
                title: 'Clean Architecture',
                author: 'Robert C. Martin',
                type: 'Book',
                status: 'Backlog',
                totalPages: 350,
                summary: 'Software structure and design.',
                archived: false,
                createdAt: '2026-10-20T10:00:00Z',
                updatedAt: '2026-10-20T10:00:00Z',
              },
            ],
          },
          rejected: [],
        }),
      };
    });

    await syncNow();

    // Verify outbox sent changes.activities
    expect(sentBody.changes.activities).toBeDefined();
    expect(sentBody.changes.activities.length).toBe(1);
    expect(sentBody.changes.activities[0].title).toBe('Refactoring');

    // Outbox should be cleared
    expect(await countOutbox()).toBe(0);

    // Incoming activity should be stored in IndexedDB
    const incomingAct = await getActivity('act-server-1');
    expect(incomingAct).toBeDefined();
    expect(incomingAct.title).toBe('Clean Architecture');
  });

  it('handles offline state during syncNow', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    if (typeof globalThis.navigator === 'undefined') {
      globalThis.navigator = {};
    }
    const originalOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    await syncNow();

    const status = getSyncStatus();
    expect(status.state).toBe('offline');

    if (originalOnLine) {
      Object.defineProperty(globalThis.navigator, 'onLine', originalOnLine);
    } else {
      delete globalThis.navigator.onLine;
    }
  });

  it('handles server error state during syncNow', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'INTERNAL',
        message: 'Database lock timeout',
      }),
    });

    await syncNow();

    const status = getSyncStatus();
    expect(status.state).toBe('error');
    expect(status.error).toContain('Database lock timeout');
  });

  it('locks concurrent syncNow calls to a single execution', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          cursor: 'c1',
          changes: {},
          rejected: [],
        }),
      };
    });

    // Run 3 concurrent sync calls
    await Promise.all([syncNow(), syncNow(), syncNow()]);

    expect(callCount).toBe(1);
  });

  it('scheduleSync debounces syncNow calls', async () => {
    let syncCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      syncCount++;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          cursor: 'c1',
          changes: {},
          rejected: [],
        }),
      };
    });

    scheduleSync(10);
    scheduleSync(10);
    scheduleSync(10);

    await new Promise((r) => setTimeout(r, 50));
    expect(syncCount).toBe(1);
  });
  it('onSyncStatus receives status changes and unsubscribes cleanly', async () => {
    const statuses = [];
    const unsub = onSyncStatus((s) => {
      statuses.push(s.state);
    });

    expect(statuses).toContain('idle');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        cursor: 'c2',
        changes: {},
        rejected: [],
      }),
    });

    await syncNow();
    expect(statuses).toContain('syncing');
    expect(statuses[statuses.length - 1]).toBe('idle');

    const countBefore = statuses.length;
    unsub();
    await syncNow();
    expect(statuses.length).toBe(countBefore);
  });

  it('syncNow sets not-configured status if isConfigured is false', async () => {
    setConfig({ gasUrl: '', pin: '' });
    await syncNow();
    expect(getSyncStatus().state).toBe('not-configured');
  });

  it('validates habit inputs and bounds in repo', async () => {
    await expect(addHabit('')).rejects.toThrow('Habit name cannot be empty');
    await expect(addHabit('   ')).rejects.toThrow('Habit name cannot be empty');
    await expect(renameHabit('non-existent', 'New')).rejects.toThrow('Habit not found');
    await expect(setHabitArchived('non-existent', true)).rejects.toThrow('Habit not found');

    const h1 = await addHabit('First');
    // Moving top habit up should be a no-op
    const listAfterMoveUp = await moveHabit(h1.id, 'up');
    expect(listAfterMoveUp[0].id).toBe(h1.id);

    // Moving bottom habit down should be a no-op
    const listAfterMoveDown = await moveHabit(h1.id, 'down');
    expect(listAfterMoveDown[0].id).toBe(h1.id);
  });

  it('sorts multiple journal entries descending by day', async () => {
    await saveJournalEntry('2026-10-20', 'Today entry');
    const db = await getDb();
    // Directly put older entries to test sorting
    await db.put(STORES.JOURNAL_ENTRIES, {
      day: '2026-10-15',
      content: 'Day 15',
      updatedAt: '2026-10-15T10:00:00Z',
      printedToDiaryAt: '',
    });
    await db.put(STORES.JOURNAL_ENTRIES, {
      day: '2026-10-18',
      content: 'Day 18',
      updatedAt: '2026-10-18T10:00:00Z',
      printedToDiaryAt: '',
    });

    const list = await listJournalEntries();
    expect(list.map((j) => j.day)).toEqual(['2026-10-20', '2026-10-18', '2026-10-15']);
  });

  it('callApi sends correct headers and body structure', async () => {
    let requestInit = null;
    let requestUrl = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        json: async () => ({ ok: true, serverTime: '2026-10-20T10:00:00Z' }),
      };
    });

    const res = await callApi('ping', { extra: 'test' });
    expect(res.ok).toBe(true);
    expect(requestUrl).toBe('https://script.google.com/macros/s/test/exec');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(requestInit.redirect).toBe('follow');

    const body = JSON.parse(requestInit.body);
    expect(body.action).toBe('ping');
    expect(body.pin).toBe('test-pin');
    expect(body.deviceId).toBeDefined();
    expect(body.extra).toBe('test');
  });

  it('persists books, chapters, and manages habit linking with auto-check-in', async () => {
    // 1. Add book
    const book = await addBook({ title: 'Atomic Habits', author: 'James Clear' });
    expect(book.id).toBeDefined();
    expect(book.title).toBe('Atomic Habits');
    expect(book.author).toBe('James Clear');

    const books = await listBooks();
    expect(books.length).toBe(1);
    expect(books[0].id).toBe(book.id);

    // 2. Add chapters
    const ch1 = await saveBookChapter({
      bookId: book.id,
      title: 'Chapter 1: Fundamentals',
      content: 'Small habits compound.',
    });
    expect(ch1.id).toBeDefined();
    expect(ch1.bookId).toBe(book.id);

    const ch2 = await saveBookChapter({
      bookId: book.id,
      title: 'Chapter 2: Identity',
      content: 'Focus on who you want to become.',
    });

    const chapters = await listBookChapters(book.id);
    expect(chapters.length).toBe(2);
    // Chronological order: ch1 then ch2
    expect(chapters[0].title).toBe('Chapter 1: Fundamentals');
    expect(chapters[1].title).toBe('Chapter 2: Identity');

    // 3. Edit existing chapter in place
    const updatedCh1 = await saveBookChapter({
      id: ch1.id,
      bookId: book.id,
      title: 'Chapter 1: Fundamentals (Updated)',
      content: 'Small habits compound exponentially.',
    });
    expect(updatedCh1.id).toBe(ch1.id);
    expect(updatedCh1.title).toBe('Chapter 1: Fundamentals (Updated)');

    const chaptersAfterUpdate = await listBookChapters(book.id);
    expect(chaptersAfterUpdate.length).toBe(2);
    expect(chaptersAfterUpdate[0].title).toBe('Chapter 1: Fundamentals (Updated)');

    // 4. Habit linking and auto-check-in
    const habit = await addHabit('Read 20 Mins', { linkedActivity: 'book_summary' });
    expect(habit.linkedActivity).toBe('book_summary');

    // Check-in days initially empty
    let checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(false);

    // Trigger auto-check-in for book_summary
    await triggerActivityCheckIn('book_summary');

    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);

    // Triggering again does not toggle it off
    await triggerActivityCheckIn('book_summary');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);

    // 5. Updating habit rename and linkedActivity
    const updatedHabit = await renameHabit(habit.id, 'Read 30 Mins', 'journal');
    expect(updatedHabit.name).toBe('Read 30 Mins');
    expect(updatedHabit.linkedActivity).toBe('journal');

    // Unlink activity
    const unlinkedHabit = await renameHabit(habit.id, 'Read 30 Mins', null);
    expect(unlinkedHabit.linkedActivity).toBeNull();

    // 6. Verify local books and bookChapters do NOT pollute the sync outbox
    const outbox = await getOutboxEntries();
    const bookOutbox = outbox.filter((o) => o.type === 'books' || o.type === 'bookChapters');
    expect(bookOutbox.length).toBe(0);
  });

  it('bidirectionally checks in and unchecks habits linked to journal on saveJournalEntry', async () => {
    const habit = await addHabit('Daily Reflection', { linkedActivity: 'journal' });
    expect(habit.linkedActivity).toBe('journal');

    // Initially not checked in
    let checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(false);

    // Saving non-empty journal for today automatically checks in
    await saveJournalEntry('2026-10-20', '<p>Reflected on accomplishments</p>');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);

    // Saving empty journal for today automatically unchecks
    await saveJournalEntry('2026-10-20', '');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(false);

    // Direct triggerActivityCheckIn and triggerActivityUncheck
    await triggerActivityCheckIn('journal');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);

    await triggerActivityUncheck('journal');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(false);
  });

  it('does NOT auto-check-in or uncheck linked habits when editing or backfilling a past Day', async () => {
    const habit = await addHabit('Daily Reflection', { linkedActivity: 'journal' });

    // Backfilling a past day does not mark today done
    await saveJournalEntry('2026-10-18', '<p>Past reflection</p>');
    let checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(false);
    expect(checkIns.has('2026-10-18')).toBe(false);

    // Even if today is checked in, editing/clearing a past entry does not uncheck today
    await saveJournalEntry('2026-10-20', '<p>Today entry</p>');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);

    await saveJournalEntry('2026-10-18', '');
    checkIns = await getCheckInDays(habit.id);
    expect(checkIns.has('2026-10-20')).toBe(true);
  });

  it('triggers Linked Activity check-in for title-only today entries and unchecks only when both title and content are blank', async () => {
    const habit = await addHabit('Daily Reflection', { linkedActivity: 'journal' });

    // Past Day title-only entry must NOT check in today's linked habit
    await saveJournalEntry('2026-10-18', '', { title: 'Past milestone' });
    expect((await getCheckInDays(habit.id)).has('2026-10-20')).toBe(false);

    // Today title-only entry checks in linked habit
    await saveJournalEntry('2026-10-20', '', { title: 'Big breakthrough' });
    expect((await getCheckInDays(habit.id)).has('2026-10-20')).toBe(true);

    // Clearing content while keeping title keeps linked habit checked in
    await saveJournalEntry('2026-10-20', 'Body', { title: 'Big breakthrough' });
    await saveJournalEntry('2026-10-20', '', { title: 'Big breakthrough' });
    expect((await getCheckInDays(habit.id)).has('2026-10-20')).toBe(true);

    // Clearing both title and content unchecks linked habit
    await saveJournalEntry('2026-10-20', '', { title: '' });
    expect((await getCheckInDays(habit.id)).has('2026-10-20')).toBe(false);
  });

  it('serializes journalEntries title in syncNow outbound payload and persists incoming server titles', async () => {
    await saveJournalEntry('2026-10-20', '<p>Reflected</p>', { title: 'Local Sync Title' });

    let sentBody = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          cursor: '2026-10-20T15:00:00Z',
          changes: {
            habits: [],
            checkIns: [],
            journalEntries: [
              {
                day: '2026-10-19',
                title: '  Remote Title  ',
                content: '<p>From another Device</p>',
                updatedAt: '2026-10-19T21:00:00Z',
                printedToDiaryAt: '',
              },
            ],
            settings: [],
            activities: [],
          },
          rejected: [],
        }),
      };
    });

    await syncNow();

    expect(sentBody.changes.journalEntries).toHaveLength(1);
    expect(sentBody.changes.journalEntries[0].title).toBe('Local Sync Title');

    const incomingEntry = await getJournalEntry('2026-10-19');
    expect(incomingEntry).not.toBeNull();
    expect(incomingEntry.title).toBe('Remote Title');
  });

  it('supports optional scheduledTime on addHabit, renameHabit, archive/restore, and outbox', async () => {
    const timed = await addHabit('Journaling', { scheduledTime: '05:00' });
    expect(timed.scheduledTime).toBe('05:00');

    const untimed = await addHabit('Drink Water');
    expect(untimed.scheduledTime).toBe('');

    await expect(addHabit('Bad Habit', { scheduledTime: '25:99' })).rejects.toThrow(
      'Invalid scheduled time'
    );

    // Outbox includes scheduledTime
    let outbox = await getOutboxEntries();
    const timedOutbox = outbox.find((o) => o.key === `habits:${timed.id}`);
    expect(timedOutbox.record.scheduledTime).toBe('05:00');

    // Update scheduledTime via renameHabit
    const updatedTime = await renameHabit(timed.id, 'Morning Journal', null, '06:30');
    expect(updatedTime.scheduledTime).toBe('06:30');

    // Preserves scheduledTime when omitted (undefined)
    const renamedOnly = await renameHabit(timed.id, 'Journaling');
    expect(renamedOnly.scheduledTime).toBe('06:30');

    // Rejects invalid scheduledTime on renameHabit
    await expect(renameHabit(timed.id, 'Journaling', undefined, '99:00')).rejects.toThrow(
      'Invalid scheduled time'
    );

    // Archive and restore preserve scheduledTime
    const archived = await setHabitArchived(timed.id, true);
    expect(archived.scheduledTime).toBe('06:30');
    const restored = await setHabitArchived(timed.id, false);
    expect(restored.scheduledTime).toBe('06:30');

    // Clearing scheduledTime back to '' works cleanly
    const cleared = await renameHabit(timed.id, 'Journaling', undefined, '');
    expect(cleared.scheduledTime).toBe('');
  });

  it('locks moveHabit for timed Habits and reorders Anytime Habits across Anytime slots only', async () => {
    const timedMorning = await addHabit('Journaling', { scheduledTime: '05:00' }); // sortOrder 1
    const anyA = await addHabit('Drink Water'); // sortOrder 2
    const timedNight = await addHabit('Evening Walk', { scheduledTime: '21:00' }); // sortOrder 3
    const anyB = await addHabit('Stretch'); // sortOrder 4

    const beforeOutbox = await getOutboxEntries();
    const beforeTimedUpdated = beforeOutbox.find((o) => o.key === `habits:${timedMorning.id}`).updatedAt;

    // Attempt to move a timed habit -> must be a no-op with no timestamp/outbox change
    const afterTimedAttempt = await moveHabit(timedMorning.id, 'down');
    expect(afterTimedAttempt.find((h) => h.id === timedMorning.id).sortOrder).toBe(1);
    const afterOutbox = await getOutboxEntries();
    expect(afterOutbox.find((o) => o.key === `habits:${timedMorning.id}`).updatedAt).toBe(
      beforeTimedUpdated
    );

    // Moving anyB 'up' should swap sortOrder with anyA, skipping over timedNight (3)
    const afterAnytimeMove = await moveHabit(anyB.id, 'up');
    const updatedAnyA = afterAnytimeMove.find((h) => h.id === anyA.id);
    const updatedAnyB = afterAnytimeMove.find((h) => h.id === anyB.id);
    const untouchedTimedNight = afterAnytimeMove.find((h) => h.id === timedNight.id);
    expect(updatedAnyB.sortOrder).toBe(2);
    expect(updatedAnyA.sortOrder).toBe(4);
    expect(untouchedTimedNight.sortOrder).toBe(3);
  });

  it('normalizes scheduledTime on habits during mergeRecord and syncNow', async () => {
    const mergedValid = mergeRecord('habits', {
      id: 'h-sync-1',
      name: 'Meditation',
      sortOrder: 1,
      archived: false,
      scheduledTime: ' 07:15 ',
      updatedAt: '2026-10-20T10:00:00Z',
    });
    expect(mergedValid.record.scheduledTime).toBe('07:15');

    const mergedMissing = mergeRecord('habits', {
      id: 'h-sync-2',
      name: 'Legacy',
      sortOrder: 2,
      archived: false,
      updatedAt: '2026-10-20T10:00:00Z',
    });
    expect(mergedMissing.record.scheduledTime).toBe('');

    const mergedInvalid = mergeRecord('habits', {
      id: 'h-sync-3',
      name: 'Bad Remote',
      sortOrder: 3,
      archived: false,
      scheduledTime: '=05:00',
      updatedAt: '2026-10-20T10:00:00Z',
    });
    expect(mergedInvalid.record.scheduledTime).toBe('');

    await addHabit('Sunrise Stretch', { scheduledTime: '05:30' });

    let sentBody = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          cursor: '2026-10-20T16:00:00Z',
          changes: {
            habits: [
              {
                id: 'h-remote',
                name: 'Night Reading',
                sortOrder: 2,
                archived: false,
                scheduledTime: '22:00',
                createdAt: '2026-10-20T09:00:00Z',
                updatedAt: '2026-10-20T15:00:00Z',
              },
            ],
            checkIns: [],
            journalEntries: [],
            settings: [],
            activities: [],
          },
          rejected: [],
        }),
      };
    });

    await syncNow();

    expect(sentBody.changes.habits).toHaveLength(1);
    expect(sentBody.changes.habits[0].scheduledTime).toBe('05:30');

    const habits = await listHabits();
    const remoteHabit = habits.find((h) => h.id === 'h-remote');
    expect(remoteHabit.scheduledTime).toBe('22:00');
  });
});
