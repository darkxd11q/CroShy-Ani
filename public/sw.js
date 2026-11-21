// CroShy Anı service worker: telefona/tarayıcıya bildirim (push) ve ana ekrana eklenebilirlik.
// Bilerek önbellek TUTMAZ (eski sayfa gösterme riski yok).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function safeUrl(u) {
  try {
    const x = new URL(u, self.location.origin);
    return x.origin === self.location.origin ? x.pathname + x.search + x.hash : '/';
  } catch (e) {
    return '/';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CroShy Anı', {
      body: data.body || '',
      icon: '/img/logo-192.png',
      badge: '/img/logo-64.png',
      tag: data.tag || 'croshy',
      data: { url: safeUrl(data.url || '/') },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl((event.notification.data && event.notification.data.url) || '/');
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) return c.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
