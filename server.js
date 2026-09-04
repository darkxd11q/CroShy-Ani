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

app.set('trust proxy', 1);
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

    const { url, publicId, type, caption, bytes } = req.body;

    if (!url || !publicId || !type) {
      return res.status(400).json({ error: 'Eksik veri gönderildi.' });
    }
    if (type !== 'image' && type !== 'video') {
      return res.status(400).json({ error: 'Geçersiz medya türü.' });
    }
    if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) {
      return res.status(400).json({ error: 'Geçersiz medya kaynağı.' });
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
      caption: (caption || '').toString().slice(0, 200),
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

    req.session.regenerate((err) => {
      if (err) return res.render('login', { error: 'Bir hata oluştu, tekrar dene.' });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.redirect('/upload');
    });
  })
);

app.get('/register', (req, res) => {
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

    req.session.regenerate((err) => {
      if (err) return res.render('register', { error: 'Bir hata oluştu, tekrar dene.' });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.redirect('/upload');
    });
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('croshy.sid');
    res.redirect('/login');
  });
});

// ---------- Admin ----------

app.get('/admin/login', (req, res) => {
  res.render('admin-login', { error: null });
});

app.post('/admin/login', adminLoginLimiter, (req, res) => {
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

  req.session.regenerate((err) => {
    if (err) return res.render('admin-login', { error: 'Bir hata oluştu, tekrar dene.' });
    req.session.isAdmin = true;
    req.session.username = expectedUsername;
    res.redirect('/admin');
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('croshy.sid');
    res.redirect('/admin/login');
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
