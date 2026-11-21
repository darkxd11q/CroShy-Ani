// Web push: bildirim oluşturulunca kullanıcının kayıtlı cihazlarına da gönderilir.
// VAPID anahtarları yoksa özellik tamamen kapalıdır (site normal çalışır).
const pushSubs = require('../pushSubs');

let wp = null;
try {
  wp = require('web-push');
} catch {
  wp = null;
}
let store = pushSubs;
let configured = false;

// Beğeni/tepki gibi sık olaylar telefonu rahatsız etmesin; çan listesinde yine görünürler.
const PUSH_TYPES = new Set(['approved', 'rejected', 'removed', 'comment', 'mention', 'system', 'award']);

const isEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && wp);
const publicKey = () => process.env.VAPID_PUBLIC_KEY || null;

function configure() {
  if (configured || !isEnabled()) return;
  wp.setVapidDetails(process.env.VAPID_SUBJECT || process.env.PUBLIC_URL || 'mailto:admin@croshy.local', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
}

async function sendToUser(userId, { type, text, link }) {
  if (!isEnabled() || !PUSH_TYPES.has(type)) return { sent: 0 };
  configure();
  let subs;
  try {
    subs = await store.listForUser(userId);
  } catch {
    return { sent: 0 };
  }
  const payload = JSON.stringify({ title: 'CroShy Anı', body: String(text || '').slice(0, 180), url: link || '/', tag: type });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 60 * 60 });
        sent += 1;
      } catch (e) {
        // Cihaz aboneliği iptal etmiş/süresi dolmuş: kaydı sil
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await store.removeByEndpoint(s.endpoint).catch(() => {});
        else console.error('Push gönderilemedi:', e && e.statusCode ? e.statusCode : e && e.message);
      }
    })
  );
  return { sent };
}

function __setDeps(deps) {
  if (deps.webpush) wp = deps.webpush;
  if (deps.store) store = deps.store;
  configured = false;
}

module.exports = { isEnabled, publicKey, sendToUser, PUSH_TYPES, __setDeps };
