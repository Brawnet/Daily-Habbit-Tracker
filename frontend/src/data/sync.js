import { getDb } from './db.js';
import { isConfigured } from './config.js';
import { callApi } from './api.js';
import { getOutboxEntries, removeOutboxEntries, countOutbox } from './outbox.js';
import { applyIncomingChanges } from './merge.js';
import { STORES } from '../shared/contracts.js';
import { notifyChange } from './repo.js';

let inFlightPromise = null;
let scheduleTimer = null;
let autoSyncCleanup = null;

/**
 * @type {import('../shared/contracts.js').SyncStatus}
 */
let currentStatus = {
  state: isConfigured() ? 'idle' : 'not-configured',
  pending: 0,
  lastSyncedAt: null,
  error: null,
};

const statusListeners = new Set();

function notifyRepoChange() {
  try {
    notifyChange();
  } catch {
    // repo might not be initialized or listeners throw
  }
}

function updateSyncStatus(partial) {
  currentStatus = { ...currentStatus, ...partial };
  const snapshot = getSyncStatus();
  for (const listener of statusListeners) {
    try {
      listener(snapshot);
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * @returns {import('../shared/contracts.js').SyncStatus}
 */
export function getSyncStatus() {
  return { ...currentStatus };
}

/**
 * Refreshes pending count and lastSyncedAt from IndexedDB.
 */
export async function refreshSyncMeta() {
  try {
    const db = await getDb();
    const count = await countOutbox(db);
    const metaRecord = await db.get(STORES.META, 'lastSyncedAt');
    updateSyncStatus({
      pending: count,
      lastSyncedAt: metaRecord?.value ?? currentStatus.lastSyncedAt,
      state: !isConfigured()
        ? 'not-configured'
        : currentStatus.state === 'not-configured'
        ? 'idle'
        : currentStatus.state,
    });
  } catch {
    // Ignore if DB not ready
  }
}

/**
 * @param {(status: import('../shared/contracts.js').SyncStatus) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onSyncStatus(listener) {
  statusListeners.add(listener);
  try {
    listener(getSyncStatus());
  } catch (err) {
    console.error(err);
  }
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * Runs a single sync cycle.
 *
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function runSync({ throwOnError = false } = {}) {
  if (!isConfigured()) {
    updateSyncStatus({ state: 'not-configured', error: null });
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    updateSyncStatus({ state: 'offline', error: 'Network is offline' });
    return;
  }

  const db = await getDb();
  const outboxEntries = await getOutboxEntries(db);
  const cursorRecord = await db.get(STORES.META, 'cursor');
  const cursor = cursorRecord?.value ?? null;

  updateSyncStatus({
    state: 'syncing',
    pending: outboxEntries.length,
    error: null,
  });

  const changes = {
    habits: [],
    checkIns: [],
    journalEntries: [],
    settings: [],
  };
  const sentItems = [];
  for (const entry of outboxEntries) {
    if (changes[entry.type]) {
      changes[entry.type].push(entry.record);
      sentItems.push({ key: entry.key, updatedAt: entry.updatedAt });
    }
  }

  let res;
  try {
    res = await callApi('sync', { since: cursor, changes });
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') {
      updateSyncStatus({ state: 'not-configured', error: err.message });
    } else if (err.code === 'OFFLINE' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      updateSyncStatus({ state: 'offline', error: err.message });
    } else {
      updateSyncStatus({ state: 'error', error: err.message || 'Sync failed' });
    }

    if (throwOnError) {
      throw err;
    }
    return;
  }

  // 1. Remove outbox entries whose updatedAt matches what was sent
  await removeOutboxEntries(sentItems, db);

  // 2. Merge incoming changes via merge.js into local DB
  await applyIncomingChanges(db, {
    changes: res.changes || {},
    rejected: res.rejected || [],
  });

  // 3. Update cursor and lastSyncedAt
  const now = new Date().toISOString();
  const metaTx = db.transaction(STORES.META, 'readwrite');
  if (res.cursor) {
    await metaTx.store.put({ key: 'cursor', value: res.cursor });
  }
  await metaTx.store.put({ key: 'lastSyncedAt', value: now });
  await metaTx.done;

  // 4. Update sync status
  const remainingPending = await countOutbox(db);
  updateSyncStatus({
    state: 'idle',
    pending: remainingPending,
    lastSyncedAt: now,
    error: null,
  });

  // 5. Notify repository listeners
  notifyRepoChange();
}

/**
 * Single in-flight sync operation.
 * Concurrent callers await the same in-flight sync operation.
 *
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function syncNow(options = {}) {
  if (inFlightPromise) {
    return inFlightPromise;
  }
  inFlightPromise = runSync(options);
  try {
    await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
}

/**
 * Debounced sync trigger.
 *
 * @param {number} [delayMs=3000]
 */
export function scheduleSync(delayMs = 3000) {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    syncNow().catch(() => {});
  }, delayMs);
}

/**
 * Starts auto-sync with online, visibilitychange, and periodic interval listeners.
 *
 * @returns {() => void} cleanup
 */
export function startAutoSync() {
  if (autoSyncCleanup) {
    return autoSyncCleanup;
  }

  if (isConfigured()) {
    syncNow().catch(() => {});
  }

  const handleOnline = () => {
    if (isConfigured()) {
      syncNow().catch(() => {});
    }
  };

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isConfigured()) {
      syncNow().catch(() => {});
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  const intervalId = setInterval(() => {
    if (isConfigured()) {
      syncNow().catch(() => {});
    }
  }, 5 * 60 * 1000);

  autoSyncCleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    clearInterval(intervalId);
    autoSyncCleanup = null;
  };

  return autoSyncCleanup;
}

/**
 * Stops auto-sync.
 */
export function stopAutoSync() {
  if (autoSyncCleanup) {
    autoSyncCleanup();
  }
}

/**
 * Internal testing helper to reset timers and status.
 */
export function _resetSyncForTesting() {
  clearTimeout(scheduleTimer);
  scheduleTimer = null;
  if (autoSyncCleanup) {
    autoSyncCleanup();
  }
  inFlightPromise = null;
  currentStatus = {
    state: isConfigured() ? 'idle' : 'not-configured',
    pending: 0,
    lastSyncedAt: null,
    error: null,
  };
}
