/**
 * Habbit PWA Service Worker Update Manager (SPEC §7)
 * Registers service worker and notifies user when an update is available.
 */

import { showToast } from '../ui/shell.js';

/**
 * Initializes ServiceWorker registration and monitors for updates.
 * Displays a toast with a "Reload" action button when an update is ready.
 * @param {string} [swUrl='/sw.js']
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
export async function initUpdateHandler(swUrl = '/sw.js', { force = false } = {}) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // In Vite dev mode, unbundled SW is not served by dev server; skip registration unless explicitly forced
  if (import.meta.env?.DEV && !force) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });

    /**
     * @param {ServiceWorker} [worker]
     */
    const promptReload = (worker) => {
      showToast('Update available', {
        action: {
          label: 'Reload',
          onClick: () => {
            if (worker && typeof worker.postMessage === 'function') {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
            if (typeof window !== 'undefined' && window.location) {
              window.location.reload();
            }
          },
        },
      });
    };

    // If an updated worker is already waiting to activate
    if (reg.waiting && navigator.serviceWorker.controller) {
      promptReload(reg.waiting);
    }

    // Listen for incoming updates
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          promptReload(newWorker);
        }
      });
    });

    return reg;
  } catch (err) {
    console.warn('ServiceWorker registration/update check failed:', err);
    return null;
  }
}
