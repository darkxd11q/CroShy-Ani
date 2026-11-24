// "Neler yeni?" duyurusu: güncellemeden sonraki İLK girişte bir kez gösterilir.
const core = require('../core');
const { app, asyncRoute, users } = core;
const { LATEST, RELEASES } = require('../releases');

app.get(
  '/api/whats-new',
  asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const force = req.query.force === '1'; // önizleme: ?whatsnew=1
    const clientSeen = typeof req.query.seen === 'string' ? req.query.seen.slice(0, 40) : '';
    const uid = req.session && req.session.userId;

    let seen = clientSeen;
    if (uid) {
      // Hesabı olan kişi: bir kez görmesi tüm cihazlarda geçerli (veritabanı); tablo hazır değilse tarayıcı kaydı devreye girer
      try {
        const u = await users.findUserById(uid);
        if (u && u.seenRelease === LATEST.id) seen = LATEST.id;
      } catch {}
    } else if (!clientSeen && !force) {
      // Siteyi ilk kez gören misafire "yenilikler" gösterilmez; sadece bu sürümü gördü olarak işaretlenir
      return res.json({ release: null, latestId: LATEST.id, firstVisit: true });
    }
    if (!force && seen === LATEST.id) return res.json({ release: null, latestId: LATEST.id });
    res.json({ release: LATEST, latestId: LATEST.id });
  })
);

app.post(
  '/api/whats-new/seen',
  asyncRoute(async (req, res) => {
    const id = String((req.body && req.body.id) || '');
    if (!RELEASES.some((r) => r.id === id)) return res.status(400).json({ error: 'Geçersiz sürüm.' });
    if (req.session && req.session.userId) {
      try {
        await users.setSeenRelease(req.session.userId, id);
      } catch {}
    }
    res.json({ ok: true });
  })
);
