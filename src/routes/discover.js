// Geçen yıl bugün, arama + trend etiketler, yıl özeti.
const core = require('../core');
const { app, asyncRoute, requireUserPage, createRateLimiter } = core;
const supabase = require('../../supabaseClient');
const { fetchAll } = require('../../pager');
const { getSnapshot } = require('../snapshot');
const { onThisDay } = require('../lib/onthisday');
const { searchItems, searchUsers, searchTags, trendingTags } = require('../lib/search');
const { buildWrapped, trYear } = require('../lib/wrapped');
const { cloudImg, videoPoster } = require('../lib/cloud');

app.locals.videoPoster = videoPoster;

const searchLimiter = createRateLimiter({ name: 'searchLimiter', windowMs: 10 * 60 * 1000, max: 200, message: 'Çok fazla arama yaptın. Biraz bekle.' });

const pub = (i) => ({
  id: i.id, url: i.url, type: i.type, uploaderName: i.uploaderName, uploaderAvatar: i.uploaderAvatar || null,
  caption: i.caption || '', tags: i.tags || [], likes: i.likes || 0, commentCount: i.commentCount || 0, createdAt: i.createdAt,
});

app.get(
  '/api/on-this-day',
  asyncRoute(async (req, res) => {
    const snap = await getSnapshot();
    const groups = onThisDay(snap.items).map((g) => ({ ...g, items: g.items.map(pub) }));
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ groups });
  })
);

app.get('/ara', (req, res) => res.render('search', { q: String(req.query.q || '').slice(0, 60) }));

app.get(
  '/api/search',
  searchLimiter,
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
    if (q.replace(/#/g, '').length < 2) return res.json({ q, items: [], users: [], tags: [], total: 0, hasMore: false, nextOffset: 0 });

    const snap = await getSnapshot();
    const r = searchItems(snap.items, q, { limit, offset });
    res.json({
      q,
      items: r.items.map(pub),
      users: offset === 0 ? searchUsers(snap.items, q) : [],
      tags: offset === 0 ? searchTags(snap.items, q) : [],
      total: r.total,
      nextOffset: offset + r.items.length,
      hasMore: offset + r.items.length < r.total,
    });
  })
);

app.get(
  '/api/tags/trending',
  asyncRoute(async (req, res) => {
    const snap = await getSnapshot();
    res.set('Cache-Control', 'public, max-age=120');
    res.json({ tags: trendingTags(snap.items) });
  })
);

// ---------- Yıl özeti (yalnızca kendi verin) ----------
async function userAwards(uid) {
  try {
    const { data, error } = await supabase.from('weekly_awards').select('*').eq('user_id', uid);
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}
async function reactionsReceived(ids) {
  if (!ids.length) return 0;
  try {
    const rows = await fetchAll(supabase, 'reactions', 'item_id', (q) => q.in('item_id', ids.slice(0, 150)).order('item_id').order('user_id'));
    return rows.length;
  } catch {
    return null;
  }
}

app.get(
  '/yilim',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const nowYear = trYear(Date.now());
    let year = Number(req.query.yil) || nowYear;
    if (!Number.isInteger(year) || year < 2020 || year > nowYear) year = nowYear;

    const snap = await getSnapshot();
    const uid = req.session.userId;
    const myIds = snap.items.filter((i) => i.userId === uid && trYear(i.createdAt) === year).map((i) => i.id);
    const [awards, reactions] = await Promise.all([userAwards(uid), reactionsReceived(myIds)]);

    const data = buildWrapped({ items: snap.items, userId: uid, year, awards, reactionsReceived: reactions });
    if (data.topMemory) data.topMemory.imageUrl = data.topMemory.type === 'video' ? videoPoster(data.topMemory.url, 700) : cloudImg(data.topMemory.url, 700);

    res.render('wrapped', {
      data, year, username: req.session.username, host: req.get('host'),
      years: [nowYear, nowYear - 1].filter((y) => y >= 2023),
    });
  })
);
