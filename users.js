const supabase = require('./supabaseClient');

const DAY_MS = 24 * 60 * 60 * 1000;

function fromRow(row) {
  // Süresi dolan rozetler okunurken otomatik olarak görünmez olur
  const expiry = row.badge_expiry && typeof row.badge_expiry === 'object' ? row.badge_expiry : {};
  const nowTs = Date.now();
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    bio: row.bio || '',
    theme: row.theme || null,
    avatarUrl: row.avatar_url || null,
    avatarPublicId: row.avatar_public_id || null,
    nameStyle: row.name_style || null,
    badges: (Array.isArray(row.badges) ? row.badges : []).filter((b) => !(expiry[b] && Number(expiry[b]) < nowTs)),
    badgeExpiry: expiry,
    banned: !!row.banned,
    bannedReason: row.banned_reason || null,
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
    // Siteye kayıt olan herkese otomatik olarak "Üye" rozeti verilir.
    badges: ['member'],
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

// Profil fotoğrafı (Cloudinary URL'si + silebilmek için public id)
async function setAvatar(userId, { url, publicId }) {
  const { error } = await supabase
    .from('app_users')
    .update({ avatar_url: url, avatar_public_id: publicId })
    .eq('id', userId);
  if (error) throw error;
}

async function clearAvatar(userId) {
  const { error } = await supabase
    .from('app_users')
    .update({ avatar_url: null, avatar_public_id: null })
    .eq('id', userId);
  if (error) throw error;
}

// Galeride gönderen adının yanında küçük profil fotoğrafı göstermek için:
// sadece fotoğrafı olan kullanıcılar (küçük bir harita: kullanıcı adı -> url).
// İsim rengi kullanma hakkı veren rozetler
const NAME_STYLE_BADGES = ['founder', 'croshy', 'special', 'plus', 'weekly_active', 'weekly_liked'];
function canStyleName(user) {
  return !!(user && Array.isArray(user.badges) && user.badges.some((b) => NAME_STYLE_BADGES.includes(b)));
}

// Galeride gönderen adının yanında küçük profil fotoğrafı + renkli isim
// göstermek için: sadece fotoğrafı/ismi özelleştirilmiş kullanıcılar.
// (Sütunlar henüz yoksa galeri bozulmasın diye hata yutulur.)
async function getAllAvatars() {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('username, avatar_url, name_style, badges')
      .or('avatar_url.not.is.null,name_style.not.is.null');
    if (error) throw error;
    const map = {};
    for (const row of data || []) {
      const user = { badges: Array.isArray(row.badges) ? row.badges : [] };
      map[row.username] = {
        avatarUrl: row.avatar_url || null,
        nameStyle: canStyleName(user) ? row.name_style || null : null,
      };
    }
    return map;
  } catch (e) {
    return {};
  }
}

// Yorum yazarlarını göstermek için: kimlik listesi -> { id: {username, avatarUrl, nameStyle} }
async function getUsersByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length === 0) return {};
  const { data, error } = await supabase
    .from('app_users')
    .select('id, username, avatar_url, name_style, badges, badge_expiry')
    .in('id', list);
  if (error) throw error;
  const out = {};
  for (const row of data || []) {
    const u = fromRow(row);
    out[u.id] = { id: u.id, username: u.username, avatarUrl: u.avatarUrl, nameStyle: canStyleName(u) ? u.nameStyle : null, badges: u.badges };
  }
  return out;
}

// @bahsetmeleri için: kullanıcı adı listesi -> kullanıcılar (büyük/küçük harfe duyarsız)
async function findUsersByUsernames(names) {
  const lower = [...new Set((names || []).map((n) => String(n).toLowerCase()))];
  if (lower.length === 0) return [];
  const { data, error } = await supabase.from('app_users').select('*').in('username_lower', lower);
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function setNameStyle(userId, style) {
  const { error } = await supabase.from('app_users').update({ name_style: style || null }).eq('id', userId);
  if (error) throw error;
}

// ---------- Hesap yönetimi: arama / yeniden adlandırma / silme ----------

async function searchUsers(q) {
  const term = String(q || '').trim().toLowerCase().replace(/[^a-z0-9ığüşöç_.\- ]/g, '').slice(0, 20);
  if (!term) return [];
  const { data, error } = await supabase
    .from('app_users')
    .select('id, username, created_at, badges, banned')
    .ilike('username_lower', '%' + term + '%')
    .limit(10);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    username: r.username,
    createdAt: Number(r.created_at),
    badges: Array.isArray(r.badges) ? r.badges : [],
    banned: !!r.banned,
  }));
}

const NAME_CHANGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const NAME_CHANGE_LIMIT = 2;

// Kullanıcının kendi yaptığı değişiklikler: 14 günde en fazla 2 (admin değişiklikleri sayılmaz).
async function getNameChangeInfo(userId) {
  const fallback = { used: 0, remaining: NAME_CHANGE_LIMIT, nextAt: null };
  try {
    const { data, error } = await supabase
      .from('name_changes')
      .select('changed_at')
      .eq('user_id', userId)
      .eq('by_admin', false)
      .gt('changed_at', Date.now() - NAME_CHANGE_WINDOW_MS)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    const used = (data || []).length;
    const remaining = Math.max(0, NAME_CHANGE_LIMIT - used);
    const nextAt = remaining === 0 ? Number(data[NAME_CHANGE_LIMIT - 1].changed_at) + NAME_CHANGE_WINDOW_MS : null;
    return { used, remaining, nextAt };
  } catch (e) {
    return fallback;
  }
}

// Kullanıcı adını değiştirir ve her yerdeki kopyalarını (anılar, ödüller,
// "beni hatırla" kayıtları) günceller.
async function renameUser(userId, newName, { byAdmin = false } = {}) {
  const trimmed = String(newName || '').trim();
  const current = await findUserById(userId);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };
  if (trimmed === current.username) return { ok: false, reason: 'SAME' };

  const existing = await findUserByUsername(trimmed);
  if (existing && existing.id !== userId) return { ok: false, reason: 'DUPLICATE' };

  const { error } = await supabase
    .from('app_users')
    .update({ username: trimmed, username_lower: trimmed.toLowerCase() })
    .eq('id', userId);
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'DUPLICATE' };
    throw error;
  }

  const results = await Promise.all([
    supabase.from('items').update({ uploader_name: trimmed }).eq('user_id', userId),
    supabase.from('weekly_awards').update({ username: trimmed }).eq('user_id', userId),
    supabase.from('remember_tokens').update({ username: trimmed }).eq('subject_type', 'user').eq('subject_id', userId),
    supabase.from('name_changes').insert({
      user_id: userId,
      old_name: current.username,
      new_name: trimmed,
      changed_at: Date.now(),
      by_admin: !!byAdmin,
    }),
  ]);
  results.forEach((r) => {
    if (r.error) console.error('İsim değişikliği yan güncelleme hatası:', r.error.message);
  });

  return { ok: true, username: trimmed, oldUsername: current.username };
}

async function deleteUser(userId) {
  await supabase.from('name_changes').delete().eq('user_id', userId);
  const { error } = await supabase.from('app_users').delete().eq('id', userId);
  if (error) throw error;
}

// ÖZEL/Plus üyelerin seçebildiği alternatif site teması (null = varsayılan).
async function updateTheme(userId, theme) {
  const { error } = await supabase.from('app_users').update({ theme: theme || null }).eq('id', userId);
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

// days verilirse rozet süreli olur (tekrar kullanılırsa süre uzar); verilmezse süresizdir.
async function grantBadge(username, badge, { days = null } = {}) {
  const user = await findUserByUsername(username);
  if (!user) return null;

  const expiry = { ...(user.badgeExpiry || {}) };
  const now = Date.now();
  if (days) {
    const holdsPermanent = user.badges.includes(badge) && !expiry[badge];
    if (!holdsPermanent) {
      const base = expiry[badge] && Number(expiry[badge]) > now ? Number(expiry[badge]) : now;
      expiry[badge] = base + days * DAY_MS;
    }
  } else {
    delete expiry[badge]; // süresiz
  }

  const nextBadges = user.badges.includes(badge) ? user.badges : [...user.badges, badge];
  const { data, error } = await supabase
    .from('app_users')
    .update({ badges: nextBadges, badge_expiry: expiry })
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
  const expiry = { ...(user.badgeExpiry || {}) };
  delete expiry[badge];
  const { data, error } = await supabase
    .from('app_users')
    .update({ badges: nextBadges, badge_expiry: expiry })
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// ---------- Hesap bazlı yasak ----------
async function setBanned(userId, banned, reason) {
  const { error } = await supabase
    .from('app_users')
    .update({
      banned: !!banned,
      banned_reason: banned ? (reason ? String(reason).slice(0, 200) : null) : null,
      banned_at: banned ? Date.now() : null,
    })
    .eq('id', userId);
  if (error) throw error;
}

async function listBanned() {
  const { data, error } = await supabase.from('app_users').select('*').eq('banned', true);
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Süresi dolan rozetleri veritabanından da temizler; kimlerin ne kaybettiğini döndürür
// (çağıran taraf onlara bildirim gönderir).
async function purgeExpiredBadges() {
  const { data, error } = await supabase.from('app_users').select('id, username, badges, badge_expiry');
  if (error) throw error;
  const now = Date.now();
  const removed = [];
  for (const row of data || []) {
    const expiry = row.badge_expiry && typeof row.badge_expiry === 'object' ? row.badge_expiry : {};
    const gone = Object.keys(expiry).filter((b) => Number(expiry[b]) < now);
    if (gone.length === 0) continue;
    const nextExpiry = { ...expiry };
    gone.forEach((b) => delete nextExpiry[b]);
    const nextBadges = (Array.isArray(row.badges) ? row.badges : []).filter((b) => !gone.includes(b));
    const { error: upErr } = await supabase.from('app_users').update({ badges: nextBadges, badge_expiry: nextExpiry }).eq('id', row.id);
    if (upErr) throw upErr;
    gone.forEach((b) => removed.push({ userId: row.id, username: row.username, badge: b }));
  }
  return removed;
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
async function getWeeklyLeaderboard(since) {
  const cutoff = since || Date.now() - 7 * 24 * 60 * 60 * 1000;

  // İki sorgu birbirine bağımlı değilmiş gibi PARALEL çalıştırılıyor (tüm
  // beğenileri çekip eşleştirmeyi JS tarafında yapıyoruz) — art arda iki ağ
  // isteği yerine tek bir bekleme süresi, admin panelini belirgin hızlandırır.
  const [itemsRes, likesRes] = await Promise.all([
    supabase
      .from('items')
      .select('id, uploader_name, status, created_at')
      .eq('status', 'approved') // bekleyen/reddedilen anılar sayılmaz
      .is('deleted_at', null)
      .gt('created_at', cutoff),
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
  updateTheme,
  setAvatar,
  clearAvatar,
  getAllAvatars,
  canStyleName,
  setNameStyle,
  getUsersByIds,
  findUsersByUsernames,
  searchUsers,
  setBanned,
  listBanned,
  purgeExpiredBadges,
  _fromRow: fromRow,
  getNameChangeInfo,
  renameUser,
  deleteUser,
  setCustomLimits,
  clearCustomLimits,
  listUsersWithCustomLimits,
  grantBadge,
  revokeBadge,
  listUsersWithBadges,
  getWeeklyLeaderboard,
};
