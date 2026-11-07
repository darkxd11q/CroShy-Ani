// Giriş / kayıt / çıkış.
const { adminGuard, adminLoginLimiter, app, asyncRoute, clearRememberCookie, crypto, hashPassword, isProd, issueRememberCookie, path, registerLimiter, requireSuperAdminApi, resolveNext, safeNext, safeStringEqual, session, syncThemeCookie, userGuard, userLoginLimiter, users, verifyHashedPassword, verifyPassword } = require('../core');
const admins = require('../../admins');
const totp = require('../lib/totp');
const { record: auditRecord } = require('../audit');

// ---------- Kullanıcı girişi / kaydı ----------

app.get('/login', (req, res) => {
  const next = safeNext(req.query.next);
  if (next) {
    res.cookie('croshy_next', next, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 15 * 60 * 1000, path: '/' });
  }
  // Otomatik giriş middleware'i bu isteğe kadar oturumu zaten kurmuş olabilir
  if (req.session && req.session.userId) return res.redirect(next || '/upload');
  res.render('login', { error: null, next: next || '' });
});

app.post(
  '/login',
  userLoginLimiter,
  asyncRoute(async (req, res) => {
    const ip = req.ip;
    const { locked, remainingMs } = userGuard.getLoginStatus(ip);

    if (locked) {
      const minutes = Math.ceil(remainingMs / 60000);
      return res.status(429).render('login', {
        error: `Çok fazla başarısız deneme yapıldı. Lütfen ${minutes} dakika sonra tekrar dene.`,
      });
    }

    const { username, password } = req.body;
    const user = await users.findUserByUsername(username);
    const passwordOk = user ? verifyHashedPassword(password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      userGuard.registerFailedAttempt(ip);
      return res.render('login', { error: 'Kullanıcı adı veya şifre yanlış.' });
    }

    userGuard.resetAttempts(ip);

    req.session.regenerate(async (err) => {
      // Bu callback'in tamamı kasıtlı olarak try/catch ile sarılı — session
      // kütüphanesi bu callback'i "ateşle ve unut" şekilde çağırıyor, yani
      // içeride yakalanmayan bir hata dışarıdaki asyncRoute/middleware
      // zincirine hiç ulaşmıyor ve istek hiç yanıtlanmadan asılı kalabiliyordu.
      try {
        if (err) return res.render('login', { error: 'Bir hata oluştu, tekrar dene.' });
        req.session.userId = user.id;
        req.session.username = user.username;
        // "Beni hatırla" işaretliyse 3 aya kadar (90 gün) hatırlanır.
        if (req.body.remember) {
          issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
        }
        await syncThemeCookie(res, user, req);
        res.redirect(resolveNext(req, res));
      } catch (e) {
        console.error('Giriş sonrası hata:', e.message);
        if (!res.headersSent) res.render('login', { error: 'Bir hata oluştu, tekrar dene.' });
      }
    });
  })
);

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/upload');
  res.render('register', { error: null });
});

app.post(
  '/register',
  registerLimiter,
  asyncRoute(async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    const cleanUsername = (username || '').toString().trim();

    if (cleanUsername.length < 3 || cleanUsername.length > 10) {
      return res.render('register', { error: 'Kullanıcı adı 3-10 karakter arasında olmalı.' });
    }
    if (!/^[a-zA-Z0-9ığüşöçİĞÜŞÖÇ_.\- ]+$/.test(cleanUsername)) {
      return res.render('register', { error: 'Kullanıcı adında geçersiz karakterler var.' });
    }
    if (!password || password.length < 6) {
      return res.render('register', { error: 'Şifre en az 6 karakter olmalı.' });
    }
    if (password !== confirmPassword) {
      return res.render('register', { error: 'Şifreler eşleşmiyor.' });
    }
    if (await users.findUserByUsername(cleanUsername)) {
      return res.render('register', { error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    const user = {
      id: crypto.randomUUID(),
      username: cleanUsername,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };

    try {
      await users.createUser(user);
    } catch (e) {
      if (e.code === 'DUPLICATE_USERNAME') {
        return res.render('register', { error: 'Bu kullanıcı adı zaten alınmış.' });
      }
      throw e;
    }

    req.session.regenerate(async (err) => {
      try {
        if (err) return res.render('register', { error: 'Bir hata oluştu, tekrar dene.' });
        req.session.userId = user.id;
        req.session.username = user.username;
        // "Beni hatırla" işaretliyse 3 aya kadar (90 gün) hatırlanır.
        if (req.body.remember) {
          issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
        }
        await syncThemeCookie(res, user, req);
        res.redirect(resolveNext(req, res));
      } catch (e) {
        console.error('Kayıt sonrası hata:', e.message);
        if (!res.headersSent) res.render('register', { error: 'Bir hata oluştu, tekrar dene.' });
      }
    });
  })
);

app.post(
  '/logout',
  asyncRoute(async (req, res) => {
    await clearRememberCookie(req, res);
    req.session.destroy(() => {
      res.clearCookie('croshy.sid');
      res.clearCookie('croshy_theme', { path: '/' });
      res.redirect('/login');
    });
  })
);

// ---------- Admin ----------

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin-login', { error: null });
});

app.post(
  '/admin/login',
  adminLoginLimiter,
  asyncRoute(async (req, res) => {
    const ip = req.ip;
    const { locked, remainingMs } = adminGuard.getLoginStatus(ip);

    if (locked) {
      const minutes = Math.ceil(remainingMs / 60000);
      return res.status(429).render('admin-login', {
        error: `Çok fazla başarısız deneme yapıldı. Lütfen ${minutes} dakika sonra tekrar dene.`,
      });
    }

    const { username, password } = req.body;
    const totpCode = String(req.body.totp || '').replace(/\s+/g, '');
    const modUsername = process.env.ADMIN_USERNAME || 'admin';
    const modPassword = process.env.ADMIN_PASSWORD || '';
    const superUsername = process.env.SUPERADMIN_USERNAME || 'dxrks91';
    const superPassword = process.env.SUPERADMIN_PASSWORD || '';

    let matchedRole = null;
    let loggedInUsername = null;

    // 1) Kişisel (veritabanı) yönetici hesabı: kendi şifresi + (açıksa) 2 adımlı doğrulama kodu
    let dbAdmin = null;
    try {
      dbAdmin = await admins.findByUsername(username);
    } catch (e) {
      console.error('Yönetici hesabı sorgulanamadı (acil durum hesaplarıyla devam):', e.message);
    }

    if (dbAdmin) {
      if (verifyHashedPassword(password, dbAdmin.passwordHash) && !dbAdmin.disabled) {
        if (dbAdmin.totpEnabled) {
          if (!totpCode) {
            return res.render('admin-login', { error: 'Doğrulama kodu gerekli (2 adımlı doğrulama açık).', needTotp: true, username });
          }
          let secret = null;
          try {
            secret = totp.decryptSecret(dbAdmin.totpSecret);
          } catch {}
          if (!secret || !totp.verifyTotp(secret, totpCode)) {
            adminGuard.registerFailedAttempt(ip);
            auditRecord({ actor: dbAdmin.username, action: 'admin_login_failed', label: 'Hatalı 2FA kodu', details: `IP: ${ip}`, status: 401 });
            return res.render('admin-login', { error: 'Doğrulama kodu yanlış.', needTotp: true, username });
          }
        }
        matchedRole = dbAdmin.role;
        loggedInUsername = dbAdmin.username;
      }
    } else {
      // 2) Acil durum hesapları (.env): hesap kurulana/2FA'ya geçilene kadar çalışır
      if (safeStringEqual(username, modUsername) && verifyPassword(password, modPassword)) {
        matchedRole = 'moderator';
        loggedInUsername = modUsername;
      } else if (safeStringEqual(username, superUsername) && verifyPassword(password, superPassword)) {
        matchedRole = 'superadmin';
        loggedInUsername = superUsername;
      }
    }

    if (!matchedRole) {
      adminGuard.registerFailedAttempt(ip);
      auditRecord({ actor: String(username || '?').slice(0, 40), action: 'admin_login_failed', label: 'Başarısız admin girişi', details: `IP: ${ip}`, status: 401 });
      return res.render('admin-login', { error: 'Kullanıcı adı veya şifre yanlış.', username });
    }

    adminGuard.resetAttempts(ip);
    if (dbAdmin) admins.touchLogin(dbAdmin.id).catch(() => {});

    req.session.regenerate(async (err) => {
      try {
        if (err) return res.render('admin-login', { error: 'Bir hata oluştu, tekrar dene.' });
        req.session.isAdmin = true;
        req.session.adminRole = matchedRole;
        req.session.username = loggedInUsername;
        req.session.adminId = dbAdmin ? dbAdmin.id : null;
        req.session.adminLoginAt = Date.now();
        // 2 adımlı doğrulaması açık hesaplar için "beni hatırla" verilmez (2FA'yı atlatmasın)
        if (req.body.remember && !(dbAdmin && dbAdmin.totpEnabled)) {
          issueRememberCookie(res, {
            subjectType: 'admin',
            subjectId: dbAdmin ? dbAdmin.id : 'admin',
            username: loggedInUsername,
            role: matchedRole,
          });
        }
        auditRecord({ actor: loggedInUsername, role: matchedRole, action: 'admin_login', label: 'Admin girişi', status: 200 });
        res.redirect('/admin');
      } catch (e) {
        console.error('Admin girişi sonrası hata:', e.message);
        if (!res.headersSent) res.render('admin-login', { error: 'Bir hata oluştu, tekrar dene.' });
      }
    });
  })
);

app.post(
  '/admin/logout',
  asyncRoute(async (req, res) => {
    await clearRememberCookie(req, res);
    req.session.destroy(() => {
      res.clearCookie('croshy.sid');
      res.redirect('/admin/login');
    });
  })
);

// Herhangi bir sayfa yükünde çağrılıp "otomatik giriş yapıldı" bilgisini
// bir kereliğine döndüren, herkese açık uç nokta (giriş şart değil).
app.get('/api/session-status', (req, res) => {
  const justAuto = !!(req.session && req.session.justAutoLoggedIn);
  if (req.session && justAuto) req.session.justAutoLoggedIn = false;
  res.json({
    loggedIn: !!(req.session && (req.session.userId || req.session.isAdmin)),
    isAdmin: !!(req.session && req.session.isAdmin),
    username: (req.session && req.session.username) || null,
    justAutoLoggedIn: justAuto,
  });
});

// Giriş/kayıt kartının HTML parçası — ana sayfadaki pencere de, /login ve
// /register sayfaları da AYNI kartı kullanır (tek tasarım).
app.get('/auth-card', (req, res) => {
  const tab = req.query.tab === 'register' ? 'register' : 'login';
  res.render('partials/auth-card', { tab, error: null, next: safeNext(req.query.next) || '' });
});


// "Giriş Yap"a basılınca önce sessizce denenir: "beni hatırla" çerezi 3 aydan eskiyse/yoksa
// false döner (pencere açılır), geçerliyse oturum zaten otomatik açılmıştır (ara katman yapar).
app.post(
  '/api/quick-login',
  asyncRoute(async (req, res) => {
    const loggedIn = !!(req.session && (req.session.userId || req.session.isAdmin));
    res.json({ ok: loggedIn, isAdmin: !!(req.session && req.session.isAdmin), username: (req.session && req.session.username) || null });
  })
);
