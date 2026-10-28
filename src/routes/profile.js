// Profil: şifre, biyografi, tema, fotoğraf, isim.
const { AVATAR_GIF_MAX_BYTES, AVATAR_MAX_BYTES, REWARD_THEMES, SAFE_CLOUD_URL, allowedThemesFor, app, asyncRoute, avatarLimiter, awards, buildOwnProfileData, canStyleName, canUseGifAvatar, cloudinary, db, hashPassword, renamedUsers, requireUserApi, requireUserPage, sanitizeNameStyle, setThemeCookie, users, validateNewUsername, verifyHashedPassword } = require('../core');

app.get(
  '/profile',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const data = await buildOwnProfileData(req.session.userId, req.session.username);
    res.render('profile', data);
  })
);

app.post(
  '/profile/change-password',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    const user = await users.findUserById(req.session.userId);
    if (!user || !verifyHashedPassword(currentPassword, user.passwordHash)) {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, error: 'Mevcut şifren yanlış.' });
    }
    if (!newPassword || newPassword.length < 6) {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, error: 'Yeni şifre en az 6 karakter olmalı.' });
    }
    if (newPassword !== confirmNewPassword) {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, error: 'Yeni şifreler eşleşmiyor.' });
    }

    await users.updatePasswordHash(user.id, hashPassword(newPassword));
    const data = await buildOwnProfileData(req.session.userId, req.session.username);
    res.render('profile', { ...data, success: 'Şifren başarıyla güncellendi.' });
  })
);

app.post(
  '/profile/update-bio',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const bio = (req.body.bio || '').toString().trim().slice(0, 160);
    await users.updateBio(req.session.userId, bio);
    const data = await buildOwnProfileData(req.session.userId, req.session.username);
    res.render('profile', { ...data, success: 'Profilin güncellendi.' });
  })
);

// Kendi gönderdiğin bir anıyı (bekleyen ya da onaylı) sil (24 saat içinde
// admin tarafından geri alınabilir durumda kalır).
app.post(
  '/profile/delete/:id',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (item && item.userId === req.session.userId) {
      await db.softDeleteItem(item.id);
    }
    // item bulunamadıysa ya da başkasına aitse sessizce yok say — kendi
    // anılarının kimliğini/id'sini bilmeyen biri başkasının anısını silemez.
    const data = await buildOwnProfileData(req.session.userId, req.session.username);
    res.render('profile', { ...data, success: 'Anı silindi.' });
  })
);

// ---------- Tema seçimi (sadece ÖZEL / Plus) ----------

app.post(
  '/profile/update-theme',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const [user, rewardExpiry] = await Promise.all([
      users.findUserById(req.session.userId),
      awards.getRewardExpiry(req.session.userId),
    ]);
    const theme = (req.body.theme || '').toString().trim();
    const renderWith = async (extra) => {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, ...extra });
    };

    const allowed = allowedThemesFor(user, rewardExpiry);
    if (theme && !allowed.includes(theme)) {
      return renderWith({
        error: REWARD_THEMES.includes(theme)
          ? 'Bu tema sadece haftalık rozet kazananlara özel (kazandıktan sonra 15 gün).'
          : 'Tema seçimi sadece ÖZEL ve Plus üyelere açık.',
      });
    }

    await users.updateTheme(user.id, theme || null);
    setThemeCookie(res, theme, rewardExpiry);
    req.session.theme = theme || null;
    req.session.themeRewardExpiry = rewardExpiry;
    req.session.themeCheckedAt = Date.now();
    return renderWith({ success: theme ? 'Tema uygulandı.' : 'Varsayılan temaya dönüldü.' });
  })
);

app.post(
  '/api/profile/avatar',
  requireUserApi,
  avatarLimiter,
  asyncRoute(async (req, res) => {
    const { url, publicId, bytes, format } = req.body;
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const fmt = String(format || '').toLowerCase();
    const destroyUploaded = async () => {
      if (!publicId) return;
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (e) {
        console.error('Cloudinary silme hatası (avatar):', e.message);
      }
    };

    if (!url || !publicId || !SAFE_CLOUD_URL.test(url) || (cloud && !url.startsWith(`https://res.cloudinary.com/${cloud}/`))) {
      return res.status(400).json({ error: 'Geçersiz görsel kaynağı.' });
    }
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fmt)) {
      await destroyUploaded();
      return res.status(400).json({ error: 'Desteklenmeyen görsel türü.' });
    }

    const user = await users.findUserById(req.session.userId);
    const isGif = fmt === 'gif';
    if (isGif && !canUseGifAvatar(user)) {
      await destroyUploaded();
      return res.status(403).json({ error: 'GIF profil fotoğrafı sadece ÖZEL ve Plus üyelere açık.' });
    }
    const limit = isGif ? AVATAR_GIF_MAX_BYTES : AVATAR_MAX_BYTES;
    if (typeof bytes === 'number' && bytes > limit) {
      await destroyUploaded();
      return res.status(413).json({ error: `Profil fotoğrafı en fazla ${(limit / (1024 * 1024)).toFixed(0)} MB olabilir.` });
    }

    const oldPublicId = user && user.avatarPublicId;
    await users.setAvatar(user.id, { url, publicId });
    if (oldPublicId && oldPublicId !== publicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' });
      } catch (e) {
        console.error('Eski avatar silinemedi:', e.message);
      }
    }
    res.json({ ok: true, avatarUrl: url });
  })
);

app.post(
  '/api/profile/avatar/remove',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const user = await users.findUserById(req.session.userId);
    if (user && user.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(user.avatarPublicId, { resource_type: 'image' });
      } catch (e) {
        console.error('Avatar silinemedi:', e.message);
      }
    }
    await users.clearAvatar(req.session.userId);
    res.json({ ok: true });
  })
);

app.post(
  '/profile/change-name',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const renderWith = async (extra) => {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, ...extra });
    };
    const newName = String(req.body.newUsername || '').trim();
    const err = validateNewUsername(newName);
    if (err) return renderWith({ error: err });

    const info = await users.getNameChangeInfo(req.session.userId);
    if (info.remaining <= 0) {
      return renderWith({ error: 'Kullanıcı adı değiştirme hakkın doldu (14 günde en fazla 2 kez).' });
    }

    const r = await users.renameUser(req.session.userId, newName, { byAdmin: false });
    if (!r.ok) {
      if (r.reason === 'DUPLICATE') return renderWith({ error: 'Bu kullanıcı adı zaten alınmış.' });
      if (r.reason === 'SAME') return renderWith({ error: 'Bu zaten şu anki kullanıcı adın.' });
      return renderWith({ error: 'Kullanıcı adı değiştirilemedi.' });
    }

    req.session.username = r.username;
    renamedUsers.set(req.session.userId, r.username);
    return renderWith({ success: 'Kullanıcı adın güncellendi.' });
  })
);

// ---------- İsim rengi ----------
app.post(
  '/api/profile/name-style',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const user = await users.findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
    if (!canStyleName(user)) {
      return res.status(403).json({ error: 'İsim rengi ÖZEL, Plus ve haftalık rozet sahiplerine açık.' });
    }
    const style = sanitizeNameStyle(req.body, user.username);
    if (style === undefined) return res.status(400).json({ error: 'Geçersiz renk seçimi.' });
    await users.setNameStyle(user.id, style);
    res.json({ ok: true, style });
  })
);
