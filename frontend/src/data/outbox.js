import { getDb } from './db.js';
import { STORES } from '../shared/contracts.js';

/**
 * @typedef {{ key: string, type: string, recordKey: string, record: any, updatedAt: string }} OutboxEntry
 */

/**
 * @param {import('idb').IDBPDatabase | import('idb').IDBPTransaction} [dbOrTx]
 * @returns {Promise<Array<OutboxEntry>>}
 */
export async function getOutboxEntries(dbOrTx) {
  const db = dbOrTx || (await getDb());
  if ('getAll' in db) {
    return db.getAll(STORES.OUTBOX);
  }
  return db.objectStore(STORES.OUTBOX).getAll();
}

/**
 * @param {import('idb').IDBPDatabase | import('idb').IDBPTransaction} [dbOrTx]
 * @returns {Promise<number>}
 */
export async function countOutbox(dbOrTx) {
  const db = dbOrTx || (await getDb());
  if ('count' in db) {
    return db.count(STORES.OUTBOX);
  }
  return db.objectStore(STORES.OUTBOX).count();
}

/**
 * @param {string} type
 * @param {string} recordKey
 * @param {any} record
 * @param {import('idb').IDBPDatabase | import('idb').IDBPTransaction} [dbOrTx]
 * @returns {Promise<string>}
 */
export async function putOutboxEntry(type, recordKey, record, dbOrTx) {
  const key = `${type}:${recordKey}`;
  const entry = {
    key,
    type,
    recordKey,
    record,
    updatedAt: record.updatedAt,
  };

  const db = dbOrTx || (await getDb());
  if ('put' in db) {
    return db.put(STORES.OUTBOX, entry);
  }
  return db.objectStore(STORES.OUTBOX).put(entry);
}

/**
 * Removes outbox entries by key only if their updatedAt matches what was sent.
 * If the record was modified locally while sync was in-flight, it is retained.
 *
 * @param {Array<{ key: string, updatedAt: string }>} sentItems
 * @param {import('idb').IDBPDatabase | import('idb').IDBPTransaction} [dbOrTx]
 * @returns {Promise<void>}
 */
export async function removeOutboxEntries(sentItems, dbOrTx) {
  if (!sentItems || sentItems.length === 0) return;

  const db = dbOrTx || (await getDb());
  const isTransaction = !('transaction' in db);

  const tx = isTransaction
    ? db
    : db.transaction(STORES.OUTBOX, 'readwrite');
  const store = isTransaction ? tx.objectStore(STORES.OUTBOX) : tx.store;

  for (const item of sentItems) {
    const existing = await store.get(item.key);
    if (existing && existing.updatedAt === item.updatedAt) {
      await store.delete(item.key);
    }
  }

  if (!isTransaction) {
    await tx.done;
  }
}

/**
 * @param {import('idb').IDBPDatabase | import('idb').IDBPTransaction} [dbOrTx]
 * @returns {Promise<void>}
 */
export async function clearOutbox(dbOrTx) {
  const db = dbOrTx || (await getDb());
  if ('clear' in db) {
    return db.clear(STORES.OUTBOX);
  }
  return db.objectStore(STORES.OUTBOX).clear();
}
