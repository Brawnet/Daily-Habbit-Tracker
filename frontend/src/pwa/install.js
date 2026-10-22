/**
 * Habbit PWA Install Manager (SPEC §8)
 * Handles install prompts, iOS Safari detection, and install state changes.
 */

/** @type {any | null} */
let deferredPrompt = null;

/** @type {Set<(state: 'installed' | 'android-prompt' | 'ios-safari' | 'unsupported') => void>} */
const listeners = new Set();

function isStandalone() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (navigator.standalone === true) {
    return true;
  }
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari =
    /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/.test(ua);
  return Boolean(isIOS && isSafari && !isStandalone());
}

function notifyListeners() {
  const currentState = getInstallState();
  for (const listener of listeners) {
    try {
      listener(currentState);
    } catch (err) {
      console.error('Error in install state listener:', err);
    }
  }
}

/**
 * @returns {'installed' | 'android-prompt' | 'ios-safari' | 'unsupported'}
 */
export function getInstallState() {
  if (isStandalone()) {
    return 'installed';
  }
  if (deferredPrompt) {
    return 'android-prompt';
  }
  if (isIOSSafari()) {
    return 'ios-safari';
  }
  return 'unsupported';
}

/**
 * Prompts user to install the PWA if deferredPrompt is available.
 * @returns {Promise<boolean>} whether user accepted the prompt
 */
export async function promptInstall() {
  if (!deferredPrompt) {
    return false;
  }
  const promptEvent = deferredPrompt;
  deferredPrompt = null;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    notifyListeners();
    return choice?.outcome === 'accepted';
  } catch (err) {
    console.error('Error showing install prompt:', err);
    notifyListeners();
    return false;
  }
}

/**
 * Registers a callback for install state changes.
 * @param {(state: 'installed' | 'android-prompt' | 'ios-safari' | 'unsupported') => void} listener
 * @returns {() => void} unsubscribe
 */
export function onInstallStateChange(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Global initialization & event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyListeners();
  });

  if (typeof window.matchMedia === 'function') {
    try {
      const standaloneMedia = window.matchMedia('(display-mode: standalone)');
      if (typeof standaloneMedia.addEventListener === 'function') {
        standaloneMedia.addEventListener('change', () => notifyListeners());
      }
    } catch {}
  }
}

// Request persistent storage on startup if available (SPEC §8)
if (
  typeof navigator !== 'undefined' &&
  navigator.storage &&
  typeof navigator.storage.persist === 'function'
) {
  try {
    navigator.storage.persist().catch(() => {});
  } catch {}
}
