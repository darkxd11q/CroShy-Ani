// Ortak yapılar: ortam, yapılandırma, sabitler ve yardımcı fonksiyonlar.
// (Eskiden tek parça olan server.js'in 'bildirimler' kısmı — davranış aynı.)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const db = require('../db');
const users = require('../users');
const bans = require('../bans');
const logs = require('../logs');
const likes = require('../likes');
const viewsStore = require('../views_store');
const rememberTokens = require('../rememberTokens');
const redeemCodes = require('../redeemCodes');
const awards = require('../awards');
const feedback = require('../feedback');
const settings = require('../settings');
const {
  safeStringEqual,
  verifyPassword,
  hashPassword,
  verifyHashedPassword,
  createLoginGuard,
  createRateLimiter,
} = require('../auth');

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
// Kırpılmış videolarda normal boyut sınırı yerine uygulanan, kötüye
// kullanımı önleyen makul üst tavan (client tarafındakiyle aynı).
const ABSOLUTE_VIDEO_CEILING_BYTES = 300 * 1024 * 1024;

// Admin panelinden verilebilen sabit rozet seti. "founder" ve "croshy"
// FULL_EXEMPT_BADGES ile eşleşir (bkz. effectiveLimitsFor) — sahibi tüm
// sınırlardan muaf olur. Sırası profil sayfalarında gösterilme sırasıdır.
const BADGE_INFO = {
  founder: { label: 'Site Kurucusu', icon: '🏆', className: 'badge-founder' },
  croshy: { label: 'CroShy', icon: '❤️', className: 'badge-croshy' },
  special: { label: 'ÖZEL', icon: '💜', className: 'badge-special' },
  plus: { label: 'Plus', icon: '💠', className: 'badge-plus' },
  weekly_active: { label: 'Haftanın Aktifi', icon: '🔥', className: 'badge-weekly-active' },
  weekly_liked: { label: 'Haftanın Beğenileni', icon: '⭐', className: 'badge-weekly-liked' },
  supporter: { label: 'Destekçi', icon: '🤝', className: 'badge-supporter' },
  member: { label: 'Üye', icon: '👤', className: 'badge-member' },
};
const BADGE_ORDER = ['founder', 'croshy', 'special', 'plus', 'weekly_active', 'weekly_liked', 'supporter', 'member'];

// Kod ile edinilebilen premium roller (bkz. redeem_codes tablosu).
const REDEEMABLE_BADGES = ['special', 'plus'];

// ÖZEL/Plus ayrıcalıkları: biraz daha yüksek sınırlar + günlük en az 3
// gönderim + 3 ekstra tema seçme hakkı.
const PREMIUM_BADGES = ['special', 'plus'];
const PREMIUM_LIMIT_MULTIPLIER = 1.5;
const PREMIUM_DAILY_LIMIT = 3;
const PREMIUM_THEMES = ['ocean', 'sunset', 'emerald'];
// Haftalık rozet kazananlara 15 gün boyunca açılan 2 ekstra tema
const BASE_THEMES = PREMIUM_THEMES;
const REWARD_THEMES = ['aurora', 'royal'];
const REWARD_THEME_MS = 15 * 24 * 60 * 60 * 1000;

// <NAME-STYLE-BEGIN>
// İsim rengi: ÖZEL/Plus/haftalık rozet sahipleri (ve Site Kurucusu/CroShy)
// adlarını hazır gradyanlarla ya da harf harf kendi seçtikleri renklerle boyayabilir.
const NAME_PRESETS = {
  sunrise: 'linear-gradient(90deg,#f97316,#ec4899,#a855f7)',
  ocean: 'linear-gradient(90deg,#22d3ee,#3b82f6,#8b5cf6)',
  mint: 'linear-gradient(90deg,#34d399,#a3e635,#fde047)',
};
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Kullanıcıdan gelen stili doğrular/normalize eder. null = stil yok, undefined = geçersiz.
function sanitizeNameStyle(input, username) {
  if (!input || input.type === 'none') return null;
  if (input.type === 'preset' && NAME_PRESETS[input.id]) return { type: 'preset', id: input.id };
  if (input.type === 'letters' && Array.isArray(input.colors)) {
    const n = [...String(username)].length;
    const colors = input.colors.slice(0, n).map((c) => (typeof c === 'string' && HEX_COLOR.test(c) ? c.toLowerCase() : null));
    while (colors.length < n) colors.push(null);
    return { type: 'letters', colors };
  }
  return undefined;
}

function renderNameHtml(name, style) {
  const safeName = escHtml(name);
  if (!style) return safeName;
  if (style.type === 'preset' && NAME_PRESETS[style.id]) {
    return '<span class="name-grad" style="background-image:' + NAME_PRESETS[style.id] + '">' + safeName + '</span>';
  }
  if (style.type === 'letters' && Array.isArray(style.colors)) {
    return [...String(name)]
      .map((ch, i) => {
        const c = style.colors[i];
        return typeof c === 'string' && HEX_COLOR.test(c) ? '<span style="color:' + c + '">' + escHtml(ch) + '</span>' : escHtml(ch);
      })
      .join('');
  }
  return safeName;
}
app.locals.renderName = renderNameHtml;
const canStyleName = users.canStyleName;
// <NAME-STYLE-END>

function hasPremium(user) {
  return !!(user && Array.isArray(user.badges) && user.badges.some((b) => PREMIUM_BADGES.includes(b)));
}

// Admin bir hesabı sildiyse açık oturumları kapat; yeniden adlandırdıysa
// oturumdaki ismi güncelle (oturumlar bellekte tutulduğu için bu yeterli).
const deletedUserIds = new Set();
const renamedUsers = new Map();

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

// Rozet kodu: "DARK-1907-" + 8 rastgele büyük/küçük harf (örn. DARK-1907-MjFoBdgQ).
// Büyük/küçük harf ayrımı önemlidir. crypto.randomInt kriptografik olarak
// güvenli rastgelelik sağlar (Math.random tahmin edilebilir olurdu).
// Cloudinary URL'si: sadece güvenli karakterler (tırnak, boşluk, < > yok) — XSS'e karşı.
const SAFE_CLOUD_URL = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_\-\/.,:%~]+$/;
const CODE_PREFIX = 'DARK-1907-';
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_VALID_MS = 24 * 60 * 60 * 1000; // 1 gün

function generateRedeemCode() {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return CODE_PREFIX + suffix;
}

// Premium kullanıcının seçtiği temayı (varsa) tarayıcıya çerez olarak yazar;
// her sayfanın <head>'indeki küçük script bunu okuyup temayı anında uygular.
// Tema erişimi: ÖZEL/Plus (ve sınırsız hesaplar: Site Kurucusu/CroShy) 3 temel
// temayı, haftalık rozet kazananlar ayrıca 15 gün boyunca 2 ödül temasını kullanır.
function allowedThemesFor(user, rewardExpiry) {
  const list = [];
  if (hasPremium(user) || hasFullExemption(user)) list.push(...BASE_THEMES);
  if (rewardExpiry && rewardExpiry > Date.now()) list.push(...REWARD_THEMES);
  return list;
}

// Seçilen temayı tarayıcıya çerez olarak yazar; her sayfanın <head>'indeki
// küçük script bunu okuyup temayı anında uygular. Ödül temalarının çerezi
// ödül bittiği anda kendiliğinden silinsin diye tam o ana kadar yaşar.
function setThemeCookie(res, theme, rewardExpiry) {
  if (!theme) return res.clearCookie('croshy_theme', { path: '/' });
  const isReward = REWARD_THEMES.includes(theme);
  const maxAge = isReward ? Math.max(1000, (rewardExpiry || 0) - Date.now()) : 365 * 24 * 60 * 60 * 1000;
  res.cookie('croshy_theme', theme, { httpOnly: false, sameSite: 'lax', secure: isProd, maxAge, path: '/' });
}

async function syncThemeCookie(res, user, req) {
  try {
    let theme = null;
    let rewardExpiry = 0;
    if (user && user.theme) {
      rewardExpiry = REWARD_THEMES.includes(user.theme) ? await awards.getRewardExpiry(user.id) : 0;
      if (allowedThemesFor(user, rewardExpiry).includes(user.theme)) theme = user.theme;
    }
    if (theme) setThemeCookie(res, theme, rewardExpiry);
    else res.clearCookie('croshy_theme', { path: '/' });
    // Oturumda da tut: tema artık oturumdaki HESABA aittir (bkz. themeGuard).
    if (req && req.session) {
      req.session.theme = theme;
      req.session.themeRewardExpiry = rewardExpiry;
      req.session.themeCheckedAt = Date.now();
    }
  } catch (e) {
    console.error('Tema çerezi senkronize edilemedi:', e.message);
  }
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

// Çerezi HEMEN (senkron) ayarlar, Supabase'e yazmayı arka planda yapar.
// Böylece giriş/kayıt sırasında kullanıcı ekstra bir ağ isteğini beklemek
// zorunda kalmaz — bu, admin/kullanıcı girişindeki en büyük gecikme
// kaynağıydı. Arka plan yazması başarısız olsa bile giriş etkilenmez;
// tek sonucu o oturum için "beni hatırla"nın çalışmaması olur.
function issueRememberCookie(res, { subjectType, subjectId, username, role }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);

  res.cookie(REMEMBER_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: REMEMBER_MS,
    path: '/',
  });

  rememberTokens
    .create({
      tokenHash,
      subjectType,
      subjectId,
      username,
      role: role || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + REMEMBER_MS,
    })
    .catch((e) => console.error('remember token oluşturma hatası (arka plan):', e.message));
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

// Her giriş/kayıt formu kendi bağımsız brute-force sayaçlarını kullanır
const adminGuard = createLoginGuard();
const userGuard = createLoginGuard();
const redeemGuard = createLoginGuard({ maxAttempts: 6 });

// Tema HESABA aittir, cihaza değil: her sayfa gezinmesinde tema çerezi, o anda
// oturum açmış hesabın temasıyla eşitlenir. Başka bir hesaba geçildiğinde, çıkış
// yapıldığında ya da oturum bittiğinde çerez kendiliğinden silinir; böylece bir
// hesapta seçilen tema aynı cihazdaki diğer hesaplara/ziyaretçilere sızmaz.
// (Çerez, sayfanın <head>'indeki script'in okuduğu aynı yanıtta güncellenir.)
const STATIC_EXT = /\.(css|js|png|jpe?g|gif|svg|ico|webp|woff2?|map|txt|json)$/i;

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
// Tablo/sütun yoksa (supabase-schema.sql güncellenmemişse) bunu yönetici anlasın.
function friendlyServerError(err) {
  const code = err && err.code;
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) {
    return 'Veritabanı şeması güncel değil. Site yöneticisi supabase-schema.sql dosyasını çalıştırmalı.';
  }
  return 'Sunucuda beklenmeyen bir hata oluştu.';
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error('Sunucu hatası:', err);
      if (res.headersSent) return next(err);
      const wantsJson = req.path.startsWith('/api/');
      if (wantsJson) {
        res.status(500).json({ error: friendlyServerError(err) });
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

// "Site Kurucusu" ve "CroShy" rozetine sahip kullanıcılar sitedeki HİÇBİR
// sınıra (dosya boyutu, video süresi, günlük gönderim limiti) takılmaz.
const FULL_EXEMPT_BADGES = ['founder', 'croshy'];
const NO_LIMIT = Number.MAX_SAFE_INTEGER;

function hasFullExemption(user) {
  return !!(user && Array.isArray(user.badges) && user.badges.some((b) => FULL_EXEMPT_BADGES.includes(b)));
}

// Bir kullanıcı için geçerli olan (kişiye özelse onu, yoksa genel ayarı
// kullanan) fiili sınırları hesaplar. Muaf tutan bir rozeti varsa tüm
// sınırlar kaldırılır.
function effectiveLimitsBase(user, globalSettings) {
  if (hasFullExemption(user)) {
    return {
      imageBytes: NO_LIMIT,
      videoBytes: NO_LIMIT,
      videoDurationSec: NO_LIMIT,
      dailyLimit: NO_LIMIT,
      unlimited: true,
      premium: hasPremium(user),
    };
  }

  const base = {
    imageBytes: (user && user.customImageBytes) || globalSettings.maxImageBytes,
    videoBytes: (user && user.customVideoBytes) || globalSettings.maxVideoBytes,
    videoDurationSec: (user && user.customVideoDurationSec) || globalSettings.maxVideoDurationSec,
    dailyLimit: globalSettings.dailySubmitLimit,
  };

  // ÖZEL/Plus: tüm sınırlar biraz daha yüksek, günlük gönderim en az 3.
  if (hasPremium(user)) {
    return {
      imageBytes: Math.round(base.imageBytes * PREMIUM_LIMIT_MULTIPLIER),
      videoBytes: Math.round(base.videoBytes * PREMIUM_LIMIT_MULTIPLIER),
      videoDurationSec: Math.round(base.videoDurationSec * PREMIUM_LIMIT_MULTIPLIER),
      dailyLimit: Math.max(PREMIUM_DAILY_LIMIT, base.dailyLimit),
      unlimited: false,
      premium: true,
    };
  }

  return { ...base, unlimited: false, premium: false };
}

// Destekçi rozeti (geri bildirimi çok beğenilenlere verilir): günlük paylaşım
// hakkına +1 ekler (örn. normalde 3 ise 4).
function effectiveLimitsFor(user, globalSettings) {
  const l = effectiveLimitsBase(user, globalSettings);
  if (!l.unlimited && user && Array.isArray(user.badges) && user.badges.includes('supporter')) {
    return { ...l, dailyLimit: l.dailyLimit + 1, supporter: true };
  }
  return l;
}

// ---------- Yumuşak silinen öğelerin kalıcı temizliği ----------
// Bir öğe silindiğinde hemen kalıcı olarak yok edilmez; 24 saat boyunca
// "Son Silinenler" altında geri alınabilir durumda kalır. Bu süre dolan
// öğeleri periyodik olarak (ve sunucu her açıldığında bir kere) tarayıp
// hem Cloudinary'den hem Supabase'den kalıcı olarak temizliyoruz.
const DELETE_RETENTION_MS = 24 * 60 * 60 * 1000;

async function purgeExpiredDeletions() {
  try {
    const expired = await db.getExpiredDeletedItems(Date.now() - DELETE_RETENTION_MS);
    for (const item of expired) {
      try {
        await cloudinary.uploader.destroy(item.publicId, {
          resource_type: item.type === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.error('Cloudinary silme hatası (süresi dolan):', e.message);
      }
      await db.hardDeleteItem(item.id);
      await likes.removeAllForItem(item.id);
      await viewsStore.removeAllForItem(item.id);
    }
    if (expired.length > 0) {
      console.log(`🗑️  ${expired.length} süresi dolmuş silinen anı kalıcı olarak temizlendi.`);
    }
  } catch (e) {
    console.error('Süresi dolan silinenler temizlenemedi:', e.message);
  }
}

// ---------- Haftalık rozetler (her Cuma 17:15, Türkiye saati) ----------
const DAY_MS = 24 * 60 * 60 * 1000;
const TR_OFFSET_MS = 3 * 60 * 60 * 1000; // Europe/Istanbul = UTC+3 (yaz saati uygulaması yok)

// Verilen andan önceki (ya da o ana eşit) en son Cuma 17:15'in (TR) UTC zamanı.
function latestAwardTime(nowMs) {
  const local = new Date(nowMs + TR_OFFSET_MS); // UTC alanları = TR yerel saati
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 17, 15, 0));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7));
  let t = d.getTime();
  if (t > local.getTime()) t -= 7 * DAY_MS;
  return t - TR_OFFSET_MS;
}

async function runWeeklyAward(T) {
  const { topSubmitter, topLiked } = await awards.computeWinners(T - 7 * DAY_MS, T);

  // Geçen haftanın sahiplerinden rozetleri geri al
  const holders = await users.listUsersWithBadges();
  for (const u of holders) {
    for (const b of ['weekly_active', 'weekly_liked']) {
      if (u.badges.includes(b)) await users.revokeBadge(u.username, b);
    }
  }

  const now = Date.now();
  for (const [badge, w] of [['weekly_active', topSubmitter], ['weekly_liked', topLiked]]) {
    if (!w) continue;
    const winner = await users.findUserById(w.userId);
    if (!winner) continue;
    await users.grantBadge(winner.username, badge);
    await awards.record({
      userId: winner.id,
      username: winner.username,
      badge,
      weekEnd: T,
      submissions: w.submissions,
      likes: w.likes,
      awardedAt: now,
      themeExpiresAt: now + REWARD_THEME_MS,
    });
  }
}

let weeklyRunning = false;
let lastWeeklyErrLog = 0;
// Sunucu uyuyup geç uyansa bile kaçırılmasın diye her dakika kontrol edilir;
// DB'de tutulan "son dağıtım" zamanı sayesinde her hafta yalnızca bir kez çalışır.
async function checkWeeklyAward() {
  if (weeklyRunning) return;
  weeklyRunning = true;
  let prev = null;
  try {
    const T = latestAwardTime(Date.now());
    prev = await settings.claimWeeklyAward(T);
    if (prev === null) return;
    await runWeeklyAward(T);
    console.log('🏅 Haftalık rozetler dağıtıldı.');
  } catch (e) {
    if (prev !== null) {
      try {
        await settings.restoreWeeklyAward(prev);
      } catch {}
    }
    if (Date.now() - lastWeeklyErrLog > 60 * 60 * 1000) {
      lastWeeklyErrLog = Date.now();
      console.error('Haftalık rozet dağıtımı hatası:', e.message);
    }
  } finally {
    weeklyRunning = false;
  }
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
  // Giriş yaptıktan sonra kullanıcıyı geldiği sayfaya geri döndür (örn. /redeem)
  const back = req.method === 'GET' ? req.originalUrl : '/profile';
  return res.redirect('/login?next=' + encodeURIComponent(back));
}

// Açık yönlendirme (open redirect) saldırısını önlemek için sadece site içi,
// "/" ile başlayan yollara izin verilir.
function safeNext(n) {
  return typeof n === 'string' && n.length < 200 && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\')
    ? n
    : null;
}

function resolveNext(req, res) {
  const fromBody = safeNext(req.body && req.body.next);
  const fromCookie = safeNext(getCookie(req, 'croshy_next'));
  res.clearCookie('croshy_next', { path: '/' });
  return fromBody || fromCookie || '/upload';
}

function requireUserApi(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Bu işlem için giriş yapmalısın.', loginRequired: true });
}

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
  // Tüm beğeni sayılarını tek seferde çekip kendi anılarınkileri topluyoruz —
  // ayrı bir "toplam beğeni" sorgusuna gerek kalmıyor.
  const likeCounts = await likes.getAllCounts();
  const totalLikes = approvedItems.reduce((sum, i) => sum + (likeCounts[i.id] || 0), 0);
  const limits = effectiveLimitsFor(user, globalSettings);

  const [rewardExpiry, nameChange] = await Promise.all([awards.getRewardExpiry(userId), users.getNameChangeInfo(userId)]);
  const allowedThemes = allowedThemesFor(user, rewardExpiry);

  const items = myItems.map((i) => ({ ...i, likes: likeCounts[i.id] || 0 }));

  return {
    username,
    bio: user ? user.bio : '',
    badges: user ? user.badges : [],
    BADGE_INFO,
    BADGE_ORDER,
    createdAt: user ? user.createdAt : null,
    totalCount: myItems.length,
    approvedCount: approvedItems.length,
    pendingCount,
    totalLikes,
    items,
    limits,
    premium: !!limits.premium,
    theme: user ? user.theme : null,
    allowedThemes,
    canThemes: allowedThemes.length > 0,
    rewardExpiry,
    avatarUrl: user ? user.avatarUrl : null,
    canGif: canUseGifAvatar(user),
    premiumUntil: (() => {
      if (!user) return null;
      const e = user.badgeExpiry || {};
      const t = ['special', 'plus'].filter((b) => user.badges.includes(b) && e[b]).map((b) => Number(e[b]));
      return t.length ? Math.max(...t) : null;
    })(),
    nameChange,
    nameStyle: user ? user.nameStyle : null,
    canStyleName: canStyleName(user),
    hasCustomLimits: !!(user && (user.customImageBytes || user.customVideoBytes || user.customVideoDurationSec)),
    error: null,
    success: null,
  };
}

// ---------- Profil fotoğrafı ----------
// Statik görseller herkese açık (en fazla 5 MB); GIF sadece ÖZEL/Plus (ve
// sınırsız hesaplar) için, en fazla 8 MB. Görsel tarayıcıdan doğrudan
// Cloudinary'e yüklenir, burada sadece doğrulanıp kaydedilir.
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_GIF_MAX_BYTES = 8 * 1024 * 1024;
const avatarLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: 'Çok fazla profil fotoğrafı değişikliği yaptın. Lütfen daha sonra tekrar dene.',
});

function canUseGifAvatar(user) {
  return hasPremium(user) || hasFullExemption(user);
}

// ---------- Geri bildirim ----------
const feedbackLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Çok fazla geri bildirim gönderdin. Lütfen daha sonra tekrar dene.',
});

// ---------- Kullanıcı adı doğrulama / değiştirme ----------
function validateNewUsername(name) {
  const n = String(name || '').trim();
  if (n.length < 3 || n.length > 10) return 'Kullanıcı adı 3-10 karakter arasında olmalı.';
  if (!/^[a-zA-Z0-9ığüşöçİĞÜŞÖÇ_.\- ]+$/.test(n)) return 'Kullanıcı adında geçersiz karakterler var.';
  return null;
}

module.exports = {
  ABSOLUTE_VIDEO_CEILING_BYTES,
  AVATAR_GIF_MAX_BYTES,
  AVATAR_MAX_BYTES,
  BADGE_INFO,
  BADGE_ORDER,
  BASE_THEMES,
  CODE_CHARS,
  CODE_PREFIX,
  CODE_VALID_MS,
  DAY_MS,
  DELETE_RETENTION_MS,
  FALLBACK_SETTINGS,
  FULL_EXEMPT_BADGES,
  HEX_COLOR,
  NAME_PRESETS,
  NO_LIMIT,
  PREMIUM_BADGES,
  PREMIUM_DAILY_LIMIT,
  PREMIUM_LIMIT_MULTIPLIER,
  PREMIUM_THEMES,
  REDEEMABLE_BADGES,
  REMEMBER_COOKIE,
  REMEMBER_MS,
  REWARD_THEMES,
  REWARD_THEME_MS,
  ROOT,
  SAFE_CLOUD_URL,
  STATIC_EXT,
  TR_OFFSET_MS,
  adminGuard,
  adminLoginLimiter,
  allowedThemesFor,
  app,
  asyncRoute,
  avatarLimiter,
  awards,
  bans,
  buildOwnProfileData,
  canStyleName,
  canUseGifAvatar,
  checkWeeklyAward,
  clearRememberCookie,
  cloudinary,
  createLoginGuard,
  createRateLimiter,
  crypto,
  db,
  deletedUserIds,
  effectiveLimitsBase,
  effectiveLimitsFor,
  escHtml,
  express,
  feedback,
  feedbackLimiter,
  formatDuration,
  friendlyServerError,
  generateRedeemCode,
  getCookie,
  getSettingsSafe,
  hasFullExemption,
  hasPremium,
  hashPassword,
  helmet,
  isProd,
  issueRememberCookie,
  lastWeeklyErrLog,
  latestAwardTime,
  likes,
  logs,
  path,
  purgeExpiredDeletions,
  redeemCodes,
  redeemGuard,
  registerLimiter,
  rememberTokens,
  renamedUsers,
  renderNameHtml,
  requireAdminApi,
  requireAdminPage,
  requireSuperAdminApi,
  requireUserApi,
  requireUserPage,
  resolveNext,
  runWeeklyAward,
  safeNext,
  safeStringEqual,
  sanitizeNameStyle,
  session,
  setThemeCookie,
  settings,
  sha256,
  syncThemeCookie,
  userGuard,
  userLoginLimiter,
  users,
  validateNewUsername,
  verifyHashedPassword,
  verifyPassword,
  viewsStore,
  weeklyRunning,
};
