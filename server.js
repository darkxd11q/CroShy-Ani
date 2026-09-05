require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const db = require('./db');
const users = require('./users');
const bans = require('./bans');
const logs = require('./logs');
const likes = require('./likes');
const viewsStore = require('./views_store');
const rememberTokens = require('./rememberTokens');
const {
  safeStringEqual,
  verifyPassword,
  hashPassword,
  verifyHashedPassword,
  createLoginGuard,
  createRateLimiter,
} = require('./auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const DAILY_SUBMIT_LIMIT = 2;
const MAX_IMAGE_BYTES = 8.5 * 1024 * 1024; // 8.5 MB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MB
const MAX_VIDEO_DURATION_SEC = 150; // 2 dakika 30 saniye

// "trust proxy" SADECE üretimde (Render'ın tek katmanlı ters proxy'si arkasında)
// açık olmalı. Yerelde (npm start ile doğrudan çalıştırırken) bunu açık
// bırakmak, herkesin sahte bir X-Forwarded-For başlığıyla IP'sini
// değiştirebilmesine (spoof) izin verir — bu da admin panelindeki IP
// adreslerinin yanlış/güvenilmez görünmesine yol açan asıl sebepti.
// NODE_ENV=production Render'da otomatik ayarlanır.
app.set('trust proxy', isProd ? 1 : false);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
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

// ---------- "Beni hatırla" / otomatik giriş ----------
// Oturum çerezi (üstteki) kasıtlı olarak kısa ömürlü (8 saat) — güvenlik
// için. Ama kullanıcı bir kere giriş yaptıktan sonra tarayıcıyı kapatıp
// tekrar açtığında yeniden şifre girmesin diye, AYRI ve çok daha uzun ömürlü
// (90 gün) bir "hatırlama" çerezi + Supabase'de tuttuğumuz hash'lenmiş bir
// token kullanıyoruz. Oturum süresi dolduğunda ama hatırlama çerezi hâlâ
// geçerliyse, aşağıdaki middleware sessizce yeni bir oturum açar.
const REMEMBER_COOKIE = 'croshy_remember';
const REMEMBER_MS = 90 * 24 * 60 * 60 * 1000; // 90 gün

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

async function issueRememberCookie(res, { subjectType, subjectId, username }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  await rememberTokens.create({
    tokenHash,
    subjectType,
    subjectId,
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + REMEMBER_MS,
  });
  res.cookie(REMEMBER_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: REMEMBER_MS,
    path: '/',
  });
}

async function clearRememberCookie(req, res) {
  const raw = getCookie(req, REMEMBER_COOKIE);
  if (raw) {
    try {
      await rememberTokens.remove(sha256(raw));
    } catch (e) {
      console.error('remember token silme hatası:', e.message);
    }
  }
  res.clearCookie(REMEMBER_COOKIE, { path: '/' });
}

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
      if (err) return next();

      if (record.subjectType === 'admin') {
        req.session.isAdmin = true;
      } else {
        req.session.userId = record.subjectId;
      }
      req.session.username = record.username;
      req.session.justAutoLoggedIn = true;

      try {
        await issueRememberCookie(res, {
          subjectType: record.subjectType,
          subjectId: record.subjectId,
          username: record.username,
        });
      } catch (e) {
        console.error('remember token yenileme hatası:', e.message);
      }
      next();
    });
  } catch (e) {
    console.error('Otomatik giriş kontrolü hatası:', e.message);
    next();
  }
});

// Her giriş/kayıt formu kendi bağımsız brute-force sayaçlarını kullanır
const adminGuard = createLoginGuard();
const userGuard = createLoginGuard();

const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar dene.',
});
const userLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar dene.',
});
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Çok fazla kayıt denemesi yapıldı. Lütfen daha sonra tekrar dene.',
});

// Async route handler'larda try/catch tekrarını önlemek için küçük bir sarmalayıcı.
// Bir Supabase isteği patlarsa 500 + JSON hata döner (HTML hata sayfası değil,
// aksi halde fetch() tarafında yine "Unexpected token '<'" hatasına düşülür).
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error('Sunucu hatası:', err);
      if (res.headersSent) return next(err);
      const wantsJson = req.path.startsWith('/api/');
      if (wantsJson) {
        res.status(500).json({ error: 'Sunucuda beklenmeyen bir hata oluştu.' });
      } else {
        res.status(500).send('Sunucuda beklenmeyen bir hata oluştu.');
      }
    });
  };
}

// ---------- Yardımcı middleware'ler ----------

function requireAdminPage(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// API/fetch istekleri için: oturum yoksa HTML login sayfasına yönlendirmek yerine
// JSON 401 döner. Aksi halde fetch(), redirect'i takip edip HTML sayfası alır ve
// res.json() "Unexpected token '<'" hatasıyla patlar — asıl hatanın kaynağı buydu.
function requireAdminApi(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Oturumun sona ermiş. Lütfen tekrar giriş yap.', loginRequired: true });
}

function requireUserPage(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/login');
}

function requireUserApi(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Bu işlem için giriş yapmalısın.', loginRequired: true });
}

// ---------- Herkese açık API ----------

app.get('/api/config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    maxImageBytes: MAX_IMAGE_BYTES,
    maxVideoBytes: MAX_VIDEO_BYTES,
    maxVideoDurationSec: MAX_VIDEO_DURATION_SEC,
  });
});

app.get(
  '/api/approved',
  asyncRoute(async (req, res) => {
    const ip = req.ip;
    const [items, likeCounts, likedByMe] = await Promise.all([
      db.getApprovedItems(),
      likes.getAllCounts(),
      likes.getLikedSetForIp(ip),
    ]);

    const validSorts = ['oldest', 'likes', 'newest', 'algorithm'];
    const sort = validSorts.includes(req.query.sort) ? req.query.sort : 'algorithm';

    let approved = items.map(({ ip: _ip, ...rest }) => ({
      ...rest,
      likes: likeCounts[rest.id] || 0,
      likedByMe: likedByMe.has(rest.id),
    }));

    if (sort === 'oldest') {
      approved.sort((a, b) => a.createdAt - b.createdAt);
    } else if (sort === 'likes') {
      approved.sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
    } else if (sort === 'newest') {
      approved.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      // "Önerilen" akışı: önce hiç görmediğin anılar (aralarında en çok
      // beğenilen önde), görmediğin kalmadıysa gördüklerinden en yeni olan.
      const seen = await viewsStore.getSeenSetForIp(ip);
      const unseen = approved.filter((i) => !seen.has(i.id));
      const alreadySeen = approved.filter((i) => seen.has(i.id));

      unseen.sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
      alreadySeen.sort((a, b) => b.createdAt - a.createdAt);

      approved = [...unseen, ...alreadySeen];
    }

    // Bu istekle dönen anılar artık bu IP için "görüldü" sayılır — bir sonraki
    // ziyarette akış yeni/görülmemiş anılara öncelik verebilsin diye.
    viewsStore.markSeen(approved.map((i) => i.id), ip).catch((e) => {
      console.error('markSeen hatası:', e.message);
    });

    res.json(approved);
  })
);

// Bir anıyı beğen / beğeniyi geri al (herkese açık, IP başına 1 beğeni)
app.post(
  '/api/like/:id',
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item || item.status !== 'approved') return res.status(404).json({ error: 'Bulunamadı.' });

    const result = await likes.toggleLike(item.id, req.ip);
    res.json(result);
  })
);

// Giriş yapmış kullanıcının kendi bilgisi + günlük kalan hakkı
app.get(
  '/api/me',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const [used, user] = await Promise.all([logs.countToday(req.ip), users.findUserById(req.session.userId)]);
    res.json({
      username: req.session.username,
      dailyLimit: DAILY_SUBMIT_LIMIT,
      usedToday: used,
      remainingToday: Math.max(0, DAILY_SUBMIT_LIMIT - used),
      sizeLimitExempt: !!(user && user.sizeLimitExempt),
      maxImageBytes: MAX_IMAGE_BYTES,
      maxVideoBytes: MAX_VIDEO_BYTES,
    });
  })
);

app.post(
  '/api/submit',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const ip = req.ip;

    if (await bans.isBanned(ip)) {
      return res.status(403).json({ error: 'Bu IP adresinin anı gönderme yetkisi kaldırılmış.' });
    }

    const usedToday = await logs.countToday(ip);
    if (usedToday >= DAILY_SUBMIT_LIMIT) {
      return res.status(429).json({
        error: `Bugün için gönderme hakkını doldurdun (günde en fazla ${DAILY_SUBMIT_LIMIT} anı). Yarın tekrar deneyebilirsin.`,
      });
    }

    const { url, publicId, type, caption, bytes, durationSec } = req.body;
    const cleanCaption = (caption || '').toString().trim();

    if (!url || !publicId || !type) {
      return res.status(400).json({ error: 'Eksik veri gönderildi.' });
    }
    if (type !== 'image' && type !== 'video') {
      return res.status(400).json({ error: 'Geçersiz medya türü.' });
    }
    if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) {
      return res.status(400).json({ error: 'Geçersiz medya kaynağı.' });
    }
    if (!cleanCaption) {
      // Boş açıklamayla gönderilen medyayı (client atlatılmış olsa bile)
      // Cloudinary'den de sil, öylece Supabase dışında yetim kalmasın.
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: type });
      } catch (e) {
        console.error('Cloudinary silme hatası (açıklama yok):', e.message);
      }
      return res.status(400).json({ error: 'Açıklama yazman zorunlu.' });
    }

    // Dosya boyutu sınırı — admin panelinden muaf tutulan kullanıcılar hariç.
    // "bytes" Cloudinary'nin yükleme sonrası döndürdüğü gerçek dosya boyutudur;
    // client tarafındaki sıkıştırma/kontroller atlatılsa bile burada yakalanır.
    const uploader = await users.findUserById(req.session.userId);
    const isExempt = !!(uploader && uploader.sizeLimitExempt);
    const sizeLimit = type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (!isExempt && typeof bytes === 'number' && bytes > sizeLimit) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: type });
      } catch (e) {
        console.error('Cloudinary silme hatası (boyut aşımı):', e.message);
      }
      const limitMb = (sizeLimit / (1024 * 1024)).toFixed(1);
      return res.status(413).json({
        error: `Dosya çok büyük. ${type === 'video' ? 'Videolar' : 'Fotoğraflar'} en fazla ${limitMb}MB olabilir.`,
      });
    }

    // Video süresi sınırı — 2:30 (client tarafında kırpma denenir, ama
    // Cloudinary'nin döndürdüğü gerçek süre burada son kez doğrulanır).
    if (!isExempt && type === 'video' && typeof durationSec === 'number' && durationSec > MAX_VIDEO_DURATION_SEC + 2) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      } catch (e) {
        console.error('Cloudinary silme hatası (süre aşımı):', e.message);
      }
      return res.status(413).json({
        error: `Video çok uzun (${Math.round(durationSec)} sn). Videolar en fazla 2 dakika 30 saniye olabilir.`,
      });
    }

    const item = {
      id: crypto.randomUUID(),
      url,
      publicId,
      type,
      // İsim her zaman oturum açmış kullanıcıdan alınır, client'tan gelen
      // herhangi bir isim asla güvenilmez / kullanılmaz.
      uploaderName: req.session.username,
      userId: req.session.userId,
      ip,
      caption: cleanCaption.slice(0, 200),
      status: 'pending',
      createdAt: Date.now(),
    };
    await db.insertItem(item);
    await logs.recordSubmission(ip);

    res.json({ ok: true, item: { ...item, ip: undefined } });
  })
);

// ---------- Kullanıcı girişi / kaydı ----------

app.get('/login', (req, res) => {
  // Otomatik giriş middleware'i bu isteğe kadar oturumu zaten kurmuş olabilir
  if (req.session && req.session.userId) return res.redirect('/upload');
  res.render('login', { error: null });
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
      if (err) return res.render('login', { error: 'Bir hata oluştu, tekrar dene.' });
      req.session.userId = user.id;
      req.session.username = user.username;
      try {
        await issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
      } catch (e) {
        console.error('remember token oluşturma hatası:', e.message);
      }
      res.redirect('/upload');
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
      if (err) return res.render('register', { error: 'Bir hata oluştu, tekrar dene.' });
      req.session.userId = user.id;
      req.session.username = user.username;
      try {
        await issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
      } catch (e) {
        console.error('remember token oluşturma hatası:', e.message);
      }
      res.redirect('/upload');
    });
  })
);

app.post(
  '/logout',
  asyncRoute(async (req, res) => {
    await clearRememberCookie(req, res);
    req.session.destroy(() => {
      res.clearCookie('croshy.sid');
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
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || '';

    const usernameOk = safeStringEqual(username, expectedUsername);
    const passwordOk = verifyPassword(password, expectedPassword);

    if (!usernameOk || !passwordOk) {
      adminGuard.registerFailedAttempt(ip);
      return res.render('admin-login', { error: 'Kullanıcı adı veya şifre yanlış.' });
    }

    adminGuard.resetAttempts(ip);

    req.session.regenerate(async (err) => {
      if (err) return res.render('admin-login', { error: 'Bir hata oluştu, tekrar dene.' });
      req.session.isAdmin = true;
      req.session.username = expectedUsername;
      try {
        await issueRememberCookie(res, { subjectType: 'admin', subjectId: 'admin', username: expectedUsername });
      } catch (e) {
        console.error('remember token oluşturma hatası:', e.message);
      }
      res.redirect('/admin');
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

app.get(
  '/admin',
  requireAdminPage,
  asyncRoute(async (req, res) => {
    const [pending, approvedCount, banList, exemptUsers] = await Promise.all([
      db.getPendingItems(),
      db.getApprovedCount(),
      bans.listBans(),
      users.listExemptUsers(),
    ]);

    res.render('admin', {
      pending,
      approvedCount,
      username: req.session.username || 'admin',
      bans: banList,
      exemptUsers,
    });
  })
);

// Bir kullanıcının dosya boyutu sınırını admin panelinden kaldır / geri getir
app.post(
  '/api/admin/exempt',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    }
    const user = await users.setSizeLimitExempt(username.trim(), true);
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username });
  })
);

app.post(
  '/api/admin/unexempt',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
    }
    const user = await users.setSizeLimitExempt(username.trim(), false);
    if (!user) return res.status(404).json({ error: 'Bu kullanıcı adında bir hesap bulunamadı.' });
    res.json({ ok: true, username: user.username });
  })
);

app.post(
  '/api/admin/approve/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Bulunamadı.' });
    await db.approveItem(req.params.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/reject/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Bulunamadı.' });

    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.type === 'video' ? 'video' : 'image',
      });
    } catch (e) {
      console.error('Cloudinary silme hatası:', e.message);
    }

    await db.deleteItem(item.id);
    await likes.removeAllForItem(item.id);
    res.json({ ok: true });
  })
);

// Bir öğeyi reddedip gönderen IP'yi yasaklar; aynı IP'den bekleyen diğer
// tüm gönderiler de temizlenir.
app.post(
  '/api/admin/ban/:id',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const target = await db.getItemById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Bulunamadı.' });

    const ip = target.ip;
    if (!ip) return res.status(400).json({ error: 'Bu kayıt için IP bilgisi yok.' });

    await bans.banIp(ip, { username: target.uploaderName, reason: `Reddedilen anı: ${target.id}` });

    const toRemove = await db.getPendingItemsByIp(ip);
    for (const item of toRemove) {
      try {
        await cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.type === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.error('Cloudinary silme hatası:', e.message);
      }
      await db.deleteItem(item.id);
    }

    res.json({ ok: true, removedCount: toRemove.length });
  })
);

app.post(
  '/api/admin/unban',
  requireAdminApi,
  asyncRoute(async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP belirtilmedi.' });
    await bans.unbanIp(ip);
    res.json({ ok: true });
  })
);

// ---------- Sayfalar ----------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/upload', requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected', 'upload.html'));
});

// 404 - her zaman en sonda
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ CroShy Anı http://localhost:${PORT} adresinde çalışıyor`);
});
