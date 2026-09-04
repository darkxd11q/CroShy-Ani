const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    sizeLimitExempt: !!row.size_limit_exempt,
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
    size_limit_exempt: false,
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

// Admin panelinden bir kullanıcının dosya boyutu sınırını kaldırma/geri getirme
async function setSizeLimitExempt(username, exempt) {
  const normalized = String(username || '').trim().toLowerCase();
  const { data, error } = await supabase
    .from('app_users')
    .update({ size_limit_exempt: !!exempt })
    .eq('username_lower', normalized)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function listExemptUsers() {
  const { data, error } = await supabase.from('app_users').select('*').eq('size_limit_exempt', true);
  if (error) throw error;
  return (data || []).map(fromRow);
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  setSizeLimitExempt,
  listExemptUsers,
};
