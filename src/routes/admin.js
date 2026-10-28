// Admin paneli ve admin API'leri.
const { BADGE_INFO, BADGE_ORDER, CODE_VALID_MS, DELETE_RETENTION_MS, FALLBACK_SETTINGS, REDEEMABLE_BADGES, app, asyncRoute, awards, bans, cloudinary, db, deletedUserIds, effectiveLimitsFor, feedback, generateRedeemCode, getSettingsSafe, latestAwardTime, likes, purgeExpiredDeletions, redeemCodes, rememberTokens, renamedUsers, requireAdminApi, requireAdminPage, requireSuperAdminApi, settings, users, validateNewUsername } = require('../core');
const coreAll = require('../core');
const supabase_sb = require('../../supabaseClient');
async function supabase_cleanup(userId) {
  // yorumlar, tepkiler, bildirimler: hesapla birlikte silinir
  for (const t of ['comments', 'reactions', 'notifications']) {
    try {
      await supabase_sb.from(t).delete().eq('user_id', userId);
    } catch (e) {
      console.error('Temizlik atlandı (' + t + '):', e.message);
    }
  }
} // hashPassword, crypto, rememberTokens vb.
const { notify } = require('../notify');
const { extractMentions } = require('../lib/richtext');
const { invalidateSnapshot } = require('../snapshot');

app.get(
  '/admin',
  requireAdminPage,
  asyncRoute(async (req, res) => {
    const isSuperAdmin = req.session.adminRole === 'superadmin';

    // Moderatör hesabı için IP listesi/genel ayarlar/kullanıcı limitleri/
    // rozetler/onaylı anılar/silinenler hiç çekilmiyor bile — hem gereksiz
    // Supabase isteği yapılmasın hem de bu veriler yanlışlıkla template'e
    // sızmasın diye.
    const [
      pending,
      approvedCount,
      banList,
      customLimitUsers,
      globalSettings,
      badgeUsers,
      weeklyLeaderboard,
      approvedRaw,
      likeCounts,
      deletedItems,
      redeemCodeList,
      feedbackList,
      bannedUsers,
    ] = await Promise.all([
      db.getPendingItems(),
      db.getApprovedCount(),
      isSuperAdmin ? bans.listBans() : Promise.resolve([]),
      isSuperAdmin ? users.listUsersWithCustomLimits() : Promise.resolve([]),
      isSuperAdmin ? getSettingsSafe() : Promise.resolve(FALLBACK_SETTINGS),
      isSuperAdmin ? users.listUsersWithBadges() : Promise.resolve([]),
      isSuperAdmin ? users.getWeeklyLeaderboard(latestAwardTime(Date.now())) : Promise.resolve({ topSubmitters: [], topLiked: [] }),
      isSuperAdmin ? db.getApprovedItems() : Promise.resolve([]),
      isSuperAdmin ? likes.getAllCounts() : Promise.resolve({}),
      isSuperAdmin ? db.getDeletedItems() : Promise.resolve([]),
      isSuperAdmin ? redeemCodes.listRecent(25) : Promise.resolve([]),
      isSuperAdmin ? feedback.listForAdmin(60).catch(() => []) : Promise.resolve([]),
      isSuperAdmin ? users.listBanned().catch(() => []) : Promise.resolve([]),
    ]);

    const approvedItems = approvedRaw
      .map((i) => ({ ...i, likes: likeCounts[i.id] || 0 }))
      .sort((a, b) => b.createdAt - a.createdAt);

    res.render('admin', {
      pending,
      approvedCount,
      approvedItems,
      deletedItems,
      redeemCodeList,
      feedbackList,
      bannedUsers,
      deleteRetentionMs: DELETE_RETENTION_MS,
      username: req.session.username || 'admin',
      adminRole: req.session.adminRole || 'superadmin',
      bans: banList,
      customLimitUsers,
      settings: globalSettings,
      badgeUsers,
      weeklyLeaderboard,
      BADGE_INFO,
      BADGE_ORDER,
    });
  })
);

// Site geneli varsayılan ayarları güncelle (günlük limit, boyut/süre sınırları)
// — sadece tam yetkili admin.
app.post(
  '/api/admin/settings',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { dailySubmitLimit, maxImageMb, maxVideoMb, maxVideoDurationSec } = req.body;

    const patch = {};
    if (dailySubmitLimit !== undefined && dailySubmitLimit !== '') {
      const n = Number(dailySubmitLimit);
      if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Geçersiz günlük limit.' });
      patch.dailySubmitLimit = Math.round(n);
    }
    if (maxImageMb !== undefined && maxImageMb !== '') {
      const n = Number(maxImageMb);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Geçersiz fotoğraf sınırı.' });
      patch.maxImageBytes = Math.round(n * 1024 * 1024);
    }
    if (maxVideoMb !== undefined && maxVideoMb !== '') {
      const n = Number(maxVideoMb);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Geçersiz video sınırı.' });
      patch.maxVideoBytes = Math.round(n * 1024 * 1024);
    }
    if (maxVideoDurationSec !== undefined && maxVideoDurationSec !== '') {
      const n = Number(maxVideoDurationSec);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Geçersiz video süresi.' });
      patch.maxVideoDurationSec = Math.round(n);
    }

    const updated = await settings.updateSettings(patch);
    res.json({ ok: true, settings: updated });
  })
);

// Belirli bir kullanıcı için özel dosya boyutu/süre sınırları belirle.
// Bir alan boş bırakılırsa o alan genel ayara döner (null yapılır).
// — sadece tam yetkili admin.
app.post(
  '/api/admin/user-limits',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, imageMb, videoMb, videoDurationSec } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    }

    const imageBytes = imageMb !== undefined && imageMb !== '' && imageMb !== null ? Math.round(Number(imageMb) * 1024 * 1024) : null;
    const videoBytes = videoMb !== undefined && videoMb !== '' && videoMb !== null ? Math.round(Number(videoMb) * 1024 * 1024) : null;
    const durationSec =
      videoDurationSec !== undefined && videoDurationSec !== '' && videoDurationSec !== null
        ? Math.round(Number(videoDurationSec))
        : null;

    if (imageBytes !== null && (!Number.isFinite(imageBytes) || imageBytes <= 0)) {
      return res.status(400).json({ error: 'Geçersiz fotoğraf sınırı.' });
    }
    if (videoBytes !== null && (!Number.isFinite(videoBytes) || videoBytes <= 0)) {
      return res.status(400).json({ error: 'Geçersiz video sınırı.' });
    }
    if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec <= 0)) {
      return res.status(400).json({ error: 'Geçersiz video süresi.' });
    }

    const user = await users.setCustomLimits(username.trim(), { imageBytes, videoBytes, videoDurationSec: durationSec });
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username });
  })
);

app.post(
  '/api/admin/user-limits/reset',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    }
    const user = await users.clearCustomLimits(username.trim());
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username });
  })
);

// Tek kullanımlık, 1 gün geçerli rozet kodu oluştur — sadece tam yetkili admin.
app.post(
  '/api/admin/redeem-codes/create',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { badge } = req.body;
    if (!REDEEMABLE_BADGES.includes(badge)) return res.status(400).json({ error: 'Geçersiz rol.' });
    const days = Number(req.body.days || 0); // 0 = süresiz
    if (![0, 7, 30, 90].includes(days)) return res.status(400).json({ error: 'Geçersiz süre.' });

    const code = generateRedeemCode();
    const now = Date.now();
    const expiresAt = now + CODE_VALID_MS;
    await redeemCodes.create({ code, badge, createdAt: now, expiresAt, durationDays: days || null });

    res.json({ ok: true, code, badge, label: BADGE_INFO[badge].label, icon: BADGE_INFO[badge].icon, expiresAt, days });
  })
);

// Rozet ver / kaldır — sadece tam yetkili admin. "founder"/"croshy" rozeti
// sahibini tüm sınırlardan muaf tutar (bkz. effectiveLimitsFor).
app.post(
  '/api/admin/badges/grant',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, badge } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    if (!BADGE_INFO[badge]) return res.status(400).json({ error: 'Geçersiz rozet.' });

    const user = await users.grantBadge(username.trim(), badge);
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username, badges: user.badges });
  })
);

app.post(
  '/api/admin/badges/revoke',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, badge } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    if (!BADGE_INFO[badge]) return res.status(400).json({ error: 'Geçersiz rozet.' });

    const user = await users.revokeBadge(username.trim(), badge);
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username, badges: user.badges });
  })
);

// Onaylama, reddetme ve IP yasaklama — hem moderatör hem tam yetkili admin
// kullanabilir.
app.post(
  '/api/admin/approve/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Bulunamadı.' });
    await db.approveItem(req.params.id);
    invalidateSnapshot();
    if (item.userId) notify(item.userId, { type: 'approved', text: 'Anın onaylandı ve yayında! 🎉', link: `/m/${item.id}` });
    // Açıklamada @kullanıcı ile etiketlenenlere bildirim
    try {
      const mentioned = await users.findUsersByUsernames(extractMentions(item.caption));
      for (const u of mentioned) {
        if (u.id === item.userId) continue;
        notify(u.id, {
          type: 'mention',
          text: `${item.uploaderName} seni bir anıda etiketledi: “${String(item.caption).slice(0, 60)}”`,
          link: `/m/${item.id}`,
          dedupeKey: `mention:${item.id}:${u.id}`,
        });
      }
    } catch (e) {
      console.error('Etiket bildirimi hatası:', e.message);
    }
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/reject/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Bulunamadı.' });

    // Yumuşak silme: Cloudinary'den hemen silinmez, 24 saat "Son Silinenler"
    // altında geri alınabilir durumda bekler (bkz. purgeExpiredDeletions).
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
    await db.softDeleteItem(item.id, reason);
    if (item.userId) {
      notify(item.userId, { type: 'rejected', text: `Anın yayınlanmadı${reason ? ': ' + reason : '.'}`, link: '/profile' });
    }
    res.json({ ok: true });
  })
);

// Daha önce onaylanmış (zaten yayında olan) bir anıyı kaldırır.
// Sadece tam yetkili admin kullanabilir. Yumuşak silinir — 24 saat içinde
// "Son Silinenler" bölümünden geri alınabilir.
app.post(
  '/api/admin/delete-approved/:id',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });

    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
    await db.softDeleteItem(item.id, reason);
    if (item.userId) {
      notify(item.userId, { type: 'removed', text: `Anın yayından kaldırıldı${reason ? ': ' + reason : '.'}`, link: '/profile' });
    }
    res.json({ ok: true });
  })
);

// Yumuşak silinmiş bir anıyı (24 saatlik süre dolmadan önce) geri getirir.
// Sadece tam yetkili admin kullanabilir.
app.post(
  '/api/admin/restore/:id',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getAnyItemById(req.params.id);
    if (!item || !item.deletedAt) return res.status(404).json({ error: 'Bulunamadı ya da zaten silinmemiş.' });

    await db.restoreItem(item.id);
    res.json({ ok: true });
  })
);

// Bir anıyı reddedip gönderenin HESABINI yasaklar; hesabın bekleyen tüm anıları da
// kaldırılır (yumuşak silme). Yasak IP'ye değil hesaba uygulanır: ortak IP'li mobil
// kullanıcılar etkilenmez. Moderatör bu işlemi yapabilir ama IP'yi hiç görmez.
app.post(
  '/api/admin/ban/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const target = await db.getItemById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Bulunamadı.' });
    if (!target.userId) return res.status(400).json({ error: 'Bu kayıt bir hesaba bağlı değil.' });

    const user = await users.findUserById(target.userId);
    if (!user) return res.status(404).json({ error: 'Hesap bulunamadı.' });

    await users.setBanned(user.id, true, `Reddedilen anı: ${target.id}`);
    const pending = (await db.getItemsByUserId(user.id)).filter((i) => i.status === 'pending');
    for (const it of pending) await db.softDeleteItem(it.id, 'Hesap yasaklandı');
    notify(user.id, { type: 'system', text: 'Hesabının anı gönderme ve etkileşim yetkisi kaldırıldı.', link: '/profile' });

    res.json({ ok: true, removedCount: pending.length });
  })
);

// Yasağı kaldırma — sadece tam yetkili admin (moderatör IP'yi zaten göremiyor).
app.post(
  '/api/admin/unban',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP belirtilmedi.' });
    await bans.unbanIp(ip);
    res.json({ ok: true });
  })
);

// Süper admin: geri bildirimi onayla / çok beğen / geç
app.post(
  '/api/admin/feedback/:id/:action',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const action = req.params.action;
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz kayıt.' });
    const fb = await feedback.getById(id);
    if (!fb) return res.status(404).json({ error: 'Bulunamadı.' });

    if (action === 'approve') {
      // "Çok beğenildi" olmuş bir bildirimi daha düşük bir duruma çevirme
      if (fb.status !== 'loved') await feedback.setStatus(id, 'approved');
    } else if (action === 'love') {
      await feedback.setStatus(id, 'loved');
      const u = await users.findUserById(fb.userId);
      if (u) await users.grantBadge(u.username, 'supporter'); // Destekçi rozeti (+1 günlük hak)
    } else if (action === 'dismiss') {
      await feedback.setStatus(id, 'dismissed');
    } else {
      return res.status(400).json({ error: 'Geçersiz işlem.' });
    }
    res.json({ ok: true });
  })
);

// ---------- Admin: hesap arama / yeniden adlandırma / silme (süper admin) ----------
app.get(
  '/api/admin/users/search',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    res.json({ users: await users.searchUsers(req.query.q) });
  })
);

app.post(
  '/api/admin/users/rename',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, newUsername } = req.body;
    const target = await users.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const err = validateNewUsername(newUsername);
    if (err) return res.status(400).json({ error: err });

    const r = await users.renameUser(target.id, newUsername, { byAdmin: true });
    if (!r.ok) {
      if (r.reason === 'DUPLICATE') return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
      if (r.reason === 'SAME') return res.status(400).json({ error: 'Yeni ad mevcut adla aynı.' });
      return res.status(400).json({ error: 'Kullanıcı adı değiştirilemedi.' });
    }
    renamedUsers.set(target.id, r.username);
    res.json({ ok: true, username: r.username });
  })
);

app.post(
  '/api/admin/users/delete',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, confirm } = req.body;
    const target = await users.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    // Yanlışlıkla silmeyi önlemek için kullanıcı adı yazılarak onaylanır
    if (String(confirm || '').trim().toLowerCase() !== target.username.toLowerCase()) {
      return res.status(400).json({ error: 'Onay için kullanıcı adını doğru yazmalısın.' });
    }

    // Anıları yumuşak silinir (24 saat içinde "Son Silinenler"den görülebilir,
    // sonra kalıcı olarak temizlenir); fotoğraf, oturumlar ve ilişkili kayıtlar silinir.
    const items = await db.getItemsByUserId(target.id);
    for (const it of items) await db.softDeleteItem(it.id);
    if (target.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(target.avatarPublicId, { resource_type: 'image' });
      } catch (e) {
        console.error('Avatar silinemedi:', e.message);
      }
    }
    await rememberTokens.removeAllForSubject('user', target.id).catch(() => {});
    await awards.deleteForUser(target.id).catch(() => {});
    await feedback.deleteForUser(target.id).catch(() => {});
    await supabase_cleanup(target.id);
    await users.deleteUser(target.id);
    deletedUserIds.add(target.id);

    res.json({ ok: true, username: target.username, removedItems: items.length });
  })
);


// ---------- Hesap yasağı / şifre sıfırlama (süper admin) ----------
app.post(
  '/api/admin/users/ban',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const { username, banned, reason } = req.body;
    const target = await users.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    await users.setBanned(target.id, !!banned, reason);
    notify(target.id, {
      type: 'system',
      text: banned ? 'Hesabının anı gönderme ve etkileşim yetkisi kaldırıldı.' : 'Hesabındaki kısıtlama kaldırıldı. Tekrar hoş geldin! 💜',
      link: '/profile',
    });
    res.json({ ok: true, banned: !!banned });
  })
);

// E-posta olmadığı için şifre sıfırlama admin üzerinden yapılır: geçici şifre üretilir,
// admin bunu kullanıcıya iletir; kullanıcı profilinden değiştirir.
app.post(
  '/api/admin/users/reset-password',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const target = await users.findUserByUsername(req.body.username);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const tempPassword = coreAll.crypto.randomBytes(9).toString('base64url').slice(0, 10);
    await users.updatePasswordHash(target.id, coreAll.hashPassword(tempPassword));
    await coreAll.rememberTokens.removeAllForSubject('user', target.id).catch(() => {});
    res.json({ ok: true, username: target.username, tempPassword });
  })
);
