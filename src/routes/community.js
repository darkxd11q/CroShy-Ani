// Topluluk: ödül/teşekkür ekranları ve geri bildirim.
const { BADGE_INFO, app, asyncRoute, awards, feedback, feedbackLimiter, likes, requireUserApi, users } = require('../core');

// ---------- Kutlama / teşekkür ekranları (haftalık ödül + onaylanan geri bildirim) ----------
// Giriş yapmış kullanıcı için henüz görmediği ödül/teşekkür varsa döndürür.
// (Boşsa 5 dakikada bir kontrol edilir; gereksiz veritabanı sorgusu olmasın.)
app.get(
  '/api/pending-award',
  asyncRoute(async (req, res) => {
    if (!req.session || !req.session.userId) return res.json({ awards: [], thanks: [] });
    if (Date.now() - (req.session.awardCheckedAt || 0) < 5 * 60 * 1000) return res.json({ awards: [], thanks: [] });

    const uid = req.session.userId;
    const [list, thanksList, user] = await Promise.all([
      awards.getUnseenForUser(uid).catch(() => []),
      feedback.getUnseenThanks(uid).catch(() => []),
      users.findUserById(uid),
    ]);
    if (list.length === 0 && thanksList.length === 0) req.session.awardCheckedAt = Date.now();

    res.json({
      username: user ? user.username : req.session.username,
      awards: list.map((a) => ({
        id: a.id,
        badge: a.badge,
        label: BADGE_INFO[a.badge].label,
        icon: BADGE_INFO[a.badge].icon,
        submissions: a.submissions,
        likes: a.likes,
        weekEnd: a.weekEnd,
        themeExpiresAt: a.themeExpiresAt,
      })),
      thanks: thanksList.map((t) => ({ id: t.id, type: t.status, excerpt: t.message.slice(0, 140) })),
    });
  })
);

app.post(
  '/api/award-seen',
  requireUserApi,
  asyncRoute(async (req, res) => {
    await Promise.all([
      awards.markSeenForUser(req.session.userId).catch(() => {}),
      feedback.markThanksSeen(req.session.userId).catch(() => {}),
    ]);
    req.session.awardCheckedAt = Date.now();
    res.json({ ok: true });
  })
);

app.post(
  '/api/feedback',
  requireUserApi,
  feedbackLimiter,
  asyncRoute(async (req, res) => {
    const message = String(req.body.message || '').trim();
    if (message.length < 5) return res.status(400).json({ error: 'Geri bildirim en az 5 karakter olmalı.' });
    if (message.length > 600) return res.status(400).json({ error: 'Geri bildirim en fazla 600 karakter olabilir.' });

    const user = await users.findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });

    const recent = await feedback.countRecent(user.id, Date.now() - 24 * 60 * 60 * 1000);
    if (recent >= 5) return res.status(429).json({ error: 'Bugün en fazla 5 geri bildirim gönderebilirsin.' });

    await feedback.create({ userId: user.id, username: user.username, message });
    res.json({ ok: true });
  })
);
