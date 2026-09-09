const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    tokenHash: row.token_hash,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    username: row.username,
    role: row.role || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function create({ tokenHash, subjectType, subjectId, username, role, createdAt, expiresAt }) {
  const { error } = await supabase.from('remember_tokens').insert({
    token_hash: tokenHash,
    subject_type: subjectType,
    subject_id: subjectId,
    username,
    role: role || null,
    created_at: createdAt,
    expires_at: expiresAt,
  });
  if (error) throw error;
}

// Süresi geçmemiş bir token bulur; yoksa/süresi geçmişse null döner.
async function findValid(tokenHash) {
  const { data, error } = await supabase
    .from('remember_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.expires_at < Date.now()) {
    // Süresi geçmiş kaydı temizle
    remove(tokenHash).catch(() => {});
    return null;
  }
  return fromRow(data);
}

async function remove(tokenHash) {
  const { error } = await supabase.from('remember_tokens').delete().eq('token_hash', tokenHash);
  if (error) throw error;
}

// Bir kullanıcının/adminin tüm cihazlardaki "beni hatırla" token'larını
// iptal eder (örn. şifre değişince kullanılabilir — şu an çağrılmıyor ama
// ileride kullanılabilir diye hazır).
async function removeAllForSubject(subjectType, subjectId) {
  const { error } = await supabase
    .from('remember_tokens')
    .delete()
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId);
  if (error) throw error;
}

module.exports = { create, findValid, remove, removeAllForSubject };
