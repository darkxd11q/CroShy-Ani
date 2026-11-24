// Normal hesap <-> yönetici hesabı arasında ŞİFRESİZ geçiş.
// Bağlantı bir kez, yönetici panelinden (normal hesabın şifresiyle) kurulur. 2 adımlı doğrulaması AÇIK
// yöneticiler için normal hesaptan admin'e geçerken şifre değil, 6 haneli kod istenir.
const core = require('../core');
const { app, asyncRoute, requireAdminApi, createRateLimiter, createLoginGuard, users } = core;
const admins = require('../../admins');
const totp = require('../lib/totp');
const { record: auditRecord } = require('../audit');

const limiter = createRateLimiter({ name: 'identityLimiter', windowMs: 10 * 60 * 1000, max: 60, message: 'Çok fazla deneme. Biraz bekle.' });
const guard = createLoginGuard({ name: 'identityGuard', maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 });

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));

app.post(
  '/api/identity/switch',
  limiter,
  asyncRoute(async (req, res) => {
    const to = req.body && req.body.to;
    const sess = req.session || {};

    if (to === 'admin') {
      if (!sess.userId) return res.status(401).json({ error: 'Önce normal hesabınla giriş yapmalısın.' });
      const lock = guard.getLoginStatus(req.ip);
      if (lock.locked) return res.status(429).json({ error: 'Çok fazla hatalı deneme. Biraz sonra tekrar dene.' });

      const admin = await admins.findByLinkedUser(sess.userId);
      if (!admin) return res.status(404).json({ error: 'Bu hesaba bağlı bir yönetici hesabı yok.' });
      if (admin.disabled) return res.status(403).json({ error: 'Yönetici hesabın devre dışı.' });

      if (admin.totpEnabled) {
        const code = String((req.body && req.body.totp) || '').replace(/\s+/g, '');
        if (!code) return res.status(401).json({ needTotp: true, error: 'Doğrulama kodu gerekli (2 adımlı doğrulama açık).' });
        let ok = false;
        try {
          ok = totp.verifyTotp(totp.decryptSecret(admin.totpSecret), code);
        } catch {}
        if (!ok) {
          guard.registerFailedAttempt(req.ip);
          return res.status(401).json({ needTotp: true, error: 'Doğrulama kodu yanlış.' });
        }
        guard.resetAttempts(req.ip);
      }

      await regenerate(req);
      req.session.isAdmin = true;
      req.session.adminRole = admin.role;
      req.session.adminId = admin.id;
      req.session.username = admin.username;
      req.session.adminLoginAt = Date.now();
      auditRecord({ actor: admin.username, role: admin.role, action: 'identity_switch', label: 'Normal hesaptan yönetici hesabına geçti', status: 200 });
      return res.json({ ok: true, redirect: '/admin' });
    }

    if (to === 'user') {
      if (!(sess.isAdmin && sess.adminId)) return res.status(400).json({ error: 'Kişisel yönetici hesabınla giriş yapmış olmalısın.' });
      const admin = await admins.findById(sess.adminId);
      if (!admin || admin.disabled || !admin.linkedUserId) return res.status(404).json({ error: 'Bağlı bir normal hesabın yok.' });
      const user = await users.findUserById(admin.linkedUserId);
      if (!user) return res.status(404).json({ error: 'Bağlı hesap bulunamadı.' });

      auditRecord({ actor: admin.username, role: admin.role, action: 'identity_switch', label: 'Yönetici hesabından normal hesaba geçti', status: 200 });
      await regenerate(req);
      req.session.userId = user.id;
      req.session.username = user.username;
      try {
        await core.syncThemeCookie(res, user, req);
      } catch {}
      return res.json({ ok: true, redirect: '/' });
    }
    res.status(400).json({ error: 'Geçersiz istek.' });
  })
);

// Yönetici panelinden: normal hesabını bağla (bir kez kullanıcı adı + şifre)
app.post(
  '/api/identity/link-user',
  requireAdminApi,
  limiter,
  asyncRoute(async (req, res) => {
    if (!req.session.adminId) return res.status(400).json({ error: 'Kişisel bir yönetici hesabı gerekli (acil durum hesabı bağlanamaz).' });
    const lock = guard.getLoginStatus(req.ip);
    if (lock.locked) return res.status(429).json({ error: 'Çok fazla hatalı deneme. Biraz sonra tekrar dene.' });

    const user = await users.findUserByUsername(String((req.body && req.body.username) || '').trim());
    if (!user || !core.verifyHashedPassword(req.body.password, user.passwordHash)) {
      guard.registerFailedAttempt(req.ip);
      return res.status(400).json({ error: 'Kullanıcı adı veya şifre yanlış.' });
    }
    guard.resetAttempts(req.ip);
    await admins.clearLinksForUser(user.id); // bir normal hesap tek bir yöneticiye bağlanabilir
    await admins.setLinkedUser(req.session.adminId, user.id);
    auditRecord({ actor: req.session.username, role: req.session.adminRole, action: 'identity_link', label: 'Normal hesabını yönetici hesabına bağladı', target: user.username, status: 200 });
    res.json({ ok: true, linkedUser: user.username });
  })
);

app.post(
  '/api/identity/unlink',
  requireAdminApi,
  limiter,
  asyncRoute(async (req, res) => {
    if (!req.session.adminId) return res.status(400).json({ error: 'Kişisel bir yönetici hesabı gerekli.' });
    await admins.setLinkedUser(req.session.adminId, null);
    auditRecord({ actor: req.session.username, role: req.session.adminRole, action: 'identity_unlink', label: 'Normal hesap bağlantısını kaldırdı', status: 200 });
    res.json({ ok: true });
  })
);
