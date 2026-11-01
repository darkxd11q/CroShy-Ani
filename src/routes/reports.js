// Şikayet et (kullanıcı) + şikayetleri değerlendirme (süper admin).
const core = require('../core');
const { app, asyncRoute, requireUserApi, requireSuperAdminApi, createRateLimiter, db, users } = core;
const reports = require('../../reports');
const social = require('../../social');
const { notify } = require('../notify');
const { invalidateSnapshot } = require('../snapshot');

const reportLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 15, message: 'Çok fazla şikayet gönderdin. Lütfen daha sonra tekrar dene.' });

async function submitReport(req, res, { itemId, commentId, ownerId }) {
  const reason = String(req.body.reason || '');
  if (!reports.REASONS[reason]) return res.status(400).json({ error: 'Lütfen bir neden seç.' });
  const me = await users.findUserById(req.session.userId);
  if (!me) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
  if (me.banned) return res.status(403).json({ error: 'Hesabının etkileşim yetkisi kaldırılmış.' });
  if (ownerId && ownerId === me.id) return res.status(400).json({ error: 'Kendi içeriğini şikayet edemezsin.' });

  const r = await reports.create({ itemId, commentId, reporterId: me.id, reason, details: String(req.body.details || '').trim() });
  res.json({ ok: true, duplicate: r.duplicate });
}

app.post(
  '/api/memory/:id/report',
  requireUserApi,
  reportLimiter,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });
    await submitReport(req, res, { itemId: item.id, commentId: null, ownerId: item.userId });
  })
);

app.post(
  '/api/comments/:id/report',
  requireUserApi,
  reportLimiter,
  asyncRoute(async (req, res) => {
    const c = await social.getComment(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Bulunamadı.' });
    await submitReport(req, res, { itemId: c.itemId, commentId: c.id, ownerId: c.userId });
  })
);

// Süper admin: şikayeti değerlendir. action: dismiss | remove-item | remove-comment
app.post(
  '/api/admin/reports/resolve',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { itemId, action } = req.body;
    const commentId = req.body.commentId ? Number(req.body.commentId) : null;
    if (!itemId || !['dismiss', 'remove-item', 'remove-comment'].includes(action)) return res.status(400).json({ error: 'Geçersiz işlem.' });
    const by = req.session.username;

    if (action === 'remove-item') {
      const item = await db.getAnyItemById(itemId);
      if (item && !item.deletedAt) {
        await db.softDeleteItem(item.id, 'Şikayet üzerine kaldırıldı');
        invalidateSnapshot();
        if (item.userId) notify(item.userId, { type: 'removed', text: 'Anın, topluluk kurallarına aykırı bulunduğu için yayından kaldırıldı.', link: '/profile' });
      }
    } else if (action === 'remove-comment' && commentId) {
      const c = await social.getComment(commentId);
      if (c) {
        await social.deleteComment(c.id);
        invalidateSnapshot();
        notify(c.userId, { type: 'removed', text: 'Bir yorumun, topluluk kurallarına aykırı bulunduğu için kaldırıldı.', link: '/' });
      }
    }

    const reporters = await reports.closeTarget({ itemId, commentId }, action === 'dismiss' ? 'dismissed' : 'resolved', by);
    for (const rid of reporters) notify(rid, { type: 'system', text: 'Şikayetin incelendi. Topluluğu daha güvenli tuttuğun için teşekkürler 🙏', link: '/' });
    res.json({ ok: true });
  })
);
