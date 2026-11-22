// Anı sayfası (/m/:id), yorumlar (yanıt zinciri + sabitleme), emoji tepkileri ve rastgele anı.
const core = require('../core');
const { app, asyncRoute, requireUserApi, createRateLimiter, db, users, likes, renderNameHtml, ROOT } = core;
const path = require('path');
const social = require('../../social');
const { notify } = require('../notify');
const { renderRich, extractMentions } = require('../lib/richtext');
const { cloudImg, videoPoster } = require('../lib/cloud');
const { invalidateSnapshot } = require('../snapshot');
const { buildThread, countThread } = require('../lib/threads');

app.locals.renderRich = renderRich;
app.locals.cloudImg = cloudImg;

const commentLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20, message: 'Çok hızlı yorum yazıyorsun. Biraz bekleyip tekrar dene.' });
const reactLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 120, message: 'Çok fazla tepki verdin. Biraz bekle.' });

function viewer(req) {
  return {
    id: req.session && req.session.userId,
    isSuper: !!(req.session && req.session.isAdmin && req.session.adminRole === 'superadmin'),
  };
}

// Düz yorum listesi -> gösterime hazır alanlar (üst yorum / yanıt ayrımı, sabitleme yetkisi)
async function serializeComments(rows, v, ownerId) {
  const authors = await users.getUsersByIds(rows.map((r) => r.userId));
  return rows.map((r) => {
    const a = authors[r.userId];
    const name = a ? a.username : 'silinmiş hesap';
    return {
      id: r.id,
      userId: r.userId,
      parentId: r.parentId || null,
      pinnedAt: r.pinnedAt || null,
      username: name,
      avatarUrl: a ? a.avatarUrl : null,
      nameHtml: renderNameHtml(name, a && a.nameStyle),
      bodyHtml: renderRich(r.body),
      createdAt: r.createdAt,
      byOwner: !!ownerId && r.userId === ownerId, // yorumu anı sahibi yazdı
      isMine: !!v.id && v.id === r.userId,
      canDelete: v.isSuper || (!!v.id && (v.id === r.userId || v.id === ownerId)),
      // yalnızca anı sahibi (ya da süper admin) ÜST yorumlardan birini sabitleyebilir
      canPin: !r.parentId && (v.isSuper || (!!v.id && v.id === ownerId)),
    };
  });
}

// ---------- Anı sayfası (paylaşılabilir bağlantı + önizleme etiketleri) ----------
app.get(
  '/m/:id',
  asyncRoute(async (req, res) => {
    const v = viewer(req);
    const item = await db.getItemById(req.params.id);
    // Taslaklar kimseye (sahibine bile) anı sayfası olarak açılmaz
    const allowed = item && item.status !== 'draft' && (item.status === 'approved' || v.isSuper || (v.id && v.id === item.userId));
    if (!allowed) return res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));

    const [owner, likeTotal, likedSet, reactions, commentRows, me] = await Promise.all([
      item.userId ? users.getUsersByIds([item.userId]) : Promise.resolve({}),
      likes.countLikesForItemIds([item.id]),
      v.id ? likes.getLikedSetForIp('u:' + v.id) : Promise.resolve(new Set()),
      social.reactionSummary(item.id, v.id).catch(() => ({ counts: {}, mine: [] })),
      social.listComments(item.id).catch(() => []),
      v.id ? users.findUserById(v.id) : Promise.resolve(null),
    ]);
    const ownerInfo = owner[item.userId] || { username: item.uploaderName, avatarUrl: null, nameStyle: null };
    const thread = buildThread(await serializeComments(commentRows, v, item.userId));

    const base = `${req.protocol}://${req.get('host')}`;
    const ogImage = item.type === 'video' ? videoPoster(item.url, 1200) : cloudImg(item.url, 1200);
    res.render('memory', {
      item,
      tags: item.tags || [],
      owner: ownerInfo,
      ownerNameHtml: renderNameHtml(ownerInfo.username, ownerInfo.nameStyle),
      likeTotal,
      likedByMe: likedSet.has(item.id),
      reactions,
      EMOJIS: social.EMOJIS,
      comments: thread,
      commentTotal: countThread(thread),
      loggedIn: !!v.id,
      isOwner: !!v.id && v.id === item.userId,
      isPinnedOnProfile: !!(me && me.pinnedItemId === item.id),
      canInteract: !!v.id && !(me && me.banned),
      pageUrl: `${base}/m/${item.id}`,
      ogImage,
      ogTitle: `${ownerInfo.username} bir anı paylaştı — CroShy Anı`,
      ogDescription: String(item.caption || 'CroShy Anı\'nda paylaşılan bir anı').slice(0, 160),
    });
  })
);

// ---------- Rastgele anı ----------
app.get(
  '/random',
  asyncRoute(async (req, res) => {
    const id = await db.getRandomApprovedId();
    res.redirect(id ? `/m/${id}` : '/');
  })
);

// ---------- Yorumlar ----------
app.get(
  '/api/memory/:id/comments',
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    const thread = buildThread(await serializeComments(await social.listComments(item.id), viewer(req), item.userId));
    res.json({ comments: thread, total: countThread(thread) });
  })
);

app.post(
  '/api/memory/:id/comments',
  requireUserApi,
  commentLimiter,
  asyncRoute(async (req, res) => {
    const [item, me] = await Promise.all([db.getItemById(req.params.id), users.findUserById(req.session.userId)]);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    if (!me) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
    if (me.banned) return res.status(403).json({ error: 'Hesabının yorum yazma yetkisi kaldırılmış.' });

    const body = String(req.body.body || '').trim();
    if (body.length < 1) return res.status(400).json({ error: 'Yorum boş olamaz.' });
    if (body.length > 300) return res.status(400).json({ error: 'Yorum en fazla 300 karakter olabilir.' });

    // Yanıt: tek seviye — bir yanıta yanıt verilirse aynı üst yorumun altına eklenir
    let parent = null;
    let rootId = null;
    if (req.body.parentId) {
      parent = await social.getComment(Number(req.body.parentId));
      if (!parent || parent.itemId !== item.id) return res.status(404).json({ error: 'Yanıt verilen yorum bulunamadı.' });
      rootId = parent.parentId || parent.id;
    }

    const c = await social.addComment({ itemId: item.id, userId: me.id, body, parentId: rootId });
    invalidateSnapshot();

    const snippet = body.slice(0, 60);
    const notified = new Set([me.id]);
    if (parent && parent.userId !== me.id) {
      notified.add(parent.userId);
      notify(parent.userId, { type: 'comment', text: `${me.username} yorumuna yanıt verdi: “${snippet}”`, link: `/m/${item.id}#comments`, dedupeKey: `reply:${c.id}` });
    }
    if (item.userId && !notified.has(item.userId)) {
      notified.add(item.userId);
      notify(item.userId, { type: 'comment', text: `${me.username} anına yorum yaptı: “${snippet}”`, link: `/m/${item.id}#comments`, dedupeKey: `comment:${c.id}` });
    }
    try {
      for (const u of await users.findUsersByUsernames(extractMentions(body))) {
        if (notified.has(u.id)) continue;
        notify(u.id, { type: 'mention', text: `${me.username} bir yorumda seni etiketledi: “${snippet}”`, link: `/m/${item.id}#comments`, dedupeKey: `cmention:${c.id}:${u.id}` });
      }
    } catch {
      // bahsetme bildirimi başarısız olsa da yorum kaydedildi
    }

    const [out] = await serializeComments([c], viewer(req), item.userId);
    res.json({ ok: true, comment: { ...out, replies: [] } });
  })
);

app.post(
  '/api/comments/:id/delete',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const c = await social.getComment(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Bulunamadı.' });
    const item = await db.getAnyItemById(c.itemId);
    const v = viewer(req);
    const allowed = v.isSuper || v.id === c.userId || (item && item.userId === v.id);
    if (!allowed) return res.status(403).json({ error: 'Bu yorumu silme yetkin yok.' });
    await social.deleteComment(c.id); // yanıtları da silinir
    invalidateSnapshot();
    res.json({ ok: true });
  })
);

// ---------- Yorumu sabitle / kaldır (yalnızca anı sahibi; bir anıda en fazla 1 sabit yorum) ----------
app.post(
  '/api/comments/:id/pin',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const c = await social.getComment(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Bulunamadı.' });
    const item = await db.getItemById(c.itemId);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    const v = viewer(req);
    if (!(v.isSuper || (v.id && v.id === item.userId))) return res.status(403).json({ error: 'Yorumları yalnızca anı sahibi sabitleyebilir.' });
    if (c.parentId) return res.status(400).json({ error: 'Yalnızca ana yorumlar sabitlenebilir.' });

    const pin = req.body.pinned !== false;
    await social.setPinned(item.id, pin ? c.id : null);
    if (pin && c.userId !== v.id) {
      notify(c.userId, { type: 'comment', text: 'Yorumun anı sahibi tarafından en üste sabitlendi 📌', link: `/m/${item.id}#comments`, dedupeKey: `pin:${c.id}` });
    }
    res.json({ ok: true, pinned: pin });
  })
);

// ---------- Emoji tepkileri ----------
app.get(
  '/api/memory/:id/reactions',
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    res.json(await social.reactionSummary(item.id, viewer(req).id));
  })
);

app.post(
  '/api/memory/:id/react',
  requireUserApi,
  reactLimiter,
  asyncRoute(async (req, res) => {
    const emoji = String(req.body.emoji || '');
    if (!social.EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Geçersiz tepki.' });

    const [item, me] = await Promise.all([db.getItemById(req.params.id), users.findUserById(req.session.userId)]);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    if (!me) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
    if (me.banned) return res.status(403).json({ error: 'Hesabının etkileşim yetkisi kaldırılmış.' });

    const r = await social.toggleReaction(item.id, me.id, emoji);
    invalidateSnapshot(); // kartlardaki "en çok verilen 2 tepki" güncel kalsın
    if (r.active && item.userId && item.userId !== me.id) {
      notify(item.userId, { type: 'reaction', text: `${me.username} anına ${emoji} tepkisi verdi`, link: `/m/${item.id}`, dedupeKey: `react:${item.id}:${me.id}:${emoji}` });
    }
    res.json({ ok: true, active: r.active, summary: await social.reactionSummary(item.id, me.id) });
  })
);
