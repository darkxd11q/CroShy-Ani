// Ara katmanlar: güvenlik başlıkları, oturum, otomatik giriş, tema/oturum koruması.
const { REMEMBER_COOKIE, REWARD_THEMES, ROOT, STATIC_EXT, allowedThemesFor, app, awards, deletedUserIds, express, getCookie, helmet, isProd, issueRememberCookie, path, rememberTokens, renamedUsers, session, setThemeCookie, sha256, users } = require('./core');
const { sessionStore } = require('./sessionStore');

// "trust proxy" SADECE üretimde (Render'ın tek katmanlı ters proxy'si arkasında)
// açık olmalı. Yerelde (npm start ile doğrudan çalıştırırken) bunu açık
// bırakmak, herkesin sahte bir X-Forwarded-For başlığıyla IP'sini
// değiştirebilmesine (spoof) izin verir — bu da admin panelindeki IP
// adreslerinin yanlış/güvenilmez görünmesine yol açan asıl sebepti.
// NODE_ENV=production Render'da otomatik ayarlanır.
app.set('trust proxy', isProd ? 1 : false);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// index:false -> "/" statik dosya olarak değil, route üzerinden sunulur; böylece ana sayfa
// da oturum/tema kontrolünden geçer.
app.use(express.static(path.join(ROOT, 'public'), { index: false }));

app.use(
  session({
    store: sessionStore, // kalıcı (Supabase) oturum deposu
    name: 'croshy.sid',
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 8, // 8 saat
    },
  })
);
app.use((req, res, next) => {
  const uid = req.session && req.session.userId;
  if (uid && deletedUserIds.has(uid)) {
    return req.session.destroy(() => {
      res.clearCookie('croshy.sid');
      res.clearCookie('croshy_remember', { path: '/' });
      next();
    });
  }
  if (uid && renamedUsers.has(uid)) req.session.username = renamedUsers.get(uid);
  next();
});

// Her istekte: aktif bir oturum yoksa ama geçerli bir "hatırlama" çerezi
// varsa, sessizce oturumu yeniden kur. Token tek kullanımlıktır (kullanılınca
// hemen yenisiyle değiştirilir) — biri bu çerezi çalarsa eski token zaten
// geçersizleşmiş olur ve kullanıcı bir sonraki ziyaretinde fark edebilir.
app.use(async (req, res, next) => {
  if (req.session && (req.session.userId || req.session.isAdmin)) return next();

  const raw = getCookie(req, REMEMBER_COOKIE);
  if (!raw) return next();

  try {
    const record = await rememberTokens.findValid(sha256(raw));
    if (!record) {
      res.clearCookie(REMEMBER_COOKIE, { path: '/' });
      return next();
    }

    await rememberTokens.remove(record.tokenHash);

    req.session.regenerate(async (err) => {
      try {
        if (err) return next();

        if (record.subjectType === 'admin') {
          req.session.isAdmin = true;
          req.session.adminRole = record.role || 'superadmin';
        } else {
          req.session.userId = record.subjectId;
        }
        req.session.username = record.username;
        req.session.justAutoLoggedIn = true;

        issueRememberCookie(res, {
          subjectType: record.subjectType,
          subjectId: record.subjectId,
          username: record.username,
          role: record.role,
        });
        next();
      } catch (e) {
        console.error('Otomatik giriş kurulum hatası:', e.message);
        next();
      }
    });
  } catch (e) {
    console.error('Otomatik giriş kontrolü hatası:', e.message);
    next();
  }
});
app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || STATIC_EXT.test(req.path)) return next();

    const s = req.session;
    const uid = s && s.userId;
    let theme = null;
    if (uid) {
      // Rozet/ödül değişikliklerini (örn. ödül teması bitti) yakalamak için 10 dakikada bir tazele
      if (Date.now() - (s.themeCheckedAt || 0) > 10 * 60 * 1000) {
        const user = await users.findUserById(uid);
        const rewardExpiry = user && REWARD_THEMES.includes(user.theme) ? await awards.getRewardExpiry(uid) : 0;
        theme = user && user.theme && allowedThemesFor(user, rewardExpiry).includes(user.theme) ? user.theme : null;
        s.theme = theme;
        s.themeRewardExpiry = rewardExpiry;
        s.themeCheckedAt = Date.now();
      } else {
        theme = s.theme || null;
      }
    }

    const cookieTheme = getCookie(req, 'croshy_theme') || null;
    if (cookieTheme !== theme) {
      if (theme) setThemeCookie(res, theme, (s && s.themeRewardExpiry) || 0);
      else res.clearCookie('croshy_theme', { path: '/' });
    }
  } catch (e) {
    // tema yüzünden sayfa asla bozulmasın
  }
  next();
});
