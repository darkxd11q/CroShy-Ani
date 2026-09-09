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
const settings = require('./settings');
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
// NOT: Sabit limit değerleri kaldırıldı — artık hepsi admin panelinden
// değiştirilebilen "app_settings" tablosunda (bkz. settings.js) ve
// kullanıcıya özel override'lar "app_users" tablosunda tutuluyor.
// Supabase'e ulaşılamazsa (yapılandırılmamışsa) diye makul varsayılanlar:
const FALLBACK_SETTINGS = settings.DEFAULTS;

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

function formatDuration(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} dakika` : `${m}:${String(r).padStart(2, '0')}`;
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

async function issueRememberCookie(res, { subjectType, subjectId, username, role }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  await rememberTokens.create({
    tokenHash,
    subjectType,
    subjectId,
    username,
    role: role || null,
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

        try {
          await issueRememberCookie(res, {
            subjectType: record.subjectType,
            subjectId: record.subjectId,
            username: record.username,
            role: record.role,
          });
        } catch (e) {
          console.error('remember token yenileme hatası:', e.message);
        }
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

async function getSettingsSafe() {
  try {
    return await settings.getSettings();
  } catch (e) {
    console.error('Ayarlar okunamadı, varsayılanlar kullanılıyor:', e.message);
    return FALLBACK_SETTINGS;
  }
}

// Bir kullanıcı için geçerli olan (kişiye özelse onu, yoksa genel ayarı
// kullanan) fiili sınırları hesaplar.
function effectiveLimitsFor(user, globalSettings) {
  return {
    imageBytes: (user && user.customImageBytes) || globalSettings.maxImageBytes,
    videoBytes: (user && user.customVideoBytes) || globalSettings.maxVideoBytes,
    videoDurationSec: (user && user.customVideoDurationSec) || globalSettings.maxVideoDurationSec,
    dailyLimit: globalSettings.dailySubmitLimit,
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

// Sadece tam yetkili admin ("superadmin") kullanabilir — moderatör hesabı
// onay/red/IP-yasaklama dışındaki hiçbir işlemi (ayarlar, kullanıcı
// limitleri, yasağı kaldırma) yapamaz.
function requireSuperAdminApi(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.adminRole === 'superadmin') return next();
  if (req.session && req.session.isAdmin) {
    return res.status(403).json({ error: 'Bu işlem için yetkin yok.' });
  }
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

app.get(
  '/api/config',
  asyncRoute(async (req, res) => {
    const s = await getSettingsSafe();
    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
      maxImageBytes: s.maxImageBytes,
      maxVideoBytes: s.maxVideoBytes,
      maxVideoDurationSec: s.maxVideoDurationSec,
    });
  })
);

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

// Giriş yapmış kullanıcının kendi bilgisi + günlük kalan hakkı + fiili sınırları
app.get(
  '/api/me',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const [used, user, globalSettings] = await Promise.all([
      logs.countToday(req.ip),
      users.findUserById(req.session.userId),
      getSettingsSafe(),
    ]);
    const limits = effectiveLimitsFor(user, globalSettings);
    res.json({
      username: req.session.username,
      dailyLimit: limits.dailyLimit,
      usedToday: used,
      remainingToday: Math.max(0, limits.dailyLimit - used),
      maxImageBytes: limits.imageBytes,
      maxVideoBytes: limits.videoBytes,
      maxVideoDurationSec: limits.videoDurationSec,
      hasCustomLimits: !!(
        user &&
        (user.customImageBytes || user.customVideoBytes || user.customVideoDurationSec)
      ),
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

    const [uploader, globalSettings] = await Promise.all([
      users.findUserById(req.session.userId),
      getSettingsSafe(),
    ]);
    const limits = effectiveLimitsFor(uploader, globalSettings);

    const usedToday = await logs.countToday(ip);
    if (usedToday >= limits.dailyLimit) {
      return res.status(429).json({
        error: `Bugün için gönderme hakkını doldurdun (günde en fazla ${limits.dailyLimit} anı). Yarın tekrar deneyebilirsin.`,
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

    // Dosya boyutu sınırı — kullanıcıya özel bir değer varsa o, yoksa genel
    // ayar geçerlidir. "bytes" Cloudinary'nin yükleme sonrası döndürdüğü
    // gerçek dosya boyutudur; client tarafındaki sıkıştırma/kontroller
    // atlatılsa bile burada yakalanır.
    const sizeLimit = type === 'video' ? limits.videoBytes : limits.imageBytes;

    if (typeof bytes === 'number' && bytes > sizeLimit) {
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

    // Video süresi sınırı — kullanıcıya özel bir değer varsa o, yoksa genel
    // ayar geçerlidir. Client tarafında kırpma denenir, ama Cloudinary'nin
    // döndürdüğü gerçek süre burada son kez doğrulanır.
    if (type === 'video' && typeof durationSec === 'number' && durationSec > limits.videoDurationSec + 2) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      } catch (e) {
        console.error('Cloudinary silme hatası (süre aşımı):', e.message);
      }
      const limitLabel = formatDuration(limits.videoDurationSec);
      return res.status(413).json({
        error: `Video çok uzun (${Math.round(durationSec)} sn). Videolar en fazla ${limitLabel} olabilir.`,
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
      // Bu callback'in tamamı kasıtlı olarak try/catch ile sarılı — session
      // kütüphanesi bu callback'i "ateşle ve unut" şekilde çağırıyor, yani
      // içeride yakalanmayan bir hata dışarıdaki asyncRoute/middleware
      // zincirine hiç ulaşmıyor ve istek hiç yanıtlanmadan asılı kalabiliyordu.
      try {
        if (err) return res.render('login', { error: 'Bir hata oluştu, tekrar dene.' });
        req.session.userId = user.id;
        req.session.username = user.username;
        try {
          await issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
        } catch (e) {
          console.error('remember token oluşturma hatası:', e.message);
        }
        res.redirect('/upload');
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
        try {
          await issueRememberCookie(res, { subjectType: 'user', subjectId: user.id, username: user.username });
        } catch (e) {
          console.error('remember token oluşturma hatası:', e.message);
        }
        res.redirect('/upload');
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
        try {
          await issueRememberCookie(res, {
            subjectType: 'admin',
            subjectId: 'admin',
            username: loggedInUsername,
            role: matchedRole,
          });
        } catch (e) {
          console.error('remember token oluşturma hatası:', e.message);
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

app.get(
  '/admin',
  requireAdminPage,
  asyncRoute(async (req, res) => {
    const isSuperAdmin = req.session.adminRole === 'superadmin';

    // Moderatör hesabı için IP listesi/genel ayarlar/kullanıcı limitleri hiç
    // çekilmiyor bile — hem gereksiz Supabase isteği yapılmasın hem de bu
    // veriler yanlışlıkla template'e sızmasın diye.
    const [pending, approvedCount, banList, customLimitUsers, globalSettings] = await Promise.all([
      db.getPendingItems(),
      db.getApprovedCount(),
      isSuperAdmin ? bans.listBans() : Promise.resolve([]),
      isSuperAdmin ? users.listUsersWithCustomLimits() : Promise.resolve([]),
      isSuperAdmin ? getSettingsSafe() : Promise.resolve(FALLBACK_SETTINGS),
    ]);

    res.render('admin', {
      pending,
      approvedCount,
      username: req.session.username || 'admin',
      adminRole: req.session.adminRole || 'superadmin',
      bans: banList,
      customLimitUsers,
      settings: globalSettings,
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

// Onaylama, reddetme ve IP yasaklama — hem moderatör hem tam yetkili admin
// kullanabilir.
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
// tüm gönderiler de temizlenir. Moderatör bu işlemi yapabilir AMA gerçek
// IP adresini asla response'da görmez — sadece işlem sonucu (ok/removedCount)
// döner, ip alanı bilerek dahil edilmez.
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

// ---------- Sayfalar ----------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/upload', requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected', 'upload.html'));
});

// Bir kullanıcının profil sayfası için gereken tüm veriyi tek yerden toplar
// (kendi profili — pending dahil tüm anıları + limitleri + bio görür).
async function buildOwnProfileData(userId, username) {
  const [user, myItems, globalSettings] = await Promise.all([
    users.findUserById(userId),
    db.getItemsByUserId(userId),
    getSettingsSafe(),
  ]);

  const approvedItems = myItems.filter((i) => i.status === 'approved');
  const pendingCount = myItems.filter((i) => i.status === 'pending').length;
  const totalLikes = await likes.countLikesForItemIds(approvedItems.map((i) => i.id));
  const likeCounts = await likes.getAllCounts();
  const limits = effectiveLimitsFor(user, globalSettings);

  const items = myItems.map((i) => ({ ...i, likes: likeCounts[i.id] || 0 }));

  return {
    username,
    bio: user ? user.bio : '',
    createdAt: user ? user.createdAt : null,
    totalCount: myItems.length,
    approvedCount: approvedItems.length,
    pendingCount,
    totalLikes,
    items,
    limits,
    hasCustomLimits: !!(user && (user.customImageBytes || user.customVideoBytes || user.customVideoDurationSec)),
    error: null,
    success: null,
  };
}

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

// Kendi gönderdiğin bir anıyı (bekleyen ya da onaylı) tamamen sil.
app.post(
  '/profile/delete/:id',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const item = await db.getItemById(req.params.id);
    if (item && item.userId === req.session.userId) {
      try {
        await cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.type === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.error('Cloudinary silme hatası (profil):', e.message);
      }
      await db.deleteItem(item.id);
      await likes.removeAllForItem(item.id);
      await viewsStore.removeAllForItem(item.id);
    }
    // item bulunamadıysa ya da başkasına aitse sessizce yok say — kendi
    // anılarının kimliğini/id'sini bilmeyen biri başkasının anısını silemez.
    const data = await buildOwnProfileData(req.session.userId, req.session.username);
    res.render('profile', { ...data, success: 'Anı silindi.' });
  })
);

// Herkese açık profil — sadece onaylı anılar, sadece herkese açık bilgiler
// (bekleyen sayısı, sınırlar, IP gibi özel bilgiler asla gösterilmez).
app.get(
  '/u/:username',
  asyncRoute(async (req, res) => {
    const user = await users.findUserByUsername(req.params.username);
    if (!user) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

    const [myItems, likeCounts] = await Promise.all([db.getItemsByUserId(user.id), likes.getAllCounts()]);
    const approvedItems = myItems
      .filter((i) => i.status === 'approved')
      .map((i) => ({ ...i, likes: likeCounts[i.id] || 0, ip: undefined }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const totalLikes = approvedItems.reduce((sum, i) => sum + i.likes, 0);

    res.render('public-profile', {
      profileUsername: user.username,
      bio: user.bio,
      createdAt: user.createdAt,
      approvedCount: approvedItems.length,
      totalLikes,
      items: approvedItems,
      isOwnProfile: req.session && req.session.username === user.username,
    });
  })
);

// 404 - her zaman en sonda
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ CroShy Anı http://localhost:${PORT} adresinde çalışıyor`);
});
