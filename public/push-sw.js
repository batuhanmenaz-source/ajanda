// Ajanda bildirimleri: Workbox servis çalışanına eklenir (vite.config.js → workbox.importScripts)
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Ajanda', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Ajanda', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: d.data || {},
    actions: (d.actions || []).slice(0, 2),
    timestamp: Date.now()
  }));
});

async function openUrl(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const c = all.find((x) => new URL(x.url).origin === self.location.origin);
  if (c) {
    try { await c.focus(); } catch { /* yok say */ }
    c.postMessage({ type: 'ajanda-open', url });
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  if (event.action && d.act) {
    // "Yapıldı" / "Yarına ertele": uygulamayı açmadan sunucuda işle
    event.waitUntil(
      fetch('/api/push?action=act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d.act, op: event.action }) })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) return self.registration.showNotification('İşlem yapılamadı', { body: 'Uygulamayı açıp elle işaretle.', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: 'act-err', data: { url: d.url || '/' } });
          return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'ajanda-refresh' })));
        })
        .catch(() => self.registration.showNotification('İnternet yok', { body: 'İşlem yapılamadı; uygulamadan işaretle.', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: 'act-err', data: { url: d.url || '/' } }))
    );
    return;
  }
  event.waitUntil(openUrl(d.url || '/'));
});
