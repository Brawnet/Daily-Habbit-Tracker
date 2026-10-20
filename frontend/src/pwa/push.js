/**
 * Habbit PWA Web Push Manager (SPEC §7)
 * Handles push subscription state, enabling/disabling push notifications,
 * and test push requests via Apps Script API.
 */

import { callApi } from '../data/api.js';
import { ACTIONS } from '../shared/contracts.js';

/**
 * Converts a URL-safe base64 string to a Uint8Array for PushManager subscription.
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isIOSSafariNotStandalone() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone =
    navigator.standalone === true ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);

  return Boolean(isIOS && !isStandalone);
}

/**
 * Returns current Web Push capability and subscription state.
 * @returns {Promise<'unsupported' | 'needs-install' | 'default' | 'denied' | 'subscribed'>}
 */
export async function getPushState() {
  const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPush =
    typeof window !== 'undefined' &&
    ('PushManager' in window || typeof PushManager !== 'undefined');
  const hasNotification =
    typeof window !== 'undefined' &&
    ('Notification' in window || typeof Notification !== 'undefined');

  if (!hasSW || !hasPush || !hasNotification) {
    return 'unsupported';
  }

  if (isIOSSafariNotStandalone()) {
    return 'needs-install';
  }

  const permission = Notification.permission;
  if (permission === 'denied') {
    return 'denied';
  }

  if (permission === 'default') {
    return 'default';
  }

  if (permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'default';
    } catch {
      return 'default';
    }
  }

  return 'unsupported';
}

/**
 * Request notification permission and subscribe to Web Push.
 * Must be invoked from user gesture.
 * @returns {Promise<boolean>}
 */
export async function enablePush() {
  const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasNotification =
    typeof window !== 'undefined' &&
    ('Notification' in window || typeof Notification !== 'undefined');

  if (!hasSW || !hasNotification) {
    throw new Error('Push notifications not supported on this device');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return false;
  }

  const vapidPublicKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) ||
    (typeof process !== 'undefined' && process.env?.VITE_VAPID_PUBLIC_KEY) ||
    '';

  if (!vapidPublicKey) {
    throw new Error('VITE_VAPID_PUBLIC_KEY is not configured');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const subscriptionPayload = sub.toJSON ? sub.toJSON() : sub;
  await callApi(ACTIONS.SUBSCRIBE_PUSH, { subscription: subscriptionPayload });
  return true;
}

/**
 * Unsubscribes current device from Web Push.
 * @returns {Promise<boolean>}
 */
export async function disablePush() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await callApi(ACTIONS.UNSUBSCRIBE_PUSH, { endpoint });
      } catch (err) {
        console.warn('Backend unsubscribe failed:', err);
      }
    }
    return true;
  } catch (err) {
    console.error('Error disabling push:', err);
    return false;
  }
}

/**
 * Sends a test push notification via Apps Script API.
 * @returns {Promise<any>}
 */
export async function sendTestPush() {
  return await callApi(ACTIONS.TEST_PUSH);
}
