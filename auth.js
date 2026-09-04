const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ---------- Zamanlama saldırısına karşı güvenli karşılaştırma ----------
// Kullanıcı adı gibi düz metinleri sabit uzunluklu hash'e çevirip
// crypto.timingSafeEqual ile karşılaştırıyoruz. Böylece string uzunluğu
// veya harf eşleşmesi üzerinden zamanlama analizi yapılamaz.
function safeStringEqual(a = '', b = '') {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ---------- Admin şifresi (.env içindeki tek paylaşılan şifre) ----------
// Süreç başlarken bir kere hash'leyip bellekte tutuyoruz; her karşılaştırma
// bcrypt üzerinden kasıtlı yavaş ve zamanlamaya dayanıklı şekilde yapılır.
let cachedHash = null;
let cachedPlain = null;

function getPasswordHash(plainPassword) {
  if (cachedPlain === plainPassword && cachedHash) return cachedHash;
  cachedPlain = plainPassword;
  cachedHash = bcrypt.hashSync(plainPassword || '', 10);
  return cachedHash;
}

function verifyPassword(inputPassword, correctPlainPassword) {
  if (!correctPlainPassword) return false;
  const hash = getPasswordHash(correctPlainPassword);
  return bcrypt.compareSync(inputPassword || '', hash);
}

// ---------- Normal kullanıcı şifreleri (Supabase'de hash olarak saklanır) ----------
function hashPassword(plainPassword) {
  return bcrypt.hashSync(plainPassword || '', 10);
}

function verifyHashedPassword(inputPassword, storedHash) {
  if (!storedHash) return false;
  return bcrypt.compareSync(inputPassword || '', storedHash);
}

// ---------- Brute-force / kaba kuvvet koruması ----------
// Her çağrı bağımsız bir Map ile kendi sayaçlarını tutan bir "guard"
// döndürür — admin girişi, kullanıcı girişi ve kayıt formu birbirini
// kilitlemesin diye ayrı ayrı örnekler kullanılır.
function createLoginGuard({ maxAttempts = 5, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map(); // key -> { count, firstAttempt, lockedUntil }

  function getLoginStatus(key) {
    const entry = attempts.get(key);
    if (!entry) return { locked: false, remainingMs: 0 };
    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
      return { locked: true, remainingMs: entry.lockedUntil - Date.now() };
    }
    return { locked: false, remainingMs: 0 };
  }

  function registerFailedAttempt(key) {
    const now = Date.now();
    let entry = attempts.get(key);

    if (!entry || now - entry.firstAttempt > windowMs) {
      entry = { count: 0, firstAttempt: now, lockedUntil: 0 };
    }

    entry.count += 1;
    if (entry.count >= maxAttempts) {
      entry.lockedUntil = now + lockMs;
    }
    attempts.set(key, entry);
  }

  function resetAttempts(key) {
    attempts.delete(key);
  }

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts.entries()) {
      if ((!entry.lockedUntil || entry.lockedUntil < now) && now - entry.firstAttempt > windowMs) {
        attempts.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref();

  return { getLoginStatus, registerFailedAttempt, resetAttempts };
}

// ---------- Genel amaçlı istek sınırlayıcı (IP başına) ----------
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits.entries()) {
      if (now - entry.start > windowMs) hits.delete(ip);
    }
  }, windowMs).unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
    }
    entry.count += 1;
    hits.set(ip, entry);

    if (entry.count > max) {
      return res.status(429).json({
        error: message || 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar dene.',
      });
    }
    next();
  };
}

module.exports = {
  safeStringEqual,
  verifyPassword,
  hashPassword,
  verifyHashedPassword,
  createLoginGuard,
  createRateLimiter,
};
