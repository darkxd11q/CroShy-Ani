// Sayfalar: ana sayfa, yükleme, herkese açık profil, kod kullanma.
const { BADGE_INFO, BADGE_ORDER, ROOT, app, asyncRoute, canStyleName, db, likes, path, redeemCodes, redeemGuard, requireUserPage, users } = require('../core');

// ---------- Sayfalar ----------

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.get('/upload', requireUserPage, (req, res) => {
  res.sendFile(path.join(ROOT, 'protected', 'upload.html'));
});

// Herkese açık profil — sadece onaylı anılar, sadece herkese açık bilgiler
// (bekleyen sayısı, sınırlar, IP gibi özel bilgiler asla gösterilmez).
app.get(
  '/u/:username',
  asyncRoute(async (req, res) => {
    const user = await users.findUserByUsername(req.params.username);
    if (!user) return res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));

    const [myItems, likeCounts] = await Promise.all([db.getItemsByUserId(user.id), likes.getAllCounts()]);
    const approvedItems = myItems
      .filter((i) => i.status === 'approved')
      .map((i) => ({ ...i, likes: likeCounts[i.id] || 0, ip: undefined }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const totalLikes = approvedItems.reduce((sum, i) => sum + i.likes, 0);

    res.render('public-profile', {
      profileUsername: user.username,
      avatarUrl: user.avatarUrl,
      nameStyle: canStyleName(user) ? user.nameStyle : null,
      bio: user.bio,
      badges: user.badges,
      BADGE_INFO,
      BADGE_ORDER,
      createdAt: user.createdAt,
      approvedCount: approvedItems.length,
      totalLikes,
      items: approvedItems,
      isOwnProfile: req.session && req.session.username === user.username,
    });
  })
);

// ---------- Kod kullanma (/redeem) ----------

app.get('/redeem', requireUserPage, (req, res) => {
  res.render('redeem', { error: null, success: null });
});

app.post(
  '/redeem',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const ip = req.ip;
    const { locked, remainingMs } = redeemGuard.getLoginStatus(ip);
    if (locked) {
      const minutes = Math.ceil(remainingMs / 60000);
      return res.status(429).render('redeem', {
        error: `Çok fazla hatalı deneme yapıldı. Lütfen ${minutes} dakika sonra tekrar dene.`,
        success: null,
      });
    }

    const raw = (req.body.code || '').toString().trim();
    // Kod yerine "admin" yazılırsa admin GİRİŞ sayfasına yönlendir.
    if (raw.toLowerCase() === 'admin') return res.redirect('/admin/login');
    const fail = (msg) => {
      redeemGuard.registerFailedAttempt(ip);
      return res.render('redeem', { error: msg, success: null });
    };

    // Büyük/küçük harf ayrımı önemli: DARK-1907- + tam 8 harf.
    if (!/^DARK-1907-[A-Za-z]{8}$/.test(raw)) return fail('Bu kod geçerli bir formatta değil.');

    const record = await redeemCodes.findByCode(raw);
    if (!record) return fail('Böyle bir kod bulunamadı.');
    if (record.redeemedBy) return fail('Bu kod daha önce kullanılmış.');
    if (record.expiresAt < Date.now()) return fail('Bu kodun süresi dolmuş.');

    // Atomik "sahiplen": aynı anda iki kişi denerse sadece biri başarılı olur.
    const claimed = await redeemCodes.markRedeemed(record.code, req.session.username);
    if (!claimed) return fail('Bu kod daha önce kullanılmış.');

    await users.grantBadge(req.session.username, record.badge, { days: record.durationDays });
    redeemGuard.resetAttempts(ip);

    res.render('redeem', {
      error: null,
      success: {
        badge: record.badge,
        label: BADGE_INFO[record.badge].label,
        icon: BADGE_INFO[record.badge].icon,
        username: req.session.username,
        days: record.durationDays,
      },
    });
  })
);
