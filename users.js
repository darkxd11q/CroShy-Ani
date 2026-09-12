const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    bio: row.bio || '',
    badges: Array.isArray(row.badges) ? row.badges : [],
    customImageBytes: row.custom_image_bytes != null ? Number(row.custom_image_bytes) : null,
    customVideoBytes: row.custom_video_bytes != null ? Number(row.custom_video_bytes) : null,
    customVideoDurationSec: row.custom_video_duration_sec != null ? Number(row.custom_video_duration_sec) : null,
  };
}

async function findUserByUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('username_lower', normalized)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function findUserById(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('app_users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function createUser({ id, username, passwordHash, createdAt }) {
  const { error } = await supabase.from('app_users').insert({
    id,
    username,
    username_lower: username.trim().toLowerCase(),
    password_hash: passwordHash,
    created_at: createdAt,
  });
  if (error) {
    // 23505 = Postgres "unique_violation" -> aynı anda iki kayıt yarışırsa
    // burada da yakalanabilsin diye anlamlı bir hataya çeviriyoruz.
    if (error.code === '23505') {
      const dup = new Error('Bu kullanıcı adı zaten alınmış.');
      dup.code = 'DUPLICATE_USERNAME';
      throw dup;
    }
    throw error;
  }
}

async function updatePasswordHash(userId, newHash) {
  const { error } = await supabase.from('app_users').update({ password_hash: newHash }).eq('id', userId);
  if (error) throw error;
}

async function updateBio(userId, bio) {
  const { error } = await supabase.from('app_users').update({ bio: (bio || '').slice(0, 160) }).eq('id', userId);
  if (error) throw error;
}

// Admin panelinden bir kullanıcı için özel dosya boyutu/süre sınırları
// belirler. Bir alan null geçilirse o alan "genel ayara dön" anlamına gelir.
async function setCustomLimits(username, { imageBytes, videoBytes, videoDurationSec }) {
  const normalized = String(username || '').trim().toLowerCase();
  const { data, error } = await supabase
    .from('app_users')
    .update({
      custom_image_bytes: imageBytes,
      custom_video_bytes: videoBytes,
      custom_video_duration_sec: videoDurationSec,
    })
    .eq('username_lower', normalized)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function clearCustomLimits(username) {
  return setCustomLimits(username, { imageBytes: null, videoBytes: null, videoDurationSec: null });
}

async function listUsersWithCustomLimits() {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .or('custom_image_bytes.not.is.null,custom_video_bytes.not.is.null,custom_video_duration_sec.not.is.null');
  if (error) throw error;
  return (data || []).map(fromRow);
}

// ---------- Rozetler ----------

async function grantBadge(username, badge) {
  const user = await findUserByUsername(username);
  if (!user) return null;
  if (user.badges.includes(badge)) return user;

  const nextBadges = [...user.badges, badge];
  const { data, error } = await supabase
    .from('app_users')
    .update({ badges: nextBadges })
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function revokeBadge(username, badge) {
  const user = await findUserByUsername(username);
  if (!user) return null;

  const nextBadges = user.badges.filter((b) => b !== badge);
  const { data, error } = await supabase
    .from('app_users')
    .update({ badges: nextBadges })
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function listUsersWithBadges() {
  // Küçük ölçekli bir site için tüm kullanıcıları çekip JS tarafında
  // filtrelemek, jsonb dizisi üzerinde kırılgan bir PostgREST filtresi
  // kurmaya çalışmaktan daha güvenilir.
  const { data, error } = await supabase.from('app_users').select('*');
  if (error) throw error;
  return (data || []).map(fromRow).filter((u) => u.badges.length > 0);
}

// Bu haftaki (son 7 gün) en çok anı gönderen ve en çok beğeni toplayan
// kullanıcılar — admin panelinde "Haftanın Aktifi"/"Haftanın Beğenileni"
// rozetini kime vereceğine karar vermesi için referans listesi.
async function getWeeklyLeaderboard() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // İki sorgu birbirine bağımlı değilmiş gibi PARALEL çalıştırılıyor (tüm
  // beğenileri çekip eşleştirmeyi JS tarafında yapıyoruz) — art arda iki ağ
  // isteği yerine tek bir bekleme süresi, admin panelini belirgin hızlandırır.
  const [itemsRes, likesRes] = await Promise.all([
    supabase.from('items').select('id, uploader_name, status, created_at').gt('created_at', cutoff),
    supabase.from('likes').select('item_id'),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (likesRes.error) throw likesRes.error;

  const items = itemsRes.data || [];
  const likeRows = likesRes.data || [];

  const submissionCounts = {};
  for (const item of items) {
    submissionCounts[item.uploader_name] = (submissionCounts[item.uploader_name] || 0) + 1;
  }

  const likesByItem = {};
  for (const row of likeRows) {
    likesByItem[row.item_id] = (likesByItem[row.item_id] || 0) + 1;
  }
  const likeCounts = {};
  for (const item of items) {
    if (item.status !== 'approved') continue;
    const n = likesByItem[item.id] || 0;
    likeCounts[item.uploader_name] = (likeCounts[item.uploader_name] || 0) + n;
  }

  const toSortedArray = (obj) =>
    Object.entries(obj)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

  return {
    topSubmitters: toSortedArray(submissionCounts),
    topLiked: toSortedArray(likeCounts),
  };
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  updatePasswordHash,
  updateBio,
  setCustomLimits,
  clearCustomLimits,
  listUsersWithCustomLimits,
  grantBadge,
  revokeBadge,
  listUsersWithBadges,
  getWeeklyLeaderboard,
};
