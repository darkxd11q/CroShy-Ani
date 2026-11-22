// Anılar: liste, beğeni, gönderme.
const { ABSOLUTE_VIDEO_CEILING_BYTES, SAFE_CLOUD_URL, app, asyncRoute, bans, cloudinary, crypto, db, effectiveLimitsFor, formatDuration, getSettingsSafe, likes, logs, requireUserApi, users, viewsStore } = require('../core');
const { notify } = require('../notify');
const { nextMidnightTR } = require('../lib/time');
const { getSnapshot, invalidateSnapshot, createBrowse, getBrowse, seenKeyFor } = require('../snapshot');
const { extractTags } = require('../lib/richtext');
const { collectTags } = require('../lib/tags');
const { checkMedia } = require('../lib/mediaChecks');
const collections = require('../../collections');

// ---------- Herkese açık API ----------

app.get(
  '/api/config',
  asyncRoute(async (req, res) => {
    const s = await getSettingsSafe();
    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      // Imzalı yükleme açıkken (varsayılan) preset sızdırılmaz
      uploadPreset:
        process.env.CLOUDINARY_SIGNED_UPLOADS === 'false' || !process.env.CLOUDINARY_API_SECRET
          ? process.env.CLOUDINARY_UPLOAD_PRESET || ''
          : '',
      maxImageBytes: s.maxImageBytes,
      maxVideoBytes: s.maxVideoBytes,
      maxVideoDurationSec: s.maxVideoDurationSec,
    });
  })
);

// Sayfalı anı listesi: ?sort=&limit=&offset=&tag=&token=
// İlk istekte sıralı liste hazırlanır ve bir "token" döner; sonraki sayfalarda aynı
// token gönderilirse sıralama kaymaz (görüldü işaretleri değişse bile).
function normalizeTag(q) {
  return String(q || '').toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 24);
}

app.get(
  '/api/approved',
  asyncRoute(async (req, res) => {
    const validSorts = ['oldest', 'likes', 'newest', 'algorithm'];
    const sort = validSorts.includes(req.query.sort) ? req.query.sort : 'algorithm';
    const tag = normalizeTag(req.query.tag);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const uid = req.session && req.session.userId;
    const seenKey = seenKeyFor(req);

    const snap = await getSnapshot();
    let browse = getBrowse(req.query.token);
    let token = req.query.token;

    if (!browse || browse.sort !== sort || browse.tag !== tag) {
      let list = snap.items;
      if (tag) list = list.filter((i) => (i.tags || []).includes(tag));

      let ordered;
      if (sort === 'oldest') ordered = [...list].sort((a, b) => a.createdAt - b.createdAt);
      else if (sort === 'likes') ordered = [...list].sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
      else if (sort === 'newest') ordered = [...list].sort((a, b) => b.createdAt - a.createdAt);
      else {
        // "Önerilen": önce hiç görmediklerin (en çok beğenilen önde), sonra gördüklerin (en yeni önde)
        const seen = await viewsStore.getSeenSetForIp(seenKey);
        const unseen = list.filter((i) => !seen.has(i.id)).sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
        const old = list.filter((i) => seen.has(i.id)).sort((a, b) => b.createdAt - a.createdAt);
        ordered = [...unseen, ...old];
      }
      token = createBrowse(ordered.map((i) => i.id), { sort, tag });
      browse = getBrowse(token);
    }

    const pageIds = browse.ids.slice(offset, offset + limit);
    const pageItems = pageIds.map((id) => snap.byId.get(id)).filter(Boolean);
    const [liked, saved] = uid
      ? await Promise.all([likes.getLikedSetForIp('u:' + uid), collections.savedItemIds(uid).catch(() => new Set())])
      : [new Set(), new Set()];

    // Bu sayfadaki anılar artık "görüldü" sayılır
    viewsStore.markSeen(pageIds, seenKey).catch((e) => console.error('markSeen hatası:', e.message));

    res.json({
      items: pageItems.map((i) => ({ ...i, likedByMe: liked.has(i.id), savedByMe: saved.has(i.id) })),
      total: browse.ids.length,
      offset,
      nextOffset: offset + pageIds.length,
      hasMore: offset + limit < browse.ids.length,
      token,
    });
  })
);

// Bir anıyı beğen / beğeniyi geri al — HESAP başına 1 beğeni (giriş gerekir).
// Ortak IP'li (mobil) kullanıcılar birbirinin beğenisini engellemez.
app.post(
  '/api/like/:id',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const [item, user] = await Promise.all([db.getItemById(req.params.id), users.findUserById(req.session.userId)]);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    if (!user) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
    if (user.banned) return res.status(403).json({ error: 'Hesabının etkileşim yetkisi kaldırılmış.' });

    const result = await likes.toggleLike(item.id, 'u:' + user.id);
    invalidateSnapshot();
    if (result.liked && item.userId && item.userId !== user.id) {
      notify(item.userId, {
        type: 'like',
        text: `${user.username} anını beğendi ❤️`,
        link: `/m/${item.id}`,
        dedupeKey: `like:${item.id}:${user.id}`,
      });
    }
    res.json(result);
  })
);

// Giriş yapmış kullanıcının kendi bilgisi + günlük kalan hakkı + fiili sınırları
app.get(
  '/api/me',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const [used, user, globalSettings] = await Promise.all([
      logs.countToday('u:' + req.session.userId),
      users.findUserById(req.session.userId),
      getSettingsSafe(),
    ]);
    const limits = effectiveLimitsFor(user, globalSettings);
    res.json({
      unlimited: limits.unlimited,
      premium: limits.premium,
      premiumRole: user && user.badges.includes('special') ? 'special' : user && user.badges.includes('plus') ? 'plus' : null,
      username: (user && user.username) || req.session.username,
      dailyLimit: limits.dailyLimit,
      resetAt: nextMidnightTR(), // hak, gece yarısı (Türkiye saati) yenilenir
      usedToday: used,
      remainingToday: Math.max(0, limits.dailyLimit - used),
      maxImageBytes: limits.imageBytes,
      maxVideoBytes: limits.videoBytes,
      maxVideoDurationSec: limits.videoDurationSec,
      hasCustomLimits: !!(
        user &&
        (user.customImageBytes || user.customVideoBytes || user.customVideoDurationSec)
      ),
    });
  })
);

app.post(
  '/api/submit',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const ip = req.ip; // sadece güvenlik kaydı için (30 gün sonra silinir)
    // Günlük limit HESABA bağlıdır (IP'ye değil): ortak IP'li kullanıcılar birbirini etkilemez.
    const key = 'u:' + req.session.userId;

    const [uploader, globalSettings, usedToday] = await Promise.all([
      users.findUserById(req.session.userId),
      getSettingsSafe(),
      logs.countToday(key),
    ]);

    if (!uploader) {
      return res.status(401).json({ error: 'Hesap bulunamadı. Lütfen tekrar giriş yap.', loginRequired: true });
    }
    if (uploader.banned) {
      return res.status(403).json({ error: 'Hesabının anı gönderme yetkisi kaldırılmış.' });
    }
    const limits = effectiveLimitsFor(uploader, globalSettings);

    if (usedToday >= limits.dailyLimit) {
      return res.status(429).json({
        error: `Bugün için gönderme hakkını doldurdun (günde en fazla ${limits.dailyLimit} anı). Hakkın gece yarısı (Türkiye saati) yenilenir; istersen taslak olarak kaydedebilirsin.`,
      });
    }

    // Kaynak / boyut / süre doğrulaması (taslaklarla ORTAK); ihlalde yüklenen dosya Cloudinary'den de silinir
    const bad = await checkMedia({ body: req.body, limits, cloudinary, formatDuration, ceilingBytes: ABSOLUTE_VIDEO_CEILING_BYTES, safeUrl: SAFE_CLOUD_URL });
    if (bad) return res.status(bad.status).json({ error: bad.error });

    const { url, publicId, type, caption } = req.body;
    const cleanCaption = (caption || '').toString().trim();
    const kill = async (why) => {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: type });
      } catch (e) {
        console.error(`Cloudinary silme hatası (${why}):`, e.message);
      }
    };
    if (!cleanCaption) {
      await kill('açıklama yok');
      return res.status(400).json({ error: 'Açıklama yazman zorunlu.' });
    }

    // Her anıda EN AZ 1 etiket zorunlu ("croshy" kullanılamaz)
    const tagRes = collectTags({ tagsInput: req.body.tags, caption: cleanCaption.slice(0, 200), required: true });
    if (tagRes.error) {
      await kill('etiket');
      return res.status(400).json({ error: tagRes.error });
    }

    const item = {
      id: crypto.randomUUID(),
      url,
      publicId,
      type,
      // İsim her zaman oturum açmış kullanıcıdan alınır, client'tan gelen
      // herhangi bir isim asla güvenilmez / kullanılmaz.
      uploaderName: (uploader && uploader.username) || req.session.username,
      userId: req.session.userId,
      ip,
      caption: cleanCaption.slice(0, 200),
      tags: tagRes.tags,
      status: 'pending',
      createdAt: Date.now(),
    };
    await Promise.all([db.insertItem(item), logs.recordSubmission(key)]);

    res.json({ ok: true, item: { ...item, ip: undefined } });
  })
);
