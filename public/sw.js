/* LetStyle service worker — Web Push only (no offline caching).
 *
 * The generation itself runs on the server; this worker just shows the
 * notification the server pushes when a job finishes, and routes a tap on
 * it back to the right result.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return { title: 'LetStyle', body: event.data.text(), url: '/' };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (!payload) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.filter((client) => client.visibilityState === 'visible');

      // If LetStyle is on screen, the page already shows its own toast and
      // chime for this job — tell it instead of stacking a system alert on top.
      if (visible.length > 0) {
        for (const client of visible) {
          client.postMessage({ type: 'letstyle:push', payload });
        }
        return;
      }

      await self.registration.showNotification(payload.title || 'LetStyle', {
        body: payload.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        // Same tag as the page-side fallback notification for this job, so
        // the OS replaces instead of duplicating.
        tag: payload.tag || undefined,
        renotify: false,
        data: { url: payload.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Only ever navigate within this origin.
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        // Reuse an open LetStyle tab: let the app open the job in place
        // (keeps in-memory state), then bring the tab forward.
        client.postMessage({ type: 'letstyle:open-job', url: target.pathname + target.search });
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
