// Koleksiyonlar (kaydetme listeleri): API + sayfalar. Listeler yalnızca sahibine görünür.
const core = require('../core');
const { app, asyncRoute, requireUserApi, requireUserPage, createRateLimiter, ROOT } = core;
const path = require('path');
const collections = require('../../collections');
const { getSnapshot } = require('../snapshot');

const limiter = createRateLimiter({ name: 'collectionsLimiter', windowMs: 10 * 60 * 1000, max: 200, message: 'Çok hızlı işlem yapıyorsun. Biraz bekle.' });

// Hizmet katmanının {status,message} hatalarını JSON yanıta çevirir
const api = (fn) =>
  asyncRoute(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

app.get(
  '/api/collections',
  requireUserApi,
  api(async (req, res) => {
    const uid = req.session.userId;
    const mine = await collections.lists(uid);
    const rows = await collections.rowsFor(mine.map((l) => l.id));
    const itemId = String(req.query.item || '');
    const counts = {};
    const has = new Set();
    for (const r of rows) {
      counts[r.collection_id] = (counts[r.collection_id] || 0) + 1;
      if (itemId && r.item_id === itemId) has.add(r.collection_id);
    }
    res.json({ max: collections.MAX_LISTS, collections: mine.map((l) => ({ id: l.id, name: l.name, count: counts[l.id] || 0, hasItem: has.has(l.id) })) });
  })
);

app.post(
  '/api/collections',
  requireUserApi,
  limiter,
  api(async (req, res) => {
    const c = await collections.create(req.session.userId, req.body.name);
    if (req.body.itemId) await collections.addItem(req.session.userId, c.id, String(req.body.itemId));
    res.json({ ok: true, collection: { id: c.id, name: c.name, hasItem: !!req.body.itemId } });
  })
);

app.post('/api/collections/:id/rename', requireUserApi, limiter, api(async (req, res) => {
  await collections.rename(req.session.userId, Number(req.params.id), req.body.name);
  res.json({ ok: true });
}));
app.post('/api/collections/:id/delete', requireUserApi, limiter, api(async (req, res) => {
  await collections.remove(req.session.userId, Number(req.params.id));
  res.json({ ok: true });
}));
app.post('/api/collections/:id/toggle', requireUserApi, limiter, api(async (req, res) => {
  const r = await collections.toggleItem(req.session.userId, Number(req.params.id), String(req.body.itemId || ''));
  res.json({ ok: true, ...r });
}));
app.post('/api/collections/:id/items/:itemId/remove', requireUserApi, limiter, api(async (req, res) => {
  await collections.removeItem(req.session.userId, Number(req.params.id), String(req.params.itemId));
  res.json({ ok: true });
}));

// Hızlı kaydet: ilk tıkta "Favoriler" listesi otomatik oluşturulur
app.post('/api/memory/:id/quick-save', requireUserApi, limiter, api(async (req, res) => {
  const def = await collections.ensureDefault(req.session.userId);
  await collections.addItem(req.session.userId, def.id, String(req.params.id));
  res.json({ ok: true, collection: def });
}));

const pubItem = (i) => ({ id: i.id, url: i.url, type: i.type, uploaderName: i.uploaderName, caption: i.caption || '', likes: i.likes || 0 });

app.get(
  '/koleksiyonlar',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const uid = req.session.userId;
    const [mine, snap] = await Promise.all([collections.lists(uid), getSnapshot()]);
    const rows = await collections.rowsFor(mine.map((l) => l.id));
    const grouped = new Map();
    for (const r of rows) {
      if (!snap.byId.has(r.item_id)) continue; // artık yayında olmayan anılar sayılmaz
      if (!grouped.has(r.collection_id)) grouped.set(r.collection_id, []);
      grouped.get(r.collection_id).push(r);
    }
    const cards = mine.map((l) => {
      const list = (grouped.get(l.id) || []).sort((a, b) => b.added_at - a.added_at);
      return { id: l.id, name: l.name, count: list.length, previews: list.slice(0, 4).map((r) => pubItem(snap.byId.get(r.item_id))) };
    });
    res.render('collections', { cards, max: collections.MAX_LISTS });
  })
);

app.get(
  '/koleksiyonlar/:id',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const uid = req.session.userId;
    const col = await collections.getOwned(uid, Number(req.params.id));
    if (!col) return res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
    const [rows, snap] = await Promise.all([collections.rowsFor([col.id]), getSnapshot()]);
    const items = rows
      .sort((a, b) => b.added_at - a.added_at)
      .filter((r) => snap.byId.has(r.item_id))
      .map((r) => pubItem(snap.byId.get(r.item_id)));
    res.render('collection', { col, items });
  })
);
