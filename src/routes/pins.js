// Profilde "vitrin anısı": kullanıcının kendi onaylı anılarından en fazla 1 tanesi profilin en üstünde görünür.
const core = require('../core');
const { app, asyncRoute, requireUserApi, db, users } = core;

app.post(
  '/api/profile/pin',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(String(req.body.itemId || ''));
    if (!item || item.userId !== req.session.userId || item.status !== 'approved' || item.deletedAt) {
      return res.status(400).json({ error: 'Yalnızca kendi onaylı anılarını sabitleyebilirsin.' });
    }
    await users.setPinnedItem(req.session.userId, item.id);
    res.json({ ok: true, pinnedItemId: item.id });
  })
);

app.post(
  '/api/profile/unpin',
  requireUserApi,
  asyncRoute(async (req, res) => {
    await users.setPinnedItem(req.session.userId, null);
    res.json({ ok: true });
  })
);
