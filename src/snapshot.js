// Onaylı anıların kısa süreli (10 sn) önbelleği + sayfalama için "gezinme belirteci".
// Her ana sayfa isteğinde tüm tabloyu çekmek yerine bir kez hazırlanır; sayfalar ondan dilimlenir.
const crypto = require('crypto');
const db = require('../db');
const likes = require('../likes');
const users = require('../users');
const social = require('../social');

const TTL_MS = 10 * 1000;
let cache = null;
let building = null;

async function getSnapshot() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (building) return building;
  building = (async () => {
    const [items, likeCounts, avatarMap, commentCounts] = await Promise.all([
      db.getApprovedItems(),
      likes.getAllCounts(),
      users.getAllAvatars(),
      social.commentCountsAll().catch(() => ({})),
    ]);
    const list = items.map(({ ip: _ip, ...rest }) => ({
      ...rest,
      likes: likeCounts[rest.id] || 0,
      commentCount: commentCounts[rest.id] || 0,
      uploaderAvatar: (avatarMap[rest.uploaderName] || {}).avatarUrl || null,
      uploaderStyle: (avatarMap[rest.uploaderName] || {}).nameStyle || null,
    }));
    cache = { at: Date.now(), items: list, byId: new Map(list.map((i) => [i.id, i])) };
    return cache;
  })().finally(() => {
    building = null;
  });
  return building;
}

function invalidateSnapshot() {
  cache = null;
}

// Sayfa sayfa gezinirken sıralamanın kaymaması için ilk istekte sıralı kimlik listesi saklanır.
const browses = new Map();
function createBrowse(ids, meta) {
  const token = crypto.randomUUID();
  browses.set(token, { ids, at: Date.now(), ...meta });
  if (browses.size > 500) {
    const oldest = [...browses.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) browses.delete(oldest[0]);
  }
  return token;
}
function getBrowse(token) {
  const b = token ? browses.get(token) : null;
  if (!b || Date.now() - b.at > 15 * 60 * 1000) return null;
  return b;
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [t, b] of browses) if (b.at < cutoff) browses.delete(t);
}, 5 * 60 * 1000).unref();

// "Görüldü" anahtarı: giriş yapmışsa hesap, değilse IP'nin tuzlu özeti (ham IP saklanmaz)
function seenKeyFor(req) {
  const uid = req.session && req.session.userId;
  if (uid) return 'u:' + uid;
  return 'h:' + crypto.createHash('sha256').update(String(req.ip) + (process.env.IP_SALT || 'croshy')).digest('hex').slice(0, 24);
}

module.exports = { getSnapshot, invalidateSnapshot, createBrowse, getBrowse, seenKeyFor };
