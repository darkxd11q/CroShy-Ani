// Giriş / kayıt / çıkış.
const { adminGuard, adminLoginLimiter, app, asyncRoute, clearRememberCookie, crypto, hashPassword, isProd, issueRememberCookie, path, registerLimiter, requireSuperAdminApi, resolveNext, safeNext, safeStringEqual, session, syncThemeCookie, userGuard, userLoginLimiter, users, verifyHashedPassword, verifyPassword } = require('../core');

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
    const modUsername = process.env.ADMIN_USERNAME || 'admin';
    const modPassword = process.env.ADMIN_PASSWORD || '';
    const superUsername = process.env.SUPERADMIN_USERNAME || 'dxrks91';
    const superPassword = process.env.SUPERADMIN_PASSWORD || '';

    // İki farklı admin hesabından hangisiyle eşleştiğini bul. Önce kullanıcı
    // adına bakılır (moderatör hesabıyla aynı isim/şifre kalıyor, sadece
    // yetkileri kısıtlı — bkz. requireSuperAdminApi ve admin.ejs).
    let matchedRole = null;
    if (safeStringEqual(username, modUsername) && verifyPassword(password, modPassword)) {
      matchedRole = 'moderator';
    } else if (safeStringEqual(username, superUsername) && verifyPassword(password, superPassword)) {
      matchedRole = 'superadmin';
    }

    if (!matchedRole) {
      adminGuard.registerFailedAttempt(ip);
      return res.render('admin-login', { error: 'Kullanıcı adı veya şifre yanlış.' });
    }

    adminGuard.resetAttempts(ip);
    const loggedInUsername = matchedRole === 'moderator' ? modUsername : superUsername;

    req.session.regenerate(async (err) => {
      try {
        if (err) return res.render('admin-login', { error: 'Bir hata oluştu, tekrar dene.' });
        req.session.isAdmin = true;
        req.session.adminRole = matchedRole;
        req.session.username = loggedInUsername;
        if (req.body.remember) {
          issueRememberCookie(res, {
            subjectType: 'admin',
            subjectId: 'admin',
            username: loggedInUsername,
            role: matchedRole,
          });
        }
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
