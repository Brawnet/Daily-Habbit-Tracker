/**
 * Habbit Master UI Shell (SPEC §8, §10)
 * Builds header, sync status indicator, tab container, bottom nav, and floating toasts.
 */

import { getSyncStatus, onSyncStatus, syncNow } from '../data/sync.js';
import { today, msUntilNextDay } from '../domain/day.js';

/**
 * @typedef {{ title: string, icon: string, mount: (el: HTMLElement) => (() => void) | void }} TabDescriptor
 */

/** @type {Record<string, TabDescriptor>} */
const registeredTabs = {};

let currentTab = null;
let currentCleanup = null;
let lastRenderedDay = null;
let midnightTimeout = null;

let shellMounted = false;
let rootElement = null;
let tabContentElement = null;
let bottomNavElement = null;
let syncDotElement = null;
let syncTextElement = null;
let syncBadgeElement = null;
let syncButtonElement = null;

function getCurrentDayString() {
  try {
    return today();
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Updates header sync indicator UI
 * @param {import('../shared/contracts.js').SyncStatus} status
 */
function updateSyncIndicator(status) {
  if (!syncDotElement || !syncTextElement || !syncBadgeElement) return;

  const state = status?.state || 'not-configured';
  const pending = status?.pending || 0;

  // Reset dot styling classes
  syncDotElement.className = 'inline-block w-2.5 h-2.5 rounded-full shrink-0 transition-colors';

  switch (state) {
    case 'not-configured':
      syncDotElement.classList.add('bg-zinc-400', 'dark:bg-zinc-600');
      syncTextElement.textContent = 'Not configured';
      break;
    case 'idle':
      syncDotElement.classList.add('bg-emerald-500');
      syncTextElement.textContent = 'Synced';
      break;
    case 'syncing':
      syncDotElement.classList.add('bg-amber-400', 'animate-pulse');
      syncTextElement.textContent = 'Syncing...';
      break;
    case 'offline':
      syncDotElement.classList.add('bg-zinc-500');
      syncTextElement.textContent = 'Offline';
      break;
    case 'error':
      syncDotElement.classList.add('bg-rose-500');
      syncTextElement.textContent = 'Error';
      break;
    default:
      syncDotElement.classList.add('bg-zinc-400');
      syncTextElement.textContent = state;
  }

  // Update pending badge
  if (pending > 0) {
    syncBadgeElement.textContent = pending > 99 ? '99+' : String(pending);
    syncBadgeElement.classList.remove('hidden');
  } else {
    syncBadgeElement.textContent = '';
    syncBadgeElement.classList.add('hidden');
  }
}

function renderBottomNavButtons() {
  if (!bottomNavElement) return;
  bottomNavElement.innerHTML = '';

  const tabKeys = Object.keys(registeredTabs);
  for (const name of tabKeys) {
    const tab = registeredTabs[name];
    const isActive = name === currentTab;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.role = 'tab';
    btn.id = `tab-btn-${name}`;
    btn.dataset.tab = name;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'tab-content');
    btn.className = `flex flex-col items-center justify-center flex-1 min-w-[44px] min-h-[44px] py-1 px-2 text-xs transition cursor-pointer select-none ${
      isActive
        ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
    }`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tab-icon flex items-center justify-center pointer-events-none w-6 h-6';
    iconSpan.innerHTML = tab.icon || '';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'tab-title text-[11px] mt-0.5 pointer-events-none';
    labelSpan.textContent = tab.title || name;

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(name);
    });

    bottomNavElement.appendChild(btn);
  }
}

function handleDayChangeCheck() {
  const currentDay = getCurrentDayString();
  if (lastRenderedDay && currentDay !== lastRenderedDay) {
    lastRenderedDay = currentDay;
    if (currentTab && registeredTabs[currentTab]) {
      navigate(currentTab, false);
    }
  } else {
    lastRenderedDay = currentDay;
  }
}

function scheduleMidnightCheck() {
  if (midnightTimeout) {
    clearTimeout(midnightTimeout);
    midnightTimeout = null;
  }

  let ms = 60000;
  try {
    ms = msUntilNextDay();
  } catch {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    ms = midnight.getTime() - now.getTime();
  }

  const delay = Math.max(ms + 200, 1000);
  midnightTimeout = setTimeout(() => {
    handleDayChangeCheck();
    scheduleMidnightCheck();
  }, delay);
}

/**
 * Registers a tab descriptor into the master shell.
 * @param {string} name
 * @param {TabDescriptor} config
 */
export function registerTab(name, { title, icon, mount }) {
  registeredTabs[name] = { title, icon, mount };
  if (shellMounted) {
    renderBottomNavButtons();
  }
}

/**
 * Switches the active tab, executes previous cleanup, and mounts new tab.
 * @param {string} name
 * @param {boolean} [updateUrl=true]
 */
export function navigate(name, updateUrl = true) {
  if (!registeredTabs[name]) {
    return;
  }

  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (err) {
      console.error('Error during tab cleanup:', err);
    }
    currentCleanup = null;
  }

  currentTab = name;

  // Update Bottom Nav active state
  if (bottomNavElement) {
    const buttons = bottomNavElement.querySelectorAll('button[data-tab]');
    for (const btn of buttons) {
      const isSelected = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        btn.className =
          'flex flex-col items-center justify-center flex-1 min-w-[44px] min-h-[44px] py-1 px-2 text-xs transition cursor-pointer select-none text-indigo-600 dark:text-indigo-400 font-semibold';
      } else {
        btn.className =
          'flex flex-col items-center justify-center flex-1 min-w-[44px] min-h-[44px] py-1 px-2 text-xs transition cursor-pointer select-none text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200';
      }
    }
  }

  // Update URL parameter
  if (updateUrl && typeof window !== 'undefined' && window.location && window.history) {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== name) {
        url.searchParams.set('tab', name);
        window.history.replaceState({ tab: name }, '', url.toString());
      }
    } catch {}
  }

  // Mount tab content
  if (tabContentElement) {
    tabContentElement.innerHTML = '';
    try {
      const cleanup = registeredTabs[name].mount(tabContentElement);
      if (typeof cleanup === 'function') {
        currentCleanup = cleanup;
      }
    } catch (err) {
      console.error(`Error mounting tab "${name}":`, err);
      tabContentElement.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full p-6 text-center text-zinc-500">
          <p class="text-sm font-medium">Unable to display ${registeredTabs[name].title || name}</p>
        </div>
      `;
    }
  }
}

/**
 * Displays an accessible floating toast notification.
 * @param {string} message
 * @param {{ action?: { label: string, onClick: () => void } }} [options]
 * @returns {() => void} dismiss function
 */
export function showToast(message, { action } = {}) {
  let container = document.getElementById('toast-container');
  if (!container && rootElement) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.className =
      'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4';
    rootElement.appendChild(container);
  }

  if (!container) return () => {};

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className =
    'pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium transition-all duration-200 transform translate-y-0 opacity-100';

  const textSpan = document.createElement('span');
  textSpan.className = 'flex-1 text-xs sm:text-sm';
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  let timer = null;
  const dismiss = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      try {
        toast.remove();
      } catch {}
    }, 200);
  };

  if (action && action.label && typeof action.onClick === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className =
      'min-h-[36px] min-w-[44px] px-2 py-1 text-xs font-bold text-indigo-400 dark:text-indigo-600 hover:underline cursor-pointer';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        action.onClick();
      } finally {
        dismiss();
      }
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);
  timer = setTimeout(dismiss, 4000);

  return dismiss;
}

/**
 * Builds and mounts the master shell DOM inside rootEl.
 * @param {HTMLElement} rootEl
 */
export function mountShell(rootEl) {
  if (!rootEl) {
    throw new Error('mountShell requires a valid root element');
  }

  rootElement = rootEl;
  rootEl.innerHTML = '';

  const shellLayout = document.createElement('div');
  shellLayout.className = 'shell-layout flex flex-col h-full w-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 antialiased select-none';

  // --- Header ---
  const header = document.createElement('header');
  header.className =
    'flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur shrink-0';
  header.style.paddingTop = 'max(8px, env(safe-area-inset-top, 8px))';
  header.style.paddingLeft = 'max(16px, env(safe-area-inset-left, 16px))';
  header.style.paddingRight = 'max(16px, env(safe-area-inset-right, 16px))';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'flex items-center gap-2';
  const title = document.createElement('h1');
  title.className = 'text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100';
  title.textContent = 'Habbit';
  titleWrap.appendChild(title);

  const headerRight = document.createElement('div');
  headerRight.className = 'flex items-center gap-2.5';

  // Sync indicator
  const syncWrap = document.createElement('div');
  syncWrap.id = 'sync-status';
  syncWrap.className = 'flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400';
  syncWrap.setAttribute('aria-live', 'polite');

  syncDotElement = document.createElement('span');
  syncDotElement.id = 'sync-dot';
  syncDotElement.className = 'inline-block w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600 shrink-0';

  syncTextElement = document.createElement('span');
  syncTextElement.id = 'sync-text';
  syncTextElement.textContent = 'Not configured';

  syncBadgeElement = document.createElement('span');
  syncBadgeElement.id = 'sync-badge';
  syncBadgeElement.className =
    'hidden px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-full leading-none';

  syncWrap.appendChild(syncDotElement);
  syncWrap.appendChild(syncTextElement);
  syncWrap.appendChild(syncBadgeElement);

  // Sync now button
  syncButtonElement = document.createElement('button');
  syncButtonElement.id = 'sync-now-btn';
  syncButtonElement.type = 'button';
  syncButtonElement.setAttribute('aria-label', 'Sync now');
  syncButtonElement.title = 'Sync now';
  syncButtonElement.className =
    'p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 transition text-zinc-600 dark:text-zinc-300 cursor-pointer';
  syncButtonElement.innerHTML = `
    <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  `;

  syncButtonElement.addEventListener('click', async () => {
    try {
      syncButtonElement.disabled = true;
      syncButtonElement.classList.add('opacity-50');
      await syncNow();
    } catch (err) {
      showToast('Sync failed: ' + (err?.message || 'Error'));
    } finally {
      syncButtonElement.disabled = false;
      syncButtonElement.classList.remove('opacity-50');
    }
  });

  headerRight.appendChild(syncWrap);
  headerRight.appendChild(syncButtonElement);

  header.appendChild(titleWrap);
  header.appendChild(headerRight);

  // --- Main Tab Content Container ---
  tabContentElement = document.createElement('main');
  tabContentElement.id = 'tab-content';
  tabContentElement.setAttribute('role', 'tabpanel');
  tabContentElement.className = 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4';
  tabContentElement.style.paddingLeft = 'max(16px, env(safe-area-inset-left, 0px))';
  tabContentElement.style.paddingRight = 'max(16px, env(safe-area-inset-right, 0px))';

  // --- Floating Toast Container ---
  const toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.setAttribute('aria-atomic', 'true');
  toastContainer.className =
    'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4';

  // --- Bottom Navigation Bar ---
  bottomNavElement = document.createElement('nav');
  bottomNavElement.id = 'bottom-nav';
  bottomNavElement.setAttribute('role', 'tablist');
  bottomNavElement.setAttribute('aria-label', 'Main Navigation');
  bottomNavElement.className =
    'flex items-center justify-around border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur shrink-0 pt-2';
  bottomNavElement.style.paddingBottom = 'max(16px, env(safe-area-inset-bottom, 16px))';
  bottomNavElement.style.paddingLeft = 'max(8px, env(safe-area-inset-left, 8px))';
  bottomNavElement.style.paddingRight = 'max(8px, env(safe-area-inset-right, 8px))';

  shellLayout.appendChild(header);
  shellLayout.appendChild(tabContentElement);
  shellLayout.appendChild(toastContainer);
  shellLayout.appendChild(bottomNavElement);
  rootEl.appendChild(shellLayout);

  shellMounted = true;
  lastRenderedDay = getCurrentDayString();

  // Populate nav tabs
  renderBottomNavButtons();

  // Initialize sync status
  try {
    const initialStatus = getSyncStatus();
    if (initialStatus) updateSyncIndicator(initialStatus);
  } catch {}

  try {
    onSyncStatus((status) => {
      updateSyncIndicator(status);
    });
  } catch {}

  // Midnight & Visibility listeners (SPEC §10)
  scheduleMidnightCheck();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleDayChangeCheck();
        scheduleMidnightCheck();
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') || 'today';
        if (tab !== currentTab && registeredTabs[tab]) {
          navigate(tab, false);
        }
      } catch {}
    });
  }

  // If a tab was requested or default to today
  if (!currentTab) {
    let initialTab = 'today';
    if (typeof window !== 'undefined' && window.location) {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        if (urlTab && registeredTabs[urlTab]) {
          initialTab = urlTab;
        }
      } catch {}
    }
    if (registeredTabs[initialTab]) {
      navigate(initialTab, false);
    }
  } else if (registeredTabs[currentTab]) {
    navigate(currentTab, false);
  }
}
