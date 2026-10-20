/**
 * Habbit Data Model Typedefs & Constants (SPEC §4)
 *
 * @typedef {{ id: string, name: string, sortOrder: number, archived: boolean, createdAt: string, updatedAt: string }} Habit
 * @typedef {{ id: string, habitId: string, day: string, deleted: boolean, updatedAt: string }} CheckIn
 * @typedef {{ day: string, content: string, updatedAt: string, printedToDiaryAt: string }} JournalEntry
 * @typedef {{ key: 'reminderTime', value: string, updatedAt: string }} Setting
 * @typedef {{ state: 'not-configured' | 'idle' | 'syncing' | 'offline' | 'error', pending: number, lastSyncedAt: string | null, error: string | null }} SyncStatus
 */

export const ACTIONS = Object.freeze({
  PING: 'ping',
  SYNC: 'sync',
  SUBSCRIBE_PUSH: 'subscribePush',
  UNSUBSCRIBE_PUSH: 'unsubscribePush',
  TEST_PUSH: 'testPush',
});

export const ERRORS = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  LOCKED: 'LOCKED',
});

export const STORES = Object.freeze({
  HABITS: 'habits',
  CHECK_INS: 'checkIns',
  JOURNAL_ENTRIES: 'journalEntries',
  SETTINGS: 'settings',
  OUTBOX: 'outbox',
  META: 'meta',
});

export class ApiError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message = code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
