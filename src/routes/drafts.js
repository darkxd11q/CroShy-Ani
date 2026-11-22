// Anı taslakları: kırpıp sıkıştırıp açıklamayı yazdıktan sonra yayınlamadan sakla, sonra paylaş.
// Taslak günlük hakka SAYILMAZ (yayınlanırken sayılır), kimseye görünmez, 30 gün sonra silinir.
const core = require('../core');
const { app, asyncRoute, requireUserApi, createRateLimiter, db, users, logs, effectiveLimitsFor, getSettingsSafe, cloudinary, formatDuration, ABSOLUTE_VIDEO_CEILING_BYTES, SAFE_CLOUD_URL, crypto } = core;
const { checkMedia } = require('../lib/mediaChecks');
const { collectTags } = require('../lib/tags');

const DRAFT_MAX = 10;
const DRAFT_DAYS = 30;
const limiter = createRateLimiter({ name: 'draftLimiter', windowMs: 60 * 60 * 1000, max: 60, message: 'Çok fazla taslak işlemi yaptın. Biraz bekle.' });

const pub = (d) => ({ id: d.id, url: d.url, type: d.type, caption: d.caption || '', tags: d.tags || [], createdAt: d.createdAt, expiresAt: d.createdAt + DRAFT_DAYS * 24 * 60 * 60 * 1000 });

async function destroyAsset(publicId, type) {
  try {
    if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: type === 'video' ? 'video' : 'image' });
  } catch (e) {
    console.error('Cloudinary silme hatası (taslak):', e.message);
  }
}

app.get(
  '/api/drafts',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const list = await db.getDraftsByUserId(req.session.userId);
    res.json({ drafts: list.map(pub), max: DRAFT_MAX, days: DRAFT_DAYS });
  })
);

app.post(
  '/api/drafts',
  requireUserApi,
  limiter,
  asyncRoute(async (req, res) => {
    const me = await users.findUserById(req.session.userId);
    if (!me) return res.status(401).json({ error: 'Hesap bulunamadı. Lütfen tekrar giriş yap.', loginRequired: true });
    if (me.banned) return res.status(403).json({ error: 'Hesabının anı gönderme yetkisi kaldırılmış.' });

    const limits = effectiveLimitsFor(me, await getSettingsSafe());
    const bad = await checkMedia({ body: req.body, limits, cloudinary, formatDuration, ceilingBytes: ABSOLUTE_VIDEO_CEILING_BYTES, safeUrl: SAFE_CLOUD_URL });
    if (bad) return res.status(bad.status).json({ error: bad.error });

    const { url, publicId, type } = req.body;
    if ((await db.countDrafts(me.id)) >= DRAFT_MAX) {
      await destroyAsset(publicId, type);
      return res.status(409).json({ error: `En fazla ${DRAFT_MAX} taslak saklayabilirsin. Önce birini paylaş ya da sil.` });
    }
    const caption = String(req.body.caption || '').trim().slice(0, 200);
    const t = collectTags({ tagsInput: req.body.tags, caption, required: false });
    if (t.error) {
      await destroyAsset(publicId, type);
      return res.status(400).json({ error: t.error });
    }
    const draft = { id: crypto.randomUUID(), url, publicId, type, uploaderName: me.username, userId: me.id, ip: null, caption, tags: t.tags, status: 'draft', createdAt: Date.now() };
    await db.insertItem(draft);
    res.json({ ok: true, draft: pub(draft) });
  })
);

app.post(
  '/api/drafts/:id/update',
  requireUserApi,
  limiter,
  asyncRoute(async (req, res) => {
    const d = await db.getDraft(req.params.id, req.session.userId);
    if (!d) return res.status(404).json({ error: 'Taslak bulunamadı.' });
    const caption = String(req.body.caption || '').trim().slice(0, 200);
    const t = collectTags({ tagsInput: req.body.tags, caption, required: false });
    if (t.error) return res.status(400).json({ error: t.error });
    await db.updateDraft(d.id, d.userId, { caption, tags: t.tags });
    res.json({ ok: true });
  })
);

// Paylaş: normal gönderimle AYNI kurallar (yasak, günlük hak, açıklama zorunlu, en az 1 etiket)
app.post(
  '/api/drafts/:id/publish',
  requireUserApi,
  limiter,
  asyncRoute(async (req, res) => {
    const uid = req.session.userId;
    const key = 'u:' + uid;
    const [me, settings, used, d] = await Promise.all([users.findUserById(uid), getSettingsSafe(), logs.countToday(key), db.getDraft(req.params.id, uid)]);
    if (!me) return res.status(401).json({ error: 'Hesap bulunamadı. Lütfen tekrar giriş yap.', loginRequired: true });
    if (me.banned) return res.status(403).json({ error: 'Hesabının anı gönderme yetkisi kaldırılmış.' });
    if (!d) return res.status(404).json({ error: 'Taslak bulunamadı.' });

    const limits = effectiveLimitsFor(me, settings);
    if (used >= limits.dailyLimit) {
      return res.status(429).json({ error: `Bugün için gönderme hakkını doldurdun (günde en fazla ${limits.dailyLimit} anı). Hakkın gece yarısı yenilenir; taslağın saklı kalır.` });
    }
    // Taslakta gönderilen açıklama/etiket son hâliyle (varsa istekteki yeni değerlerle) doğrulanır
    const caption = String(req.body.caption != null ? req.body.caption : d.caption || '').trim().slice(0, 200);
    if (!caption) return res.status(400).json({ error: 'Açıklama yazman zorunlu.' });
    const t = collectTags({ tagsInput: req.body.tags != null ? req.body.tags : d.tags, caption, required: true });
    if (t.error) return res.status(400).json({ error: t.error });

    await db.updateDraft(d.id, uid, { caption, tags: t.tags });
    if (!(await db.publishDraft(d.id, uid))) return res.status(409).json({ error: 'Bu taslak zaten paylaşılmış.' });
    await logs.recordSubmission(key);
    res.json({ ok: true });
  })
);

app.post(
  '/api/drafts/:id/delete',
  requireUserApi,
  limiter,
  asyncRoute(async (req, res) => {
    const d = await db.getDraft(req.params.id, req.session.userId);
    if (!d) return res.status(404).json({ error: 'Taslak bulunamadı.' });
    await destroyAsset(d.publicId, d.type);
    await db.deleteDraft(d.id, d.userId);
    res.json({ ok: true });
  })
);
