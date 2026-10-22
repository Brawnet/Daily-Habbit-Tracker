import { openDB } from 'idb';
import { STORES } from '../shared/contracts.js';

export const DB_NAME = 'habbit';
export const DB_VERSION = 2;

let dbPromise = null;

/**
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.HABITS)) {
          db.createObjectStore(STORES.HABITS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.CHECK_INS)) {
          const checkInsStore = db.createObjectStore(STORES.CHECK_INS, { keyPath: 'id' });
          checkInsStore.createIndex('habitId', 'habitId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.JOURNAL_ENTRIES)) {
          db.createObjectStore(STORES.JOURNAL_ENTRIES, { keyPath: 'day' });
        }
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
          db.createObjectStore(STORES.OUTBOX, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.ACTIVITIES)) {
          db.createObjectStore(STORES.ACTIVITIES, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Closes the active DB connection and resets the singleton promise.
 */
export async function closeDb() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
