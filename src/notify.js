// Bildirim göndermek ASLA asıl işlemi bozmamalı: hatalar yutulur (sadece günlüğe yazılır).
const notifications = require('../notifications');
const push = require('./push');

async function notify(userId, { type, text, link, dedupeKey }) {
  try {
    if (!userId) return;
    const created = await notifications.create({ userId, type, text, link, dedupeKey });
    // Yeni bir bildirimse kullanıcının kayıtlı cihazlarına da (telefon/tarayıcı) gönder
    if (created !== false) push.sendToUser(userId, { type, text, link }).catch(() => {});
  } catch (e) {
    console.error('Bildirim oluşturulamadı:', e.message);
  }
}

module.exports = { notify };
