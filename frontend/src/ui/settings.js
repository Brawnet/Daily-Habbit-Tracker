/**
 * Habbit Settings UI View (SPEC §8, §10)
 * Manages Sync, Habits, Reminders, PWA Installation, and About info.
 */

import { getConfig, setConfig } from '../data/config.js';
import { callApi } from '../data/api.js';
import { syncNow, getSyncStatus, onSyncStatus } from '../data/sync.js';
import {
  listHabits,
  addHabit,
  renameHabit,
  moveHabit,
  setHabitArchived,
  getSetting,
  setSetting,
  onChange,
} from '../data/repo.js';
import { getInstallState, promptInstall, onInstallStateChange } from '../pwa/install.js';
import { getPushState, enablePush, sendTestPush } from '../pwa/push.js';
import { showToast } from './shell.js';
import { LINKED_ACTIVITIES } from '../shared/contracts.js';
import { extractDriveFolderId, buildDriveFolderUrl } from '../domain/drive.js';

/**
 * Escapes characters for HTML text insertion
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats ISO timestamp for last synced display
 * @param {string | null | undefined} isoString
 * @returns {string}
 */
function formatLastSynced(isoString) {
  if (!isoString) return 'Never';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Never';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today at ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  } catch {
    return 'Never';
  }
}

/**
 * Mounts the Settings view into container element.
 *
 * @param {HTMLElement} el
 * @returns {() => void} cleanup
 */
export function mount(el) {
  let isMounted = true;
  let isArchivedOpen = false;
  let editingHabitId = null;
  let isAddingHabit = false;

  const currentConfig = getConfig();

  el.innerHTML = `
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-zinc-900 dark:text-zinc-100">
      <!-- Header -->
      <header class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Configure sync, manage habits, reminders, and app preferences.
        </p>
      </header>

      <!-- Section 1: Sync -->
      <section id="settings-sync" class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4" aria-labelledby="heading-sync">
        <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <h2 id="heading-sync" class="text-base font-semibold">Sync</h2>
        </div>

        <!-- Live Sync Status Row -->
        <div id="sync-status-row" class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 text-xs sm:text-sm">
          <div class="flex items-center gap-2">
            <span id="sync-status-dot" class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors bg-zinc-400 dark:bg-zinc-600"></span>
            <span id="sync-status-text" class="font-medium text-zinc-700 dark:text-zinc-300">Checking...</span>
            <span id="sync-pending-badge" class="hidden px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">0 pending</span>
          </div>
          <div class="text-xs text-zinc-500 dark:text-zinc-400">
            Last synced: <span id="sync-last-synced" class="font-medium text-zinc-700 dark:text-zinc-300">Never</span>
          </div>
        </div>

        <!-- Credentials Form -->
        <div class="space-y-3">
          <div class="space-y-1">
            <label for="sync-gas-url" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Web App URL
            </label>
            <input
              id="sync-gas-url"
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value="${escapeHtml(currentConfig.gasUrl)}"
              class="w-full min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <label for="sync-pin" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Access PIN
            </label>
            <input
              id="sync-pin"
              type="password"
              placeholder="Enter PIN"
              value="${escapeHtml(currentConfig.pin)}"
              class="w-full min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label for="sync-diary-folder" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Diary Google Drive Folder
              </label>
              <a
                id="link-open-diary-folder"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                class="hidden text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Open in Drive ↗
              </a>
            </div>
            <input
              id="sync-diary-folder"
              type="text"
              placeholder="https://drive.google.com/drive/folders/... or Folder ID"
              class="w-full min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">
              Paste full Google Drive folder link or folder ID. Leave blank to use default &quot;Habbit Diary&quot; folder.
            </p>
          </div>
        </div>

        <!-- Sync Actions -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            id="btn-save-credentials"
            type="button"
            class="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer select-none"
          >
            Save Credentials
          </button>
          <button
            id="btn-test-connection"
            type="button"
            class="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition cursor-pointer select-none"
          >
            Test Connection
          </button>
          <button
            id="btn-sync-now"
            type="button"
            class="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition cursor-pointer select-none"
          >
            Sync Now
          </button>
        </div>
      </section>

      <!-- Section 2: Manage Habits -->
      <section id="settings-habits" class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4" aria-labelledby="heading-habits">
        <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <h2 id="heading-habits" class="text-base font-semibold">Manage Habits</h2>
        </div>

        <!-- Add Habit Form -->
        <form id="form-add-habit" class="flex flex-col sm:flex-row gap-2">
          <input
            id="input-new-habit"
            type="text"
            maxlength="60"
            placeholder="New habit name..."
            aria-label="New habit name"
            class="flex-1 min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            id="select-habit-linked-activity"
            class="min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">No Activity Link</option>
            <option value="book_summary">Link: Book Summary 📖</option>
            <option value="journal">Link: Daily Journal ✍️</option>
          </select>
          <button
            id="btn-add-habit"
            type="submit"
            class="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer select-none shrink-0"
          >
            Add Habit
          </button>
        </form>

        <!-- Active Habits List -->
        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Active Habits
          </div>
          <div id="active-habits-list" class="space-y-2">
            <div class="py-4 text-center text-zinc-400 dark:text-zinc-500 text-xs">Loading habits...</div>
          </div>
        </div>

        <!-- Archived Habits Section -->
        <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <button
            id="btn-toggle-archived"
            type="button"
            aria-expanded="false"
            aria-pressed="false"
            class="flex items-center justify-between w-full min-h-[44px] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer select-none"
          >
            <span>Archived Habits (<span id="archived-habits-count">0</span>)</span>
            <span id="archived-toggle-icon" class="text-xs transition-transform pointer-events-none">▼</span>
          </button>
          <div id="archived-habits-container" class="space-y-2 mt-2 hidden" aria-hidden="true">
            <div id="archived-habits-list" class="space-y-2"></div>
          </div>
        </div>
      </section>

      <!-- Section 3: Reminder -->
      <section id="settings-reminder" class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4" aria-labelledby="heading-reminder">
        <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <h2 id="heading-reminder" class="text-base font-semibold">Reminder</h2>
        </div>

        <!-- Time Picker -->
        <div class="space-y-1.5">
          <label for="setting-reminder-time" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Daily Reminder Time (Asia/Jakarta)
          </label>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Reminds you if there are active habits without check-ins or no journal entry today.
          </p>
          <input
            id="setting-reminder-time"
            type="time"
            value="20:00"
            class="w-full sm:w-48 min-h-[44px] px-3 py-2 text-base rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Web Push Card -->
        <div class="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs sm:text-sm font-medium">Notification Status</span>
            <span id="push-status-badge" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Checking...
            </span>
          </div>
          <p id="push-status-helper" class="text-xs text-zinc-500 dark:text-zinc-400"></p>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button
              id="btn-enable-push"
              type="button"
              class="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enable Notifications
            </button>
            <button
              id="btn-test-push"
              type="button"
              class="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Test Notification
            </button>
          </div>
        </div>
      </section>

      <!-- Section 4: Install App -->
      <section id="settings-install" class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3" aria-labelledby="heading-install">
        <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <h2 id="heading-install" class="text-base font-semibold">Install App</h2>
        </div>
        <div id="install-app-container" class="space-y-3">
          <div class="py-2 text-xs text-zinc-400">Detecting installation status...</div>
        </div>
      </section>

      <!-- Section 5: About -->
      <section id="settings-about" class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2" aria-labelledby="heading-about">
        <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <h2 id="heading-about" class="text-base font-semibold">About</h2>
        </div>
        <div class="space-y-1.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
          <p class="font-bold text-zinc-900 dark:text-zinc-100">Habbit v1.0.0</p>
          <p>Offline-first &amp; private single-user app.</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-500">
            All data is stored locally on this device and synced securely with your personal Google Apps Script backend and Google Sheets.
          </p>
        </div>
      </section>
    </div>
  `;

  // DOM references
  const syncGasUrlInput = el.querySelector('#sync-gas-url');
  const syncPinInput = el.querySelector('#sync-pin');
  const syncDiaryFolderInput = el.querySelector('#sync-diary-folder');
  const linkOpenDiaryFolder = el.querySelector('#link-open-diary-folder');
  const btnSaveCredentials = el.querySelector('#btn-save-credentials');
  const btnTestConnection = el.querySelector('#btn-test-connection');
  const btnSyncNow = el.querySelector('#btn-sync-now');
  const syncDotEl = el.querySelector('#sync-status-dot');
  const syncTextEl = el.querySelector('#sync-status-text');
  const syncPendingBadgeEl = el.querySelector('#sync-pending-badge');
  const syncLastSyncedEl = el.querySelector('#sync-last-synced');

  const formAddHabit = el.querySelector('#form-add-habit');
  const inputNewHabit = el.querySelector('#input-new-habit');
  const btnAddHabit = el.querySelector('#btn-add-habit');
  const activeHabitsListEl = el.querySelector('#active-habits-list');
  const btnToggleArchived = el.querySelector('#btn-toggle-archived');
  const archivedHabitsCountEl = el.querySelector('#archived-habits-count');
  const archivedHabitsContainerEl = el.querySelector('#archived-habits-container');
  const archivedToggleIcon = el.querySelector('#archived-toggle-icon');
  const archivedHabitsListEl = el.querySelector('#archived-habits-list');

  const settingReminderTimeInput = el.querySelector('#setting-reminder-time');
  const pushStatusBadgeEl = el.querySelector('#push-status-badge');
  const pushStatusHelperEl = el.querySelector('#push-status-helper');
  const btnEnablePush = el.querySelector('#btn-enable-push');
  const btnTestPush = el.querySelector('#btn-test-push');

  const installAppContainerEl = el.querySelector('#install-app-container');

  // Explicit value initialization for mock DOM environments
  if (syncGasUrlInput) syncGasUrlInput.value = currentConfig.gasUrl || '';
  if (syncPinInput) syncPinInput.value = currentConfig.pin || '';
  if (settingReminderTimeInput) settingReminderTimeInput.value = '20:00';
  if (btnToggleArchived) {
    btnToggleArchived.setAttribute('aria-expanded', 'false');
    btnToggleArchived.setAttribute('aria-pressed', 'false');
  }
  // --- SECTION 1: SYNC ---

  function updateSyncStatusRow(status) {
    if (!isMounted || !syncDotEl || !syncTextEl) return;
    const state = status?.state || 'not-configured';
    const pending = status?.pending || 0;
    const lastSyncedAt = status?.lastSyncedAt;

    syncDotEl.className = 'w-2.5 h-2.5 rounded-full shrink-0 transition-colors';
    switch (state) {
      case 'not-configured':
        syncDotEl.classList.add('bg-zinc-400', 'dark:bg-zinc-600');
        syncTextEl.textContent = 'Not configured';
        break;
      case 'idle':
        syncDotEl.classList.add('bg-emerald-500');
        syncTextEl.textContent = 'Synced';
        break;
      case 'syncing':
        syncDotEl.classList.add('bg-amber-400', 'animate-pulse');
        syncTextEl.textContent = 'Syncing...';
        break;
      case 'offline':
        syncDotEl.classList.add('bg-zinc-500');
        syncTextEl.textContent = 'Offline';
        break;
      case 'error':
        syncDotEl.classList.add('bg-rose-500');
        syncTextEl.textContent = status?.error ? `Error: ${status.error}` : 'Error';
        break;
      default:
        syncDotEl.classList.add('bg-zinc-400');
        syncTextEl.textContent = state;
    }

    if (pending > 0 && syncPendingBadgeEl) {
      syncPendingBadgeEl.textContent = `${pending} pending`;
      syncPendingBadgeEl.classList.remove('hidden');
    } else if (syncPendingBadgeEl) {
      syncPendingBadgeEl.textContent = '';
      syncPendingBadgeEl.classList.add('hidden');
    }

    if (syncLastSyncedEl) {
      syncLastSyncedEl.textContent = formatLastSynced(lastSyncedAt);
    }
  }

  btnSaveCredentials?.addEventListener('click', async () => {
    const gasUrl = syncGasUrlInput ? syncGasUrlInput.value.trim() : '';
    const pin = syncPinInput ? syncPinInput.value.trim() : '';
    setConfig({ gasUrl, pin });
    if (syncDiaryFolderInput) {
      const raw = (syncDiaryFolderInput.value || '').trim();
      const cleanId = extractDriveFolderId(raw);
      syncDiaryFolderInput.value = cleanId;
      updateDiaryFolderLink(cleanId);
      try {
        await setSetting('diaryFolderId', cleanId);
      } catch {}
    }
    showToast('Credentials saved');
  });

  function updateDiaryFolderLink(folderId) {
    if (!linkOpenDiaryFolder) return;
    const url = buildDriveFolderUrl(folderId);
    if (url) {
      linkOpenDiaryFolder.setAttribute('href', url);
      linkOpenDiaryFolder.classList.remove('hidden');
    } else {
      linkOpenDiaryFolder.classList.add('hidden');
      linkOpenDiaryFolder.removeAttribute('href');
    }
  }

  async function loadDiaryFolderSetting() {
    if (!isMounted || !syncDiaryFolderInput) return;
    if (typeof document !== 'undefined' && document.activeElement === syncDiaryFolderInput) {
      return;
    }
    try {
      const val = await getSetting('diaryFolderId');
      if (!isMounted) return;
      syncDiaryFolderInput.value = val || '';
      updateDiaryFolderLink(val || '');
    } catch {
      syncDiaryFolderInput.value = '';
      updateDiaryFolderLink('');
    }
  }

  syncDiaryFolderInput?.addEventListener('change', async () => {
    if (!syncDiaryFolderInput) return;
    const raw = (syncDiaryFolderInput.value || '').trim();
    const cleanId = extractDriveFolderId(raw);
    if (raw && !cleanId) {
      showToast('Invalid Google Drive folder link or ID');
      syncDiaryFolderInput.value = '';
      updateDiaryFolderLink('');
      await setSetting('diaryFolderId', '');
      return;
    }
    syncDiaryFolderInput.value = cleanId;
    updateDiaryFolderLink(cleanId);
    try {
      await setSetting('diaryFolderId', cleanId);
      showToast(cleanId ? 'Drive folder saved' : 'Drive folder reset to default');
    } catch (err) {
      showToast(err.message || 'Failed to save Drive folder');
    }
  });

  btnTestConnection?.addEventListener('click', async () => {
    if (!btnTestConnection) return;
    btnTestConnection.disabled = true;
    const originalText = btnTestConnection.textContent;
    btnTestConnection.textContent = 'Testing...';
    try {
      const res = await callApi('ping');
      const timeStr = res?.serverTime ? ` Server time: ${res.serverTime}` : '';
      const tzStr = res?.timeZone ? ` (${res.timeZone})` : '';
      showToast(`Connected!${timeStr}${tzStr}`);
    } catch (err) {
      const errMsg = `Connection failed: ${err.message || 'Error'}`;
      if (typeof alert === 'function') {
        try {
          alert(errMsg);
        } catch {}
      }
      showToast(errMsg);
    } finally {
      if (isMounted && btnTestConnection) {
        btnTestConnection.disabled = false;
        btnTestConnection.textContent = originalText;
      }
    }
  });

  btnSyncNow?.addEventListener('click', async () => {
    if (!btnSyncNow) return;
    btnSyncNow.disabled = true;
    const originalText = btnSyncNow.textContent;
    btnSyncNow.textContent = 'Syncing...';
    try {
      await syncNow();
      showToast('Sync complete');
    } catch (err) {
      showToast(`Sync failed: ${err.message || 'Error'}`);
    } finally {
      if (isMounted && btnSyncNow) {
        btnSyncNow.disabled = false;
        btnSyncNow.textContent = originalText;
      }
    }
  });

  // --- SECTION 2: MANAGE HABITS ---

  async function renderHabits() {
    if (!isMounted || !activeHabitsListEl || !archivedHabitsListEl) return;
    if (editingHabitId) return;

    try {
      const allHabits = await listHabits({ includeArchived: true });
      if (!isMounted) return;

      const activeHabits = allHabits.filter((h) => !h.archived);
      const archivedHabits = allHabits.filter((h) => h.archived);

      // Render Active Habits
      if (activeHabits.length === 0) {
        activeHabitsListEl.innerHTML = `
          <div class="py-6 text-center text-zinc-400 dark:text-zinc-500 text-xs sm:text-sm">
            No active habits yet. Add your first habit above!
          </div>
        `;
      } else {
        activeHabitsListEl.innerHTML = '';
        activeHabits.forEach((habit, index) => {
          const isFirst = index === 0;
          const isLast = index === activeHabits.length - 1;

          const row = document.createElement('div');
          row.className =
            'habit-row flex items-center justify-between gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40';
          row.dataset.habitId = habit.id;

          // Habit name & inline rename trigger
          const nameWrapper = document.createElement('div');
          nameWrapper.className = 'flex items-center gap-1.5 flex-1 min-w-0';

          const nameSpan = document.createElement('span');
          nameSpan.className =
            'habit-name flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer truncate py-2 px-2 min-h-[44px] flex items-center rounded-lg transition';
          nameSpan.textContent = habit.name;
          nameSpan.title = 'Click to rename';
          nameSpan.setAttribute('role', 'button');
          nameSpan.setAttribute('tabindex', '0');

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className =
            'btn-edit btn-rename min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer transition';
          editBtn.setAttribute('aria-label', `Rename ${habit.name}`);
          editBtn.innerHTML = `
            <svg class="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          `;

          if (habit.linkedActivity) {
            const badge = document.createElement('span');
            badge.className =
              'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0';
            badge.textContent = habit.linkedActivity === LINKED_ACTIVITIES.BOOK_SUMMARY ? '📖 Book' : '✍️ Journal';
            nameWrapper.appendChild(badge);
          }
          nameWrapper.appendChild(nameSpan);
          nameWrapper.appendChild(editBtn);

          const startRename = () => {
            editingHabitId = habit.id;
            const form = document.createElement('form');
            form.className = 'rename-form flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 min-w-0';

            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 60;
            input.value = habit.name;
            input.className =
              'rename-input input-rename flex-1 min-h-[44px] px-3 py-1.5 text-base rounded-lg border-2 border-indigo-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none';
            input.setAttribute('aria-label', `New name for ${habit.name}`);

            const select = document.createElement('select');
            select.className =
              'select-edit-linked-activity min-h-[44px] px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
            select.setAttribute('aria-label', `Linked activity for ${habit.name}`);

            const optNone = document.createElement('option');
            optNone.value = '';
            optNone.textContent = 'No Link';
            optNone.selected = !habit.linkedActivity;
            select.appendChild(optNone);

            const optBook = document.createElement('option');
            optBook.value = 'book_summary';
            optBook.textContent = 'Book Summary 📖';
            optBook.selected = habit.linkedActivity === 'book_summary';
            select.appendChild(optBook);

            const optJournal = document.createElement('option');
            optJournal.value = 'journal';
            optJournal.textContent = 'Daily Journal ✍️';
            optJournal.selected = habit.linkedActivity === 'journal';
            select.appendChild(optJournal);

            const saveBtn = document.createElement('button');
            saveBtn.type = 'submit';
            saveBtn.className =
              'px-3 py-1.5 min-h-[44px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition shrink-0';
            saveBtn.textContent = 'Save';

            form.appendChild(input);
            form.appendChild(select);
            form.appendChild(saveBtn);
            nameWrapper.replaceWith(form);
            input.focus();
            if (typeof input.select === 'function') input.select();

            let finished = false;
            const commit = async () => {
              if (finished) return;
              finished = true;
              editingHabitId = null;
              const newName = input.value.trim();
              const newLinked = select.value || null;
              if (newName && (newName !== habit.name || newLinked !== (habit.linkedActivity || null))) {
                try {
                  await renameHabit(habit.id, newName, newLinked);
                  showToast('Habit updated');
                } catch (err) {
                  showToast(err.message || 'Failed to update habit');
                }
              }
              await renderHabits();
            };

            form.addEventListener('submit', (e) => {
              e.preventDefault();
              commit();
            });

            input.addEventListener('blur', () => {
              commit();
            });

            input.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                finished = true;
                editingHabitId = null;
                renderHabits();
              }
            });
          };

          nameSpan.addEventListener('click', startRename);
          nameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startRename();
            }
          });
          editBtn.addEventListener('click', startRename);

          // Action buttons: Move up, Move down, Archive
          const actionsWrapper = document.createElement('div');
          actionsWrapper.className = 'flex items-center gap-1 shrink-0';

          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className =
            'btn-move-up min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed select-none transition';
          upBtn.setAttribute('aria-label', 'Move up');
          upBtn.title = 'Move up';
          upBtn.textContent = '▲';
          if (isFirst) upBtn.disabled = true;
          upBtn.addEventListener('click', async () => {
            try {
              await moveHabit(habit.id, 'up');
              await renderHabits();
            } catch (err) {
              showToast(err.message || 'Failed to move habit');
            }
          });

          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className =
            'btn-move-down min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed select-none transition';
          downBtn.setAttribute('aria-label', 'Move down');
          downBtn.title = 'Move down';
          downBtn.textContent = '▼';
          if (isLast) downBtn.disabled = true;
          downBtn.addEventListener('click', async () => {
            try {
              await moveHabit(habit.id, 'down');
              await renderHabits();
            } catch (err) {
              showToast(err.message || 'Failed to move habit');
            }
          });

          const archiveBtn = document.createElement('button');
          archiveBtn.type = 'button';
          archiveBtn.className =
            'btn-archive min-h-[44px] px-3 text-xs font-semibold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer select-none';
          archiveBtn.setAttribute('aria-label', `Archive ${habit.name}`);
          archiveBtn.textContent = 'Archive';
          archiveBtn.addEventListener('click', async () => {
            try {
              archiveBtn.disabled = true;
              await setHabitArchived(habit.id, true);
              showToast('Habit archived');
              await renderHabits();
            } catch (err) {
              showToast(err.message || 'Failed to archive habit');
            }
          });

          actionsWrapper.appendChild(upBtn);
          actionsWrapper.appendChild(downBtn);
          actionsWrapper.appendChild(archiveBtn);

          row.appendChild(nameWrapper);
          row.appendChild(actionsWrapper);
          activeHabitsListEl.appendChild(row);
        });
      }

      // Render Archived Habits
      if (archivedHabitsCountEl) {
        archivedHabitsCountEl.textContent = String(archivedHabits.length);
      }
      if (archivedHabits.length === 0) {
        archivedHabitsListEl.innerHTML = `
          <div class="py-3 text-center text-zinc-400 dark:text-zinc-500 text-xs">
            No archived habits.
          </div>
        `;
      } else {
        archivedHabitsListEl.innerHTML = '';
        archivedHabits.forEach((habit) => {
          const row = document.createElement('div');
          row.className =
            'habit-archived-row flex items-center justify-between gap-2 p-2.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/20';
          row.dataset.habitId = habit.id;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'text-sm text-zinc-500 dark:text-zinc-400 line-through truncate flex-1';
          nameSpan.textContent = habit.name;

          const restoreBtn = document.createElement('button');
          restoreBtn.type = 'button';
          restoreBtn.className =
            'btn-restore min-h-[44px] px-3 text-xs font-semibold rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 transition cursor-pointer select-none';
          restoreBtn.setAttribute('aria-label', `Restore ${habit.name}`);
          restoreBtn.textContent = 'Restore';
          restoreBtn.addEventListener('click', async () => {
            try {
              restoreBtn.disabled = true;
              await setHabitArchived(habit.id, false);
              showToast('Habit restored');
              await renderHabits();
            } catch (err) {
              showToast(err.message || 'Failed to restore habit');
            }
          });

          row.appendChild(nameSpan);
          row.appendChild(restoreBtn);
          archivedHabitsListEl.appendChild(row);
        });
      }
    } catch (err) {
      console.error('Failed to load habits in settings:', err);
    }
  }

  const handleAddHabit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (isAddingHabit || !inputNewHabit) return;

    const name = inputNewHabit.value.trim();
    if (!name) return;

    isAddingHabit = true;
    try {
      const linkedSelect = el.querySelector('#select-habit-linked-activity');
      const linkedActivity = linkedSelect?.value || null;
      await addHabit(name, { linkedActivity });
      inputNewHabit.value = '';
      showToast('Habit added');
      await renderHabits();
    } catch (err) {
      showToast(err.message || 'Failed to add habit');
    } finally {
      isAddingHabit = false;
      if (isMounted && btnAddHabit) btnAddHabit.disabled = false;
    }
  };

  formAddHabit?.addEventListener('submit', handleAddHabit);
  btnAddHabit?.addEventListener('click', handleAddHabit);

  btnToggleArchived?.addEventListener('click', () => {
    if (!archivedHabitsContainerEl) return;
    isArchivedOpen = !isArchivedOpen;
    btnToggleArchived.setAttribute('aria-expanded', isArchivedOpen ? 'true' : 'false');
    btnToggleArchived.setAttribute('aria-pressed', isArchivedOpen ? 'true' : 'false');

    if (isArchivedOpen) {
      archivedHabitsContainerEl.classList.remove('hidden');
      archivedHabitsContainerEl.removeAttribute('aria-hidden');
      if (archivedToggleIcon) archivedToggleIcon.classList.add('rotate-180');
    } else {
      archivedHabitsContainerEl.classList.add('hidden');
      archivedHabitsContainerEl.setAttribute('aria-hidden', 'true');
      if (archivedToggleIcon) archivedToggleIcon.classList.remove('rotate-180');
    }
  });

  // --- SECTION 3: REMINDER ---

  async function loadReminderSetting() {
    if (!isMounted || !settingReminderTimeInput) return;
    if (typeof document !== 'undefined' && document.activeElement === settingReminderTimeInput) {
      return;
    }
    try {
      const val = await getSetting('reminderTime');
      if (!isMounted) return;
      settingReminderTimeInput.value = val || '20:00';
    } catch {
      settingReminderTimeInput.value = '20:00';
    }
  }

  settingReminderTimeInput?.addEventListener('change', async () => {
    const val = settingReminderTimeInput.value || '20:00';
    try {
      await setSetting('reminderTime', val);
      showToast('Reminder time saved');
    } catch (err) {
      showToast(err.message || 'Failed to save reminder');
    }
  });

  async function updatePushUi() {
    if (!isMounted || !pushStatusBadgeEl || !pushStatusHelperEl) return;
    let state = 'unsupported';
    try {
      state = await getPushState();
    } catch {
      state = 'unsupported';
    }
    if (!isMounted) return;

    let badgeText = state;
    let badgeClass = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    let helperText = '';
    let enableDisabled = false;

    switch (state) {
      case 'subscribed':
        badgeText = 'Subscribed ✓';
        badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
        helperText = 'Push notifications are active. Reminders will arrive daily.';
        enableDisabled = true;
        break;
      case 'default':
        badgeText = 'Not enabled';
        badgeClass = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
        helperText = 'Enable notifications to get daily reminders on this device.';
        enableDisabled = false;
        break;
      case 'denied':
        badgeText = 'Permission denied';
        badgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
        helperText = 'Notifications are blocked. Please enable them in browser settings.';
        enableDisabled = true;
        break;
      case 'needs-install':
        badgeText = 'Needs install';
        badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
        helperText = 'On iOS Safari, install Habbit to Home Screen first to enable push notifications.';
        enableDisabled = true;
        break;
      case 'unsupported':
      default:
        badgeText = 'Unsupported';
        badgeClass = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
        helperText = 'Web Push is not supported on this browser or platform.';
        enableDisabled = true;
        break;
    }

    pushStatusBadgeEl.textContent = badgeText;
    pushStatusBadgeEl.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`;
    pushStatusHelperEl.textContent = helperText;

    if (btnEnablePush) {
      btnEnablePush.disabled = enableDisabled;
      if (state === 'subscribed') {
        btnEnablePush.textContent = 'Notifications Enabled ✓';
      } else {
        btnEnablePush.textContent = 'Enable Notifications';
      }
    }
  }

  btnEnablePush?.addEventListener('click', async () => {
    if (!btnEnablePush) return;
    btnEnablePush.disabled = true;
    try {
      const ok = await enablePush();
      await updatePushUi();
      if (ok) {
        showToast('Notifications enabled');
      } else {
        showToast('Notification permission not granted');
      }
    } catch (err) {
      showToast(`Failed: ${err.message || 'Could not enable push'}`);
      await updatePushUi();
    }
  });

  btnTestPush?.addEventListener('click', async () => {
    if (!btnTestPush) return;
    btnTestPush.disabled = true;
    const originalText = btnTestPush.textContent;
    btnTestPush.textContent = 'Sending...';
    try {
      await sendTestPush();
      showToast('Test notification sent');
    } catch (err) {
      showToast(`Failed: ${err.message || 'Could not send test push'}`);
    } finally {
      if (isMounted && btnTestPush) {
        btnTestPush.disabled = false;
        btnTestPush.textContent = originalText;
      }
    }
  });

  // --- SECTION 4: INSTALL APP ---

  function renderInstallSection(state) {
    if (!installAppContainerEl || !isMounted) return;
    installAppContainerEl.innerHTML = '';

    if (state === 'installed') {
      const card = document.createElement('div');
      card.className =
        'flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300';
      card.innerHTML = `
        <span class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
        <div>
          <p class="text-sm font-semibold">Installed ✓</p>
          <p class="text-xs text-emerald-700 dark:text-emerald-400">Habbit is running as an installed standalone application.</p>
        </div>
      `;
      installAppContainerEl.appendChild(card);
    } else if (state === 'android-prompt') {
      const card = document.createElement('div');
      card.className = 'space-y-3';
      card.innerHTML = `
        <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Install Habbit on your home screen for quick offline access and standalone experience.</p>
        <button id="btn-prompt-install" type="button" class="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer select-none">
          Install App
        </button>
      `;
      installAppContainerEl.appendChild(card);

      const btn = card.querySelector('#btn-prompt-install');
      btn?.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const accepted = await promptInstall();
          if (accepted) {
            showToast('Installation accepted');
          }
        } catch {
          showToast('Install prompt failed');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    } else if (state === 'ios-safari') {
      const card = document.createElement('div');
      card.className =
        'p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 space-y-2';
      card.innerHTML = `
        <div class="flex items-start gap-2.5">
          <span class="text-xl leading-none">📲</span>
          <div class="space-y-1">
            <p class="text-sm font-semibold text-indigo-950 dark:text-indigo-200">To install on iOS: Tap Share ➔ Add to Home Screen.</p>
            <p class="text-xs text-indigo-800 dark:text-indigo-300">Installed app has separate storage. Please configure Sync after installing.</p>
          </div>
        </div>
      `;
      installAppContainerEl.appendChild(card);
    } else {
      const card = document.createElement('div');
      card.className = 'text-xs text-zinc-500 dark:text-zinc-400 p-1';
      card.textContent = 'Web app installation is not supported by your current browser environment.';
      installAppContainerEl.appendChild(card);
    }
  }

  // Initial loads
  updateSyncStatusRow(getSyncStatus());
  renderInstallSection(getInstallState());
  renderHabits();
  loadDiaryFolderSetting();
  loadReminderSetting();
  updatePushUi();

  // Subscriptions
  const unsubSync = onSyncStatus((status) => {
    if (!isMounted) return;
    updateSyncStatusRow(status);
  });

  const unsubChange = onChange(async () => {
    if (!isMounted) return;
    await renderHabits();
    await loadDiaryFolderSetting();
    await loadReminderSetting();
  });

  const unsubInstall = onInstallStateChange((state) => {
    if (!isMounted) return;
    renderInstallSection(state);
  });

  // Cleanup handler
  return () => {
    isMounted = false;
    unsubSync();
    unsubChange();
    unsubInstall();
  };
}
