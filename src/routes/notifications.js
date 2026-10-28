// Bildirim çanı: liste, okunmamış sayısı, hepsini okundu yap.
const { app, asyncRoute, requireUserApi } = require('../core');
const notifications = require('../../notifications');

app.get(
  '/api/notifications',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const [items, unread] = await Promise.all([
      notifications.list(req.session.userId, 30),
      notifications.unreadCount(req.session.userId),
    ]);
    res.json({ items, unread });
  })
);

// Hafif: sadece sayı (çan rozeti için dakikada bir sorulur)
app.get(
  '/api/notifications/count',
  requireUserApi,
  asyncRoute(async (req, res) => {
    res.json({ unread: await notifications.unreadCount(req.session.userId) });
  })
);

app.post(
  '/api/notifications/read',
  requireUserApi,
  asyncRoute(async (req, res) => {
    await notifications.markAllRead(req.session.userId);
    res.json({ ok: true });
  })
);
