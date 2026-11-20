// Kurtarma kodları: kayıtta/profilden kodları gösterme + "Şifremi unuttum" (e-postasız).
const core = require('../core');
const { app, asyncRoute, requireUserPage, users, hashPassword, verifyHashedPassword, rememberTokens, createLoginGuard, createRateLimiter, buildOwnProfileData } = core;
const recovery = require('../../recovery');
const { notify } = require('../notify');

const forgotLimiter = createRateLimiter({ name: 'forgotLimiter', windowMs: 60 * 60 * 1000, max: 30, message: 'Çok fazla deneme yaptın. Lütfen daha sonra tekrar dene.' });
const forgotIpGuard = createLoginGuard({ name: 'forgotIp', maxAttempts: 8, windowMs: 30 * 60 * 1000, lockMs: 30 * 60 * 1000 });
const forgotUserGuard = createLoginGuard({ name: 'forgotUser', maxAttempts: 5, windowMs: 30 * 60 * 1000, lockMs: 30 * 60 * 1000 });

// ---------- Şifremi unuttum ----------
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { error: null, success: null, username: '' });
});

app.post(
  '/forgot-password',
  forgotLimiter,
  asyncRoute(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const { code, newPassword, confirmPassword } = req.body;
    const view = (extra) => res.render('forgot-password', { error: null, success: null, username, ...extra });

    if (!username || !code) return view({ error: 'Kullanıcı adı ve kurtarma kodu gerekli.' });
    if (!newPassword || String(newPassword).length < 6) return view({ error: 'Yeni şifre en az 6 karakter olmalı.' });
    if (newPassword !== confirmPassword) return view({ error: 'Yeni şifreler eşleşmiyor.' });

    const userKey = username.toLowerCase();
    const ipLock = forgotIpGuard.getLoginStatus(req.ip);
    const userLock = forgotUserGuard.getLoginStatus(userKey);
    if (ipLock.locked || userLock.locked) {
      const mins = Math.ceil(Math.max(ipLock.remainingMs, userLock.remainingMs) / 60000);
      return res.status(429).render('forgot-password', { error: `Çok fazla hatalı deneme. ${mins} dakika sonra tekrar dene.`, success: null, username });
    }

    const user = await users.findUserByUsername(username);
    let ok = false;
    if (user) ok = await recovery.consume(user.id, code);
    else await recovery.dummyWork(); // kullanıcı adının var olup olmadığı zamanlamadan anlaşılmasın

    if (!ok) {
      forgotIpGuard.registerFailedAttempt(req.ip);
      forgotUserGuard.registerFailedAttempt(userKey);
      return view({ error: 'Kullanıcı adı veya kurtarma kodu yanlış (ya da kod daha önce kullanılmış).' });
    }

    await users.updatePasswordHash(user.id, hashPassword(String(newPassword)));
    await rememberTokens.removeAllForSubject('user', user.id).catch(() => {});
    forgotIpGuard.resetAttempts(req.ip);
    forgotUserGuard.resetAttempts(userKey);

    const left = await recovery.countUnused(user.id).catch(() => null);
    notify(user.id, {
      type: 'system',
      text: 'Şifren bir kurtarma koduyla sıfırlandı. Bu sen değilsen hemen şifreni değiştir ve kurtarma kodlarını yenile.',
      link: '/profile#acc-hesap',
    });
    view({
      success: `Şifren güncellendi. Artık giriş yapabilirsin.${left === 0 ? ' Kurtarma kodların bitti — giriş yapınca profilinden yenilerini oluştur.' : ''}`,
    });
  })
);

// ---------- Kodları gösterme (yalnızca BİR kez) ----------
app.get('/recovery-codes', requireUserPage, (req, res) => {
  const codes = req.session.recoveryCodes;
  if (!codes || !codes.length) return res.redirect('/profile#acc-hesap');
  const nextUrl = req.session.recoveryNext || '/';
  delete req.session.recoveryCodes; // sayfa yenilenirse kodlar bir daha gösterilmez
  delete req.session.recoveryNext;
  res.render('recovery-codes', { codes, nextUrl });
});

// ---------- Yeni kod seti oluştur (şifre ister; eskiler geçersiz olur) ----------
app.post(
  '/profile/recovery-codes/regenerate',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const user = await users.findUserById(req.session.userId);
    if (!user) return res.redirect('/');
    if (!verifyHashedPassword(req.body.password, user.passwordHash)) {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, error: 'Şifren yanlış.' });
    }
    req.session.recoveryCodes = await recovery.createSet(user.id);
    req.session.recoveryNext = '/profile#acc-hesap';
    res.redirect('/recovery-codes');
  })
);
