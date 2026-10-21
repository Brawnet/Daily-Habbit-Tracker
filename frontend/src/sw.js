self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

// Precache static assets built by Vite
precacheAndRoute(self.__WB_MANIFEST || []);

// Bypass cache completely for API calls and Google Apps Script endpoints (SPEC §7)
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/') ||
    url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com',
  new NetworkOnly()
);

// SPA Navigation fallback to /index.html
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [
      /^\/api\//,
      /script\.google\.com/,
      /script\.googleusercontent\.com/,
    ],
  });
  registerRoute(navigationRoute);
} catch {
  // Ignored if manifest does not have index.html in dev mode
}

// Allow activating waiting service worker on user reload
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification handling - MUST ALWAYS show notification (iOS requirement, SPEC §7)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Habbit',
    body: 'Time to check your habits and journal!',
    url: '/?tab=today',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch {
      const text = event.data.text();
      if (text) {
        data.body = text;
      }
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: 'habbit-reminder',
    renotify: true,
    data: {
      url: data.url || '/?tab=today',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Habbit', notificationOptions)
  );
});

// Click notification to open or focus Habbit window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/?tab=today';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
