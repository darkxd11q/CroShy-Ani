// Bildirim göndermek ASLA asıl işlemi bozmamalı: hatalar yutulur (sadece günlüğe yazılır).
const notifications = require('../notifications');

async function notify(userId, { type, text, link, dedupeKey }) {
  try {
    if (!userId) return;
    await notifications.create({ userId, type, text, link, dedupeKey });
  } catch (e) {
    console.error('Bildirim oluşturulamadı:', e.message);
  }
}

module.exports = { notify };
