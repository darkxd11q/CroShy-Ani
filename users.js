const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    bio: row.bio || '',
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

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  updatePasswordHash,
  updateBio,
  setCustomLimits,
  clearCustomLimits,
  listUsersWithCustomLimits,
};
