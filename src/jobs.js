// Arka plan işleri: süresi dolanları temizleme, haftalık rozet yedeği vb.
// Haftalık rozetler asıl olarak veritabanında (pg_cron) çalışır; buradaki
// kontrol, o kurulamadıysa devreye giren YEDEK zamanlayıcıdır (aynı kayıt
// üzerinden çalıştığı için çift dağıtım olmaz).
const { purgeExpiredDeletions, checkWeeklyAward } = require('./core');
const { sessionStore } = require('./sessionStore');
const supabase = require('../supabaseClient');
const users = require('../users');
const { notify } = require('./notify');
const { purgeOrphanUploads } = require('./orphans');
const audit = require('./audit');
const dbDrafts = require('../db');
const cloudinaryLib = require('cloudinary').v2;
const rateState = require('../rateState');
const notificationsDb = require('../notifications');

const DAY = 24 * 60 * 60 * 1000;

// KVKK: IP adreslerini kısa süre sonra sil (limitler/beğeniler hesaba bağlı olduğu için gerekmiyor)
async function purgePrivacyData() {
  try {
    await supabase.from('items').update({ ip: null }).lt('created_at', Date.now() - 30 * DAY).not('ip', 'is', null);
    await supabase.from('submission_log').delete().lt('ts', Date.now() - 3 * DAY);
  } catch (e) {
    console.error('Gizlilik temizliği hatası:', e.message);
  }
}

// Süresi dolan ÖZEL/Plus vb. rozetleri kaldır ve kullanıcıyı bilgilendir
async function purgeExpiredBadges() {
  try {
    const removed = await users.purgeExpiredBadges();
    for (const r of removed) {
      const label = { special: 'ÖZEL', plus: 'Plus', supporter: 'Destekçi' }[r.badge] || r.badge;
      await notify(r.userId, { type: 'system', text: `${label} rozetinin süresi doldu. Yeni bir kodla yenileyebilirsin.`, link: '/redeem' });
    }
  } catch (e) {
    console.error('Rozet süresi temizliği hatası:', e.message);
  }
}

// 30 günü geçen taslaklar (Cloudinary dosyasıyla birlikte) silinir
async function purgeExpiredDrafts() {
  try {
    const old = await dbDrafts.getExpiredDrafts(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const d of old) {
      try {
        await cloudinaryLib.uploader.destroy(d.publicId, { resource_type: d.type === 'video' ? 'video' : 'image' });
      } catch (e) {
        console.error('Taslak Cloudinary silme hatası:', e.message);
      }
      await dbDrafts.deleteDraft(d.id, d.userId);
    }
    if (old.length) console.log(`🧹 ${old.length} süresi dolan taslak silindi.`);
  } catch (e) {
    console.error('Taslak temizliği hatası:', e.message);
  }
}

function startJobs() {
  const every = (ms, fn, firstMs = 20 * 1000) => {
    setTimeout(fn, firstMs).unref();
    setInterval(fn, ms).unref();
  };

  purgeExpiredDeletions();
  setInterval(purgeExpiredDeletions, 30 * 60 * 1000).unref();
  every(60 * 1000, checkWeeklyAward);
  every(60 * 60 * 1000, () => sessionStore.purgeExpired(), 60 * 1000);
  every(6 * 60 * 60 * 1000, purgePrivacyData, 90 * 1000);
  every(60 * 60 * 1000, purgeExpiredBadges, 120 * 1000);
  every(24 * 60 * 60 * 1000, purgeOrphanUploads, 5 * 60 * 1000);
  every(24 * 60 * 60 * 1000, () => audit.purgeOld(180 * 24 * 60 * 60 * 1000).catch((e) => console.error('İşlem kaydı temizliği:', e.message)), 3 * 60 * 1000);
  every(60 * 60 * 1000, () => require('../rememberTokens').purgeExpired().catch((e) => console.error('Belirteç temizliği:', e.message)), 150 * 1000);
  every(24 * 60 * 60 * 1000, () => notificationsDb.purgeOld().catch((e) => console.error('Bildirim temizliği:', e.message)), 4 * 60 * 1000);
  every(60 * 60 * 1000, () => rateState.purgeExpired(), 200 * 1000);
  every(24 * 60 * 60 * 1000, purgeExpiredDrafts, 6 * 60 * 1000);
  // <JOBS>
}

module.exports = { startJobs };
