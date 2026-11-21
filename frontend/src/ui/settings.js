/**
 * Habbit Settings UI View (SPEC §8, §10)
 * Manages Appearance, Sync, Habits, Reminders, PWA Installation, and About info.
 */

import { getConfig, setConfig, isValidGasUrl } from '../data/config.js';
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
import { THEME_MODES, getThemePreference, setThemePreference } from './theme.js';
import { LINKED_ACTIVITIES } from '../shared/contracts.js';
import {
  partitionAndSortHabits,
  formatScheduledTime,
  hasScheduledTime,
} from '../domain/schedule.js';

const THEME_OPTIONS = Object.freeze([
  { value: THEME_MODES.LIGHT, label: 'Light' },
  { value: THEME_MODES.DARK, label: 'Dark' },
  { value: THEME_MODES.SYSTEM, label: 'System' },
]);

const THEME_OPTION_BASE_CLASS =
  'flex-1 min-h-[44px] min-w-[44px] px-3 py-2 text-xs sm:text-sm rounded-lg cursor-pointer select-none transition tactile-spring';
const THEME_OPTION_ACTIVE_CLASS =
  'bg-[#FFFFFF] dark:bg-[#22201E] text-[#1C1B18] dark:text-[#F4F1EA] shadow-sm border border-[#E6E4DF] dark:border-[#33302C] font-semibold';
const THEME_OPTION_INACTIVE_CLASS =
  'bg-transparent text-[#68655F] dark:text-[#A39E93] hover:text-[#1C1B18] dark:hover:text-[#F4F1EA] border border-transparent font-medium';

/**
 * Builds the per-Device Appearance card with Light / Dark / System segmented radio control.
 *
 * @param {'light' | 'dark' | 'system'} initialPreference
 * @param {(theme: 'light' | 'dark' | 'system') => void} onSelectTheme
 * @returns {HTMLElement}
 */
function createAppearanceSection(initialPreference, onSelectTheme) {
  const section = document.createElement('section');
  section.id = 'settings-appearance';
  section.className =
    'editorial-card p-4 sm:p-5 space-y-4 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
  section.setAttribute('aria-labelledby', 'heading-appearance');

  const titleRow = document.createElement('div');
  titleRow.className =
    'flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3';

  const heading = document.createElement('h2');
  heading.id = 'heading-appearance';
  heading.className = 'text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]';
  heading.textContent = 'Appearance';
  titleRow.appendChild(heading);

  const helper = document.createElement('p');
  helper.className = 'text-xs text-[#68655F] dark:text-[#A39E93]';
  helper.textContent =
    'Choose how Habbit looks on this Device. System follows your Device theme.';

  const radioGroup = document.createElement('div');
  radioGroup.id = 'theme-segmented-control';
  radioGroup.className =
    'grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C]';
  radioGroup.setAttribute('role', 'radiogroup');
  radioGroup.setAttribute('aria-label', 'Theme');

  const buttons = [];

  function syncSelection(selectedValue) {
    for (const btn of buttons) {
      const isSelected = btn.dataset.themeOption === selectedValue;
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.setAttribute('tabindex', isSelected ? '0' : '-1');
      btn.className = `${THEME_OPTION_BASE_CLASS} ${
        isSelected ? THEME_OPTION_ACTIVE_CLASS : THEME_OPTION_INACTIVE_CLASS
      }`;
    }
  }

  function selectTheme(value) {
    syncSelection(value);
    onSelectTheme(value);
  }

  THEME_OPTIONS.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `theme-option-${option.value}`;
    btn.dataset.themeOption = option.value;
    btn.setAttribute('role', 'radio');
    btn.textContent = option.label;

    btn.addEventListener('click', () => {
      selectTheme(option.value);
    });

    btn.addEventListener('keydown', (e) => {
      let nextIndex = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (index + 1) % THEME_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (index - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      }
      if (nextIndex === null) return;
      e.preventDefault?.();
      const targetOption = THEME_OPTIONS[nextIndex];
      const targetBtn = buttons[nextIndex];
      targetBtn?.focus?.();
      selectTheme(targetOption.value);
    });

    buttons.push(btn);
    radioGroup.appendChild(btn);
  });

  syncSelection(initialPreference);

  section.appendChild(titleRow);
  section.appendChild(helper);
  section.appendChild(radioGroup);
  return section;
}

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

  el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-[#1C1B18] dark:text-[#F4F1EA]';

  const header = document.createElement('header');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-serif font-semibold tracking-tight text-[#1C1B18] dark:text-[#F4F1EA]">Settings</h1>
    <p class="text-xs sm:text-sm text-[#6E6A63] dark:text-[#A39E93]">
      Configure appearance, sync, manage habits, reminders, and app preferences.
    </p>
  `;

  const appearanceSection = createAppearanceSection(getThemePreference(), (theme) => {
    setThemePreference(theme);
  });

  const syncSectionContainer = document.createElement('div');
  syncSectionContainer.className = 'space-y-6';
  syncSectionContainer.innerHTML = `
      <!-- Section 1: Sync -->
      <section id="settings-sync" class="editorial-card p-4 sm:p-5 space-y-4 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]" aria-labelledby="heading-sync">
        <div class="flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3">
          <h2 id="heading-sync" class="text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">Sync</h2>
        </div>

        <!-- Live Sync Status Row -->
        <div id="sync-status-row" class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C] text-xs sm:text-sm font-mono">
          <div class="flex items-center gap-2">
            <span id="sync-status-dot" class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors bg-zinc-400 dark:bg-zinc-600"></span>
            <span id="sync-status-text" class="font-medium text-[#1C1B18] dark:text-[#F4F1EA]">Checking...</span>
            <span id="sync-pending-badge" class="hidden px-2 py-0.5 rounded-full text-xs font-semibold font-mono badge-ochre">0 pending</span>
          </div>
          <div class="text-xs text-[#68655F] dark:text-[#A39E93] font-mono">
            Last synced: <span id="sync-last-synced" class="font-medium text-[#1C1B18] dark:text-[#F4F1EA]">Never</span>
          </div>
        </div>

        <!-- Credentials Form -->
        <div class="space-y-3">
          <div class="space-y-1">
            <label for="sync-gas-url" class="block text-xs font-medium text-[#68655F] dark:text-[#A39E93] font-mono">
              Web App URL
            </label>
            <input
              id="sync-gas-url"
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value="${escapeHtml(currentConfig.gasUrl)}"
              class="w-full min-h-[44px] px-3.5 py-2 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51]"
            />
          </div>

          <div class="space-y-1">
            <label for="sync-pin" class="block text-xs font-medium text-[#68655F] dark:text-[#A39E93] font-mono">
              Access PIN
            </label>
            <input
              id="sync-pin"
              type="password"
              placeholder="Enter PIN"
              value="${escapeHtml(currentConfig.pin)}"
              class="w-full min-h-[44px] px-3.5 py-2 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51]"
            />
          </div>
        </div>

        <!-- Sync Actions -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            id="btn-save-credentials"
            type="button"
            class="btn-terracotta min-h-[44px] px-5 py-2 text-sm font-semibold rounded-lg cursor-pointer select-none tactile-spring"
          >
            Save Credentials
          </button>
          <button
            id="btn-test-connection"
            type="button"
            class="btn-secondary-surface min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] transition cursor-pointer select-none tactile-spring"
          >
            Test Connection
          </button>
          <button
            id="btn-sync-now"
            type="button"
            class="btn-secondary-surface min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] transition cursor-pointer select-none tactile-spring"
          >
            Sync Now
          </button>
        </div>
      </section>
  `;

  // Section 2: Manage Habits (built via createElement so both browser & unit tests interact with live elements)
  const habitsSection = document.createElement('section');
  habitsSection.id = 'settings-habits';
  habitsSection.className =
    'editorial-card p-4 sm:p-5 space-y-4 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]';
  habitsSection.setAttribute('aria-labelledby', 'heading-habits');

  const habitsTitleRow = document.createElement('div');
  habitsTitleRow.className =
    'flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3';
  const headingHabits = document.createElement('h2');
  headingHabits.id = 'heading-habits';
  headingHabits.className = 'text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]';
  headingHabits.textContent = 'Manage Habits';
  habitsTitleRow.appendChild(headingHabits);
  habitsSection.appendChild(habitsTitleRow);

  const formAddHabit = document.createElement('form');
  formAddHabit.id = 'form-add-habit';
  formAddHabit.className = 'flex flex-col gap-2';

  const inputNewHabit = document.createElement('input');
  inputNewHabit.id = 'input-new-habit';
  inputNewHabit.type = 'text';
  inputNewHabit.maxLength = 60;
  inputNewHabit.placeholder = 'New habit name...';
  inputNewHabit.setAttribute('aria-label', 'New habit name');
  inputNewHabit.className =
    'w-full min-h-[44px] px-3.5 py-2 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] placeholder-[#68655F] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
  inputNewHabit.style.fontSize = '16px';

  const addHabitMetaRow = document.createElement('div');
  addHabitMetaRow.className = 'flex flex-col sm:flex-row gap-2';

  const addTimeWrap = document.createElement('div');
  addTimeWrap.className = 'flex items-center gap-2 sm:w-auto';

  const newHabitTimeLabel = document.createElement('label');
  newHabitTimeLabel.htmlFor = 'input-new-habit-time';
  newHabitTimeLabel.className = 'sr-only';
  newHabitTimeLabel.textContent = 'Scheduled Time (optional)';

  const inputNewHabitTime = document.createElement('input');
  inputNewHabitTime.id = 'input-new-habit-time';
  inputNewHabitTime.type = 'time';
  inputNewHabitTime.setAttribute('aria-label', 'Scheduled time (optional)');
  inputNewHabitTime.className =
    'flex-1 sm:w-40 min-h-[44px] min-w-[44px] px-3.5 py-2 text-base font-mono rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
  inputNewHabitTime.style.fontSize = '16px';

  const btnClearNewHabitTime = document.createElement('button');
  btnClearNewHabitTime.id = 'btn-clear-new-habit-time';
  btnClearNewHabitTime.type = 'button';
  btnClearNewHabitTime.setAttribute('aria-label', 'Clear scheduled time');
  btnClearNewHabitTime.className =
    'btn-secondary-surface min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-mono font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] cursor-pointer shrink-0 tactile-spring';
  btnClearNewHabitTime.textContent = 'Clear';

  addTimeWrap.appendChild(newHabitTimeLabel);
  addTimeWrap.appendChild(inputNewHabitTime);
  addTimeWrap.appendChild(btnClearNewHabitTime);

  const selectHabitLinkedActivity = document.createElement('select');
  selectHabitLinkedActivity.id = 'select-habit-linked-activity';
  selectHabitLinkedActivity.setAttribute('aria-label', 'Link to activity');
  selectHabitLinkedActivity.className =
    'flex-1 min-h-[44px] px-3.5 py-2 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
  selectHabitLinkedActivity.style.fontSize = '16px';

  const addOptNone = document.createElement('option');
  addOptNone.value = '';
  addOptNone.textContent = 'No Activity Link';
  selectHabitLinkedActivity.appendChild(addOptNone);

  const addOptBook = document.createElement('option');
  addOptBook.value = 'book_summary';
  addOptBook.textContent = 'Link: Book Summary 📖';
  selectHabitLinkedActivity.appendChild(addOptBook);

  const addOptJournal = document.createElement('option');
  addOptJournal.value = 'journal';
  addOptJournal.textContent = 'Link: Daily Journal ✍️';
  selectHabitLinkedActivity.appendChild(addOptJournal);

  const btnAddHabit = document.createElement('button');
  btnAddHabit.id = 'btn-add-habit';
  btnAddHabit.type = 'submit';
  btnAddHabit.className =
    'btn-terracotta min-h-[44px] min-w-[44px] px-5 py-2 text-sm font-semibold rounded-lg cursor-pointer select-none shrink-0 tactile-spring';
  btnAddHabit.textContent = 'Add Habit';

  addHabitMetaRow.appendChild(addTimeWrap);
  addHabitMetaRow.appendChild(selectHabitLinkedActivity);
  addHabitMetaRow.appendChild(btnAddHabit);
  formAddHabit.appendChild(inputNewHabit);
  formAddHabit.appendChild(addHabitMetaRow);
  habitsSection.appendChild(formAddHabit);

  const activeHabitsBlock = document.createElement('div');
  activeHabitsBlock.className = 'space-y-2';
  const activeHabitsLabel = document.createElement('div');
  activeHabitsLabel.className = 'text-xs font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93]';
  activeHabitsLabel.textContent = 'Active Habits';
  const activeHabitsListEl = document.createElement('div');
  activeHabitsListEl.id = 'active-habits-list';
  activeHabitsListEl.className = 'space-y-4';
  const loadingHabitsEl = document.createElement('div');
  loadingHabitsEl.className = 'py-4 text-center text-zinc-400 dark:text-zinc-500 text-xs';
  loadingHabitsEl.textContent = 'Loading habits...';
  activeHabitsListEl.appendChild(loadingHabitsEl);
  activeHabitsBlock.appendChild(activeHabitsLabel);
  activeHabitsBlock.appendChild(activeHabitsListEl);
  habitsSection.appendChild(activeHabitsBlock);

  const archivedSectionWrap = document.createElement('div');
  archivedSectionWrap.className = 'pt-2 border-t border-[#E6E4DF] dark:border-[#33302C]';
  const btnToggleArchived = document.createElement('button');
  btnToggleArchived.id = 'btn-toggle-archived';
  btnToggleArchived.type = 'button';
  btnToggleArchived.setAttribute('aria-expanded', 'false');
  btnToggleArchived.setAttribute('aria-pressed', 'false');
  btnToggleArchived.className =
    'flex items-center justify-between w-full min-h-[44px] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93] bg-[#F6F5F2] dark:bg-[#161514] hover:bg-[#EFECE6] dark:hover:bg-[#2C2926] rounded-lg transition cursor-pointer select-none border border-[#E6E4DF] dark:border-[#33302C]';
  const archivedBtnTextSpan = document.createElement('span');
  const archivedBtnPrefix = document.createElement('span');
  archivedBtnPrefix.textContent = 'Archived Habits (';
  const archivedHabitsCountEl = document.createElement('span');
  archivedHabitsCountEl.id = 'archived-habits-count';
  archivedHabitsCountEl.textContent = '0';
  const archivedBtnSuffix = document.createElement('span');
  archivedBtnSuffix.textContent = ')';
  archivedBtnTextSpan.appendChild(archivedBtnPrefix);
  archivedBtnTextSpan.appendChild(archivedHabitsCountEl);
  archivedBtnTextSpan.appendChild(archivedBtnSuffix);
  const archivedToggleIcon = document.createElement('span');
  archivedToggleIcon.id = 'archived-toggle-icon';
  archivedToggleIcon.className = 'text-xs transition-transform pointer-events-none';
  archivedToggleIcon.textContent = '▼';
  btnToggleArchived.appendChild(archivedBtnTextSpan);
  btnToggleArchived.appendChild(archivedToggleIcon);

  const archivedHabitsContainerEl = document.createElement('div');
  archivedHabitsContainerEl.id = 'archived-habits-container';
  archivedHabitsContainerEl.className = 'space-y-2 mt-2 hidden';
  archivedHabitsContainerEl.setAttribute('aria-hidden', 'true');
  const archivedHabitsListEl = document.createElement('div');
  archivedHabitsListEl.id = 'archived-habits-list';
  archivedHabitsListEl.className = 'space-y-2';
  archivedHabitsContainerEl.appendChild(archivedHabitsListEl);
  archivedSectionWrap.appendChild(btnToggleArchived);
  archivedSectionWrap.appendChild(archivedHabitsContainerEl);
  habitsSection.appendChild(archivedSectionWrap);

  const restSectionsContainer = document.createElement('div');
  restSectionsContainer.className = 'space-y-6';
  restSectionsContainer.innerHTML = `
      <!-- Section 3: Reminder -->
      <section id="settings-reminder" class="editorial-card p-4 sm:p-5 space-y-4 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]" aria-labelledby="heading-reminder">
        <div class="flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3">
          <h2 id="heading-reminder" class="text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">Reminder</h2>
        </div>

        <!-- Time Picker -->
        <div class="space-y-1.5">
          <label for="setting-reminder-time" class="block text-xs font-medium text-[#68655F] dark:text-[#A39E93]">
            Daily Reminder Time (Asia/Jakarta)
          </label>
          <p class="text-xs text-[#68655F] dark:text-[#A39E93]">
            Reminds you if there are active habits without check-ins or no journal entry today.
          </p>
          <input
            id="setting-reminder-time"
            type="time"
            value="20:00"
            class="w-full sm:w-48 min-h-[44px] px-3.5 py-2 text-base font-mono rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]"
          />
        </div>

        <!-- Web Push Card -->
        <div class="p-3.5 rounded-lg bg-[#F6F5F2] dark:bg-[#161514] border border-[#E6E4DF] dark:border-[#33302C] space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs sm:text-sm font-medium">Notification Status</span>
            <span id="push-status-badge" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono bg-[#EFECE6] text-[#68655F] dark:bg-[#2C2926] dark:text-[#A39E93]">
              Checking...
            </span>
          </div>
          <p id="push-status-helper" class="text-xs text-[#68655F] dark:text-[#A39E93]"></p>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button
              id="btn-enable-push"
              type="button"
              class="btn-terracotta min-h-[44px] px-5 py-2 text-sm font-semibold rounded-lg cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed tactile-spring"
            >
              Enable Notifications
            </button>
            <button
              id="btn-test-push"
              type="button"
              class="btn-secondary-surface min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] transition cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed tactile-spring"
            >
              Send Test Notification
            </button>
          </div>
        </div>
      </section>

      <!-- Section 4: Install App -->
      <section id="settings-install" class="editorial-card p-4 sm:p-5 space-y-3 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]" aria-labelledby="heading-install">
        <div class="flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3">
          <h2 id="heading-install" class="text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">Install App</h2>
        </div>
        <div id="install-app-container" class="space-y-3">
          <div class="py-2 text-xs text-zinc-400">Detecting installation status...</div>
        </div>
      </section>

      <!-- Section 5: About -->
      <section id="settings-about" class="editorial-card p-4 sm:p-5 space-y-2 bg-[#FFFFFF] dark:bg-[#22201E] border-[#E6E4DF] dark:border-[#33302C]" aria-labelledby="heading-about">
        <div class="flex items-center justify-between border-b border-[#E6E4DF] dark:border-[#33302C] pb-3">
          <h2 id="heading-about" class="text-base font-serif font-semibold text-[#1C1B18] dark:text-[#F4F1EA]">About</h2>
        </div>
        <div class="space-y-1.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
          <p class="font-bold text-zinc-900 dark:text-zinc-100">Habbit v1.0.0</p>
          <p>Offline-first &amp; private single-user app.</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-500">
            All data is stored locally on this device and synced securely with your personal Google Apps Script backend and Google Sheets.
          </p>
        </div>
      </section>
  `;

  wrapper.appendChild(header);
  wrapper.appendChild(appearanceSection);
  wrapper.appendChild(syncSectionContainer);
  wrapper.appendChild(habitsSection);
  wrapper.appendChild(restSectionsContainer);
  el.appendChild(wrapper);

  // DOM references
  const syncGasUrlInput = el.querySelector('#sync-gas-url');
  const syncPinInput = el.querySelector('#sync-pin');
  const btnSaveCredentials = el.querySelector('#btn-save-credentials');
  const btnTestConnection = el.querySelector('#btn-test-connection');
  const btnSyncNow = el.querySelector('#btn-sync-now');
  const syncDotEl = el.querySelector('#sync-status-dot');
  const syncTextEl = el.querySelector('#sync-status-text');
  const syncPendingBadgeEl = el.querySelector('#sync-pending-badge');
  const syncLastSyncedEl = el.querySelector('#sync-last-synced');

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
  btnClearNewHabitTime.addEventListener('click', () => {
    inputNewHabitTime.value = '';
  });
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

  btnSaveCredentials?.addEventListener('click', () => {
    const gasUrl = syncGasUrlInput ? syncGasUrlInput.value.trim() : '';
    const pin = syncPinInput ? syncPinInput.value.trim() : '';
    try {
      setConfig({ gasUrl, pin });
      showToast('Credentials saved');
    } catch (err) {
      showToast(err.message || 'Failed to save credentials');
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

  function createMoveButton({ habit, direction, isScheduled, isBoundary }) {
    const isUp = direction === 'up';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${isUp ? 'btn-move-up' : 'btn-move-down'} min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-[#E6E4DF] dark:border-[#33302C] text-[#68655F] dark:text-[#A39E93] ${
      isScheduled
        ? 'opacity-35 cursor-not-allowed'
        : 'hover:bg-[#EFECE6] dark:hover:bg-[#2C2926] disabled:opacity-30 disabled:cursor-not-allowed'
    } select-none transition tactile-spring`;
    btn.setAttribute('aria-label', isUp ? 'Move up' : 'Move down');
    btn.title = isScheduled
      ? 'Scheduled habits follow clock order automatically'
      : isUp
        ? 'Move up'
        : 'Move down';
    btn.textContent = isUp ? '▲' : '▼';

    if (isScheduled) {
      btn.setAttribute('aria-disabled', 'true');
      btn.dataset.lockedMove = 'true';
      btn.addEventListener('click', () => {
        showToast('Scheduled habits follow clock order — clear time to reorder');
      });
    } else {
      if (isBoundary) {
        btn.disabled = true;
      }
      btn.addEventListener('click', async () => {
        try {
          await moveHabit(habit.id, direction);
          await renderHabits();
        } catch (err) {
          showToast(err.message || 'Failed to move habit');
        }
      });
    }
    return btn;
  }

  function createActiveHabitRow(habit, { isScheduled, isFirstAnytime, isLastAnytime }) {
    const row = document.createElement('div');
    row.className =
      'habit-row editorial-card flex items-center justify-between gap-2 p-2.5 bg-[#FFFFFF] dark:bg-[#161514] border-[#E6E4DF] dark:border-[#33302C]';
    row.dataset.habitId = habit.id;

    // Habit name & inline rename trigger
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'flex flex-wrap items-center gap-1.5 flex-1 min-w-0';

    const nameSpan = document.createElement('span');
    nameSpan.className =
      'habit-name flex-1 min-w-[120px] text-sm font-medium text-[#1C1B18] dark:text-[#F4F1EA] hover:text-[#C86D51] dark:hover:text-[#D97E63] cursor-pointer truncate py-2 px-2 min-h-[44px] flex items-center rounded-lg transition';
    nameSpan.textContent = habit.name;
    nameSpan.title = 'Click to rename';
    nameSpan.setAttribute('role', 'button');
    nameSpan.setAttribute('tabindex', '0');

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'btn-edit btn-rename min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer transition shrink-0';
    editBtn.setAttribute('aria-label', `Rename ${habit.name}`);
    editBtn.innerHTML = `
      <svg class="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    `;

    if (hasScheduledTime(habit)) {
      const timeBadge = document.createElement('span');
      timeBadge.className =
        'habit-scheduled-time-badge text-xs font-mono font-semibold px-2 py-0.5 rounded-full badge-ochre shrink-0';
      timeBadge.dataset.scheduledTime = habit.scheduledTime;
      timeBadge.textContent = formatScheduledTime(habit.scheduledTime);
      nameWrapper.appendChild(timeBadge);
    }

    if (habit.linkedActivity) {
      const badge = document.createElement('span');
      const isBook = habit.linkedActivity === LINKED_ACTIVITIES.BOOK_SUMMARY;
      badge.className = `text-[10px] font-semibold font-mono uppercase px-2 py-0.5 rounded-full ${isBook ? 'badge-slate' : 'badge-rose'} shrink-0`;
      badge.textContent = isBook ? '📖 Book' : '✍️ Journal';
      nameWrapper.appendChild(badge);
    }
    nameWrapper.appendChild(nameSpan);
    nameWrapper.appendChild(editBtn);

    const startRename = () => {
      editingHabitId = habit.id;
      const form = document.createElement('form');
      form.className = 'rename-form flex-1 flex flex-col gap-2 min-w-0';

      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 60;
      input.value = habit.name;
      input.className =
        'rename-input input-rename w-full min-h-[44px] px-3 py-1.5 text-base rounded-lg border-2 border-[#C86D51] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none';
      input.setAttribute('aria-label', `New name for ${habit.name}`);
      input.style.fontSize = '16px';

      const editControlsRow = document.createElement('div');
      editControlsRow.className = 'flex flex-wrap items-center gap-1.5';

      const editTimeInput = document.createElement('input');
      editTimeInput.type = 'time';
      editTimeInput.value = habit.scheduledTime || '';
      editTimeInput.className =
        'input-edit-scheduled-time min-h-[44px] min-w-[44px] px-2.5 py-1.5 text-base font-mono rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
      editTimeInput.setAttribute('aria-label', `Scheduled time for ${habit.name}`);
      editTimeInput.style.fontSize = '16px';

      const clearEditTimeBtn = document.createElement('button');
      clearEditTimeBtn.type = 'button';
      clearEditTimeBtn.className =
        'btn-clear-edit-time btn-secondary-surface min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs font-mono font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] cursor-pointer shrink-0 tactile-spring';
      clearEditTimeBtn.setAttribute('aria-label', `Clear scheduled time for ${habit.name}`);
      clearEditTimeBtn.textContent = 'Clear';
      clearEditTimeBtn.addEventListener('click', () => {
        editTimeInput.value = '';
      });

      const select = document.createElement('select');
      select.className =
        'select-edit-linked-activity min-h-[44px] px-2.5 py-1.5 text-base rounded-lg border border-[#E6E4DF] dark:border-[#33302C] bg-[#F6F5F2] dark:bg-[#161514] text-[#1C1B18] dark:text-[#F4F1EA] focus:outline-none focus:ring-2 focus:ring-[#C86D51]';
      select.setAttribute('aria-label', `Linked activity for ${habit.name}`);
      select.style.fontSize = '16px';

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
      select.value = habit.linkedActivity || '';

      const cancelEditBtn = document.createElement('button');
      cancelEditBtn.type = 'button';
      cancelEditBtn.className =
        'btn-cancel-edit btn-secondary-surface px-3 py-1.5 min-h-[44px] min-w-[44px] text-xs font-mono font-medium rounded-lg border border-[#E6E4DF] dark:border-[#33302C] cursor-pointer transition shrink-0 tactile-spring';
      cancelEditBtn.textContent = 'Cancel';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className =
        'btn-terracotta px-4 py-1.5 min-h-[44px] min-w-[44px] text-xs font-mono font-semibold rounded-lg cursor-pointer transition shrink-0 tactile-spring';
      saveBtn.textContent = 'Save';

      editControlsRow.appendChild(editTimeInput);
      editControlsRow.appendChild(clearEditTimeBtn);
      editControlsRow.appendChild(select);
      editControlsRow.appendChild(cancelEditBtn);
      editControlsRow.appendChild(saveBtn);

      form.appendChild(input);
      form.appendChild(editControlsRow);
      nameWrapper.replaceWith(form);
      input.focus();
      if (typeof input.select === 'function') input.select();

      let finished = false;
      const cancelRename = () => {
        if (finished) return;
        finished = true;
        editingHabitId = null;
        renderHabits();
      };

      const commit = async () => {
        if (finished) return;
        finished = true;
        editingHabitId = null;
        const newName = input.value.trim();
        const newLinked = select.value || null;
        const newScheduledTime = (editTimeInput.value || '').trim();
        const prevScheduledTime = habit.scheduledTime || '';
        if (
          newName &&
          (newName !== habit.name ||
            newLinked !== (habit.linkedActivity || null) ||
            newScheduledTime !== prevScheduledTime)
        ) {
          try {
            await renameHabit(habit.id, newName, newLinked, newScheduledTime);
            showToast('Habit updated');
          } catch (err) {
            showToast(err.message || 'Failed to update habit');
          }
        }
        await renderHabits();
      };

      form.addEventListener('submit', (e) => {
        e?.preventDefault?.();
        commit();
      });

      saveBtn.addEventListener('click', (e) => {
        e?.preventDefault?.();
        commit();
      });

      cancelEditBtn.addEventListener('click', cancelRename);

      form.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e?.preventDefault?.();
          cancelRename();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e?.preventDefault?.();
          cancelRename();
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

    const upBtn = createMoveButton({
      habit,
      direction: 'up',
      isScheduled,
      isBoundary: isFirstAnytime,
    });
    const downBtn = createMoveButton({
      habit,
      direction: 'down',
      isScheduled,
      isBoundary: isLastAnytime,
    });

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className =
      'btn-archive min-h-[44px] px-3.5 text-xs font-mono font-semibold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer select-none tactile-spring';
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
    return row;
  }

  async function renderHabits() {
    if (!isMounted || !activeHabitsListEl || !archivedHabitsListEl) return;
    if (editingHabitId) return;

    try {
      const allHabits = await listHabits({ includeArchived: true });
      if (!isMounted) return;

      const activeHabits = allHabits.filter((h) => !h.archived);
      const archivedHabits = allHabits.filter((h) => h.archived);

      // Render Active Habits
      activeHabitsListEl.innerHTML = '';
      if (activeHabits.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'py-6 text-center text-zinc-400 dark:text-zinc-500 text-xs sm:text-sm';
        emptyEl.textContent = 'No active habits yet. Add your first habit above!';
        activeHabitsListEl.appendChild(emptyEl);
      } else {
        const { scheduled, anytime } = partitionAndSortHabits(activeHabits);

        if (scheduled.length > 0) {
          const scheduledGroup = document.createElement('div');
          scheduledGroup.id = 'settings-scheduled-habits-group';
          scheduledGroup.className = 'space-y-2';

          const schedHeader = document.createElement('div');
          schedHeader.className = 'space-y-0.5';

          const schedHeading = document.createElement('h3');
          schedHeading.className =
            'text-xs font-mono font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93]';
          schedHeading.textContent = 'Scheduled';

          const schedNote = document.createElement('p');
          schedNote.id = 'settings-scheduled-order-note';
          schedNote.className = 'text-xs text-[#68655F] dark:text-[#A39E93]';
          schedNote.textContent =
            "Scheduled habits follow clock order automatically. Clear a habit's time to reorder it manually.";

          schedHeader.appendChild(schedHeading);
          schedHeader.appendChild(schedNote);
          scheduledGroup.appendChild(schedHeader);

          scheduled.forEach((habit) => {
            scheduledGroup.appendChild(
              createActiveHabitRow(habit, {
                isScheduled: true,
                isFirstAnytime: false,
                isLastAnytime: false,
              })
            );
          });
          activeHabitsListEl.appendChild(scheduledGroup);
        }

        if (anytime.length > 0) {
          const anytimeGroup = document.createElement('div');
          anytimeGroup.id = 'settings-anytime-habits-group';
          anytimeGroup.className = 'space-y-2';

          if (scheduled.length > 0) {
            const anytimeHeading = document.createElement('h3');
            anytimeHeading.id = 'settings-anytime-habits-heading';
            anytimeHeading.className =
              'text-xs font-mono font-semibold uppercase tracking-wider text-[#68655F] dark:text-[#A39E93] pt-1';
            anytimeHeading.textContent = 'Anytime';
            anytimeGroup.appendChild(anytimeHeading);
          }

          anytime.forEach((habit, index) => {
            anytimeGroup.appendChild(
              createActiveHabitRow(habit, {
                isScheduled: false,
                isFirstAnytime: index === 0,
                isLastAnytime: index === anytime.length - 1,
              })
            );
          });
          activeHabitsListEl.appendChild(anytimeGroup);
        }
      }

      // Render Archived Habits
      if (archivedHabitsCountEl) {
        archivedHabitsCountEl.textContent = String(archivedHabits.length);
      }
      archivedHabitsListEl.innerHTML = '';
      if (archivedHabits.length === 0) {
        const noArchivedEl = document.createElement('div');
        noArchivedEl.className = 'py-3 text-center text-zinc-400 dark:text-zinc-500 text-xs';
        noArchivedEl.textContent = 'No archived habits.';
        archivedHabitsListEl.appendChild(noArchivedEl);
      } else {
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
            'btn-restore min-h-[44px] px-3.5 text-xs font-mono font-semibold rounded-lg text-[#3D6B58] dark:text-[#5F8776] hover:bg-[#EEF5F2] dark:hover:bg-[rgba(61,107,88,0.22)] border border-[rgba(61,107,88,0.3)] transition cursor-pointer select-none tactile-spring';
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
      const linkedActivity = selectHabitLinkedActivity?.value || null;
      const scheduledTime = inputNewHabitTime ? inputNewHabitTime.value.trim() : '';
      await addHabit(name, { linkedActivity, scheduledTime });
      inputNewHabit.value = '';
      if (inputNewHabitTime) inputNewHabitTime.value = '';
      if (selectHabitLinkedActivity) selectHabitLinkedActivity.value = '';
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
