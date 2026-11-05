import { STORES } from '../shared/contracts.js';

export const TYPE_CONFIG = Object.freeze({
  habits: {
    storeName: STORES.HABITS,
    getKey: (r) => r.id,
  },
  checkIns: {
    storeName: STORES.CHECK_INS,
    getKey: (r) => r.id,
  },
  journalEntries: {
    storeName: STORES.JOURNAL_ENTRIES,
    getKey: (r) => r.day,
  },
  settings: {
    storeName: STORES.SETTINGS,
    getKey: (r) => r.key,
  },
  activities: {
    storeName: STORES.ACTIVITIES,
    getKey: (r) => r.id,
  },
});

/**
 * Checks whether a day string is a valid calendar date in YYYY-MM-DD format.
 * @param {string} day
 * @returns {boolean}
 */
export function isValidDayString(day) {
  if (!day || typeof day !== 'string') return false;
  const match = day.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const dayNum = parseInt(match[3], 10);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || dayNum < 1 || dayNum > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, dayNum));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === dayNum;
}

/**
 * Validates the schema shape of an incoming record.
 * @param {string} type
 * @param {any} record
 * @returns {boolean}
 */
export function isValidRecordShape(type, record) {
  if (!record || typeof record !== 'object') return false;
  switch (type) {
    case 'habits':
      return typeof record.id === 'string' && record.id.trim() !== '';
    case 'checkIns':
      return (
        typeof record.id === 'string' &&
        record.id.trim() !== '' &&
        typeof record.habitId === 'string' &&
        record.habitId.trim() !== '' &&
        isValidDayString(record.day)
      );
    case 'journalEntries':
      return isValidDayString(record.day);
    case 'settings':
      return typeof record.key === 'string' && record.key.trim() !== '';
    case 'activities':
      return typeof record.id === 'string' && record.id.trim() !== '';
    default:
      return false;
  }
}

/**
 * Determines whether the incoming server record wins against local.
 *
 * Rules:
 * - If rejected with reason 'LOCKED', server record takes precedence.
 * - If local record does not exist, incoming wins.
 * - If local has an un-synced outbox record with newer updatedAt, local wins.
 * - Otherwise, incoming.updatedAt > local.updatedAt wins.
 *
 * @param {{ incoming: any, local?: any, outboxEntry?: any, isLocked?: boolean }} params
 * @returns {boolean}
 */
export function shouldIncomingWin({ incoming, local, outboxEntry, isLocked = false }) {
  if (isLocked) {
    return true;
  }
  if (!local) {
    return true;
  }
  if (outboxEntry) {
    const outboxTime = outboxEntry.updatedAt || outboxEntry.record?.updatedAt || '';
    const incomingTime = incoming.updatedAt || '';
    if (outboxTime > incomingTime) {
      return false;
    }
    return true;
  }
  const localTime = local.updatedAt || '';
  const incomingTime = incoming.updatedAt || '';
  return incomingTime > localTime;
}

/**
 * Merges an incoming record with local state and outbox.
 *
 * @param {keyof typeof TYPE_CONFIG} type
 * @param {any} incoming
 * @param {any} [local]
 * @param {any} [outboxEntry]
 * @param {boolean} [isLocked]
 * @returns {{ winner: 'incoming' | 'local', record: any, removeFromOutbox: boolean }}
 */
export function mergeRecord(type, incoming, local, outboxEntry, isLocked = false) {
  const incomingWins = shouldIncomingWin({ incoming, local, outboxEntry, isLocked });

  let resultRecord;
  let removeFromOutbox = false;

  if (incomingWins) {
    resultRecord = { ...incoming };
    if (outboxEntry || isLocked) {
      removeFromOutbox = true;
    }
  } else {
    resultRecord = { ...local };
    removeFromOutbox = false;
  }

  // Journal entries: printedToDiaryAt is owned by server and always adopted from server
  if (type === 'journalEntries') {
    const serverPrintedAt = incoming?.printedToDiaryAt || '';
    if (serverPrintedAt) {
      resultRecord.printedToDiaryAt = serverPrintedAt;
    }
  }

  return {
    winner: incomingWins ? 'incoming' : 'local',
    record: resultRecord,
    removeFromOutbox,
  };
}

/**
 * Applies incoming sync changes and rejected items to local stores and outbox.
 *
 * @param {import('idb').IDBPDatabase} db
 * @param {{ changes?: Record<string, Array<any>>, rejected?: Array<{ type: string, key: string, reason: string }> }} syncResult
 * @returns {Promise<{ applied: number, locked: number }>}
 */
export async function applyIncomingChanges(db, { changes = {}, rejected = [] } = {}) {
  const lockedKeysByType = {
    habits: new Set(),
    checkIns: new Set(),
    journalEntries: new Set(),
    settings: new Set(),
    activities: new Set(),
  };
  for (const item of rejected) {
    if (item.reason === 'LOCKED' && lockedKeysByType[item.type]) {
      lockedKeysByType[item.type].add(item.key);
    }
  }

  const tx = db.transaction(
    [
      STORES.HABITS,
      STORES.CHECK_INS,
      STORES.JOURNAL_ENTRIES,
      STORES.SETTINGS,
      STORES.ACTIVITIES,
      STORES.OUTBOX,
    ],
    'readwrite'
  );
  let applied = 0;
  let locked = 0;

  // 1. Process rejected LOCKED records that may not be in changes list
  for (const [type, keys] of Object.entries(lockedKeysByType)) {
    for (const key of keys) {
      locked++;
      const outboxKey = `${type}:${key}`;
      await tx.objectStore(STORES.OUTBOX).delete(outboxKey);
    }
  }

  // 2. Process incoming changes
  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const incomingList = changes[type];
    if (!Array.isArray(incomingList) || incomingList.length === 0) {
      continue;
    }

    const store = tx.objectStore(config.storeName);
    const outboxStore = tx.objectStore(STORES.OUTBOX);
    const lockedSet = lockedKeysByType[type] || new Set();

    for (const incoming of incomingList) {
      if (!isValidRecordShape(type, incoming)) {
        continue;
      }
      const key = config.getKey(incoming);
      const isLocked = lockedSet.has(key);
      const outboxKey = `${type}:${key}`;

      const local = await store.get(key);
      const outboxEntry = await outboxStore.get(outboxKey);

      const mergeResult = mergeRecord(type, incoming, local, outboxEntry, isLocked);

      if (mergeResult.winner === 'incoming') {
        await store.put(mergeResult.record);
        if (mergeResult.removeFromOutbox) {
          await outboxStore.delete(outboxKey);
        }
        applied++;
      } else {
        // Local won. If journal entry adopted printedToDiaryAt from server, persist that update.
        if (type === 'journalEntries' && mergeResult.record.printedToDiaryAt !== local?.printedToDiaryAt) {
          await store.put(mergeResult.record);
          if (outboxEntry) {
            outboxEntry.record = {
              ...outboxEntry.record,
              printedToDiaryAt: mergeResult.record.printedToDiaryAt,
            };
            await outboxStore.put(outboxEntry);
          }
        }
      }
    }
  }

  await tx.done;
  return { applied, locked };
}
