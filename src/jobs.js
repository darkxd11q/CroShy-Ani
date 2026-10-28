// Arka plan işleri: süresi dolanları temizleme, haftalık rozet yedeği vb.
// Haftalık rozetler asıl olarak veritabanında (pg_cron) çalışır; buradaki
// kontrol, o kurulamadıysa devreye giren YEDEK zamanlayıcıdır (aynı kayıt
// üzerinden çalıştığı için çift dağıtım olmaz).
const { purgeExpiredDeletions, checkWeeklyAward } = require('./core');
const { sessionStore } = require('./sessionStore');
const supabase = require('../supabaseClient');
const users = require('../users');
const { notify } = require('./notify');

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
  // <JOBS>
}

module.exports = { startJobs };
