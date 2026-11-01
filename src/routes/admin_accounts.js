// Kişisel yönetici hesapları: oluşturma/şifre/devre dışı (süper admin) + 2 adımlı doğrulama ve
// şifre değiştirme (her yönetici kendi hesabı için).
const core = require('../core');
const { app, asyncRoute, requireAdminApi, requireSuperAdminApi } = core;
const QRCode = require('qrcode');
const admins = require('../../admins');
const totp = require('../lib/totp');

const NAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;
const newTempPassword = () => core.crypto.randomBytes(9).toString('base64url').slice(0, 12);

function revoke(adminId) {
  admins.revokedAt.set(adminId, Date.now());
}

// ---------- Süper admin: yönetici hesapları ----------
app.post(
  '/api/admin/admins/create',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const role = req.body.role === 'superadmin' ? 'superadmin' : 'moderator';
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Yönetici adı 3-20 karakter (harf, rakam, _ . -) olmalı.' });
    const reserved = [process.env.ADMIN_USERNAME, process.env.SUPERADMIN_USERNAME].filter(Boolean).map((n) => n.toLowerCase());
    if (reserved.includes(username.toLowerCase())) return res.status(400).json({ error: 'Bu ad acil durum hesabına ait.' });

    const tempPassword = newTempPassword();
    try {
      await admins.create({ id: core.crypto.randomUUID(), username, role, passwordHash: core.hashPassword(tempPassword), mustChangePassword: true });
    } catch (e) {
      if (e.code === 'DUPLICATE') return res.status(409).json({ error: e.message });
      throw e;
    }
    res.json({ ok: true, username, role, tempPassword });
  })
);

app.post(
  '/api/admin/admins/reset-password',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const a = await admins.findByUsername(req.body.username);
    if (!a) return res.status(404).json({ error: 'Yönetici bulunamadı.' });
    const tempPassword = newTempPassword();
    await admins.updatePassword(a.id, core.hashPassword(tempPassword), true);
    await core.rememberTokens.removeAllForSubject('admin', a.id).catch(() => {});
    revoke(a.id);
    res.json({ ok: true, username: a.username, tempPassword });
  })
);

app.post(
  '/api/admin/admins/disable',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const a = await admins.findByUsername(req.body.username);
    if (!a) return res.status(404).json({ error: 'Yönetici bulunamadı.' });
    if (a.id === req.session.adminId) return res.status(400).json({ error: 'Kendi hesabını devre dışı bırakamazsın.' });
    await admins.setDisabled(a.id, !!req.body.disabled);
    await core.rememberTokens.removeAllForSubject('admin', a.id).catch(() => {});
    revoke(a.id);
    res.json({ ok: true, disabled: !!req.body.disabled });
  })
);

app.post(
  '/api/admin/admins/delete',
  requireSuperAdminApi,
  asyncRoute(async (req, res) => {
    const a = await admins.findByUsername(req.body.username);
    if (!a) return res.status(404).json({ error: 'Yönetici bulunamadı.' });
    if (a.id === req.session.adminId) return res.status(400).json({ error: 'Kendi hesabını silemezsin.' });
    await admins.remove(a.id);
    await core.rememberTokens.removeAllForSubject('admin', a.id).catch(() => {});
    revoke(a.id);
    res.json({ ok: true });
  })
);

// ---------- Her yönetici: kendi hesabı (sadece kişisel hesaplar; .env hesabı için geçerli değil) ----------
async function myAdmin(req, res) {
  if (!req.session.adminId) {
    res.status(400).json({ error: 'Bu giriş acil durum hesabına ait. Kişisel bir yönetici hesabı gerekir.' });
    return null;
  }
  const a = await admins.findById(req.session.adminId);
  if (!a || a.disabled) {
    res.status(401).json({ error: 'Yönetici hesabı bulunamadı.', loginRequired: true });
    return null;
  }
  return a;
}

app.post(
  '/api/admin/me/2fa/setup',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const a = await myAdmin(req, res);
    if (!a) return;
    if (a.totpEnabled) return res.status(400).json({ error: '2 adımlı doğrulama zaten açık.' });
    const secret = totp.generateSecret();
    req.session.pendingTotp = secret;
    const otpauth = totp.otpauthUrl({ secret, account: a.username });
    res.json({ secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
  })
);

app.post(
  '/api/admin/me/2fa/enable',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const a = await myAdmin(req, res);
    if (!a) return;
    const secret = req.session.pendingTotp;
    if (!secret) return res.status(400).json({ error: 'Önce kurulumu başlat.' });
    if (!totp.verifyTotp(secret, req.body.code)) return res.status(400).json({ error: 'Kod yanlış. Uygulamadaki güncel 6 haneli kodu yaz.' });
    await admins.setTotp(a.id, { secretEnc: totp.encryptSecret(secret), enabled: true });
    await core.rememberTokens.removeAllForSubject('admin', a.id).catch(() => {}); // "beni hatırla" 2FA'yı atlatmasın
    delete req.session.pendingTotp;
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/me/2fa/disable',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const a = await myAdmin(req, res);
    if (!a) return;
    if (!a.totpEnabled) return res.status(400).json({ error: '2 adımlı doğrulama zaten kapalı.' });
    if (!core.verifyHashedPassword(req.body.password, a.passwordHash)) return res.status(400).json({ error: 'Şifren yanlış.' });
    let ok = false;
    try {
      ok = totp.verifyTotp(totp.decryptSecret(a.totpSecret), req.body.code);
    } catch {}
    if (!ok) return res.status(400).json({ error: 'Doğrulama kodu yanlış.' });
    await admins.setTotp(a.id, { secretEnc: null, enabled: false });
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/me/password',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const a = await myAdmin(req, res);
    if (!a) return;
    const { currentPassword, newPassword } = req.body;
    if (!core.verifyHashedPassword(currentPassword, a.passwordHash)) return res.status(400).json({ error: 'Mevcut şifren yanlış.' });
    if (!newPassword || String(newPassword).length < 10) return res.status(400).json({ error: 'Yeni şifre en az 10 karakter olmalı.' });
    await admins.updatePassword(a.id, core.hashPassword(String(newPassword)), false);
    await core.rememberTokens.removeAllForSubject('admin', a.id).catch(() => {});
    revoke(a.id); // diğer cihazlardaki oturumlar kapanır
    req.session.adminLoginAt = Date.now() + 1; // bu oturum açık kalır
    res.json({ ok: true });
  })
);
