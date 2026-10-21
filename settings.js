const supabase = require('./supabaseClient');

const DEFAULTS = {
  dailySubmitLimit: 2,
  maxImageBytes: 8.5 * 1024 * 1024,
  maxVideoBytes: 40 * 1024 * 1024,
  maxVideoDurationSec: 150,
};

function fromRow(row) {
  return {
    dailySubmitLimit: row.daily_submit_limit,
    maxImageBytes: Number(row.max_image_bytes),
    maxVideoBytes: Number(row.max_video_bytes),
    maxVideoDurationSec: row.max_video_duration_sec,
  };
}

// Ayarlar hemen her istekte (yükleme sayfası açılışı, her gönderim vb.)
// okunuyor ama nadiren değişiyor — bu yüzden kısa süreli bir bellek içi
// önbellek kullanıyoruz. Admin bir ayarı değiştirdiğinde önbellek hemen
// güncellenir, yani admin kendi değişikliğini asla bayat görmez; diğer
// isteklerde en fazla birkaç saniyelik bir gecikmeyle yeni değer geçerli olur.
let cache = null;
let cacheAt = 0;
const CACHE_MS = 20_000;

async function getSettings() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;

  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;

  cache = data ? fromRow(data) : { ...DEFAULTS };
  cacheAt = Date.now();
  return cache;
}

async function updateSettings({ dailySubmitLimit, maxImageBytes, maxVideoBytes, maxVideoDurationSec }) {
  const patch = { updated_at: Date.now() };
  if (dailySubmitLimit != null) patch.daily_submit_limit = dailySubmitLimit;
  if (maxImageBytes != null) patch.max_image_bytes = maxImageBytes;
  if (maxVideoBytes != null) patch.max_video_bytes = maxVideoBytes;
  if (maxVideoDurationSec != null) patch.max_video_duration_sec = maxVideoDurationSec;

  const { data, error } = await supabase.from('app_settings').update(patch).eq('id', 1).select().maybeSingle();
  if (error) throw error;

  const updated = data ? fromRow(data) : null;
  if (updated) {
    cache = updated;
    cacheAt = Date.now();
  }
  return updated;
}

// Haftalık rozet dağıtımını "sahiplenir": bu hafta için daha önce
// dağıtılmadıysa true'ya yakın bir önceki değeri döndürür, dağıtıldıysa null.
async function claimWeeklyAward(T) {
  const { data: cur, error: e1 } = await supabase.from('app_settings').select('last_weekly_award').eq('id', 1).maybeSingle();
  if (e1) throw e1;
  const prev = cur ? Number(cur.last_weekly_award || 0) : 0;
  if (prev >= T) return null;
  const { data, error } = await supabase
    .from('app_settings')
    .update({ last_weekly_award: T })
    .eq('id', 1)
    .lt('last_weekly_award', T)
    .select();
  if (error) throw error;
  return (data || []).length > 0 ? prev : null;
}

async function restoreWeeklyAward(prev) {
  const { error } = await supabase.from('app_settings').update({ last_weekly_award: prev }).eq('id', 1);
  if (error) throw error;
}

module.exports = { getSettings, updateSettings, claimWeeklyAward, restoreWeeklyAward, DEFAULTS };
