const supabase = require('./supabaseClient');

function fromRow(r) {
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    passwordHash: r.password_hash,
    totpSecret: r.totp_secret || null,
    totpEnabled: !!r.totp_enabled,
    disabled: !!r.disabled,
    mustChangePassword: !!r.must_change_password,
    createdAt: Number(r.created_at),
    lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null,
  };
}

// adminId -> son "oturumları iptal et" zamanı (şifre sıfırlama/devre dışı bırakma/silme).
// Bu zamandan önce açılmış oturumlar bir sonraki istekte kapatılır.
const revokedAt = new Map();

async function findByUsername(username) {
  const lower = String(username || '').trim().toLowerCase();
  if (!lower) return null;
  const { data, error } = await supabase.from('admins').select('*').eq('username_lower', lower).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function findById(id) {
  const { data, error } = await supabase.from('admins').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function list() {
  const { data, error } = await supabase.from('admins').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function create({ id, username, role, passwordHash, mustChangePassword }) {
  const { error } = await supabase.from('admins').insert({
    id,
    username,
    username_lower: username.toLowerCase(),
    password_hash: passwordHash,
    role,
    must_change_password: !!mustChangePassword,
    created_at: Date.now(),
  });
  if (error) {
    if (error.code === '23505') {
      const e = new Error('Bu yönetici adı zaten var.');
      e.code = 'DUPLICATE';
      throw e;
    }
    throw error;
  }
}

async function update(id, patch) {
  const { error } = await supabase.from('admins').update(patch).eq('id', id);
  if (error) throw error;
}

const updatePassword = (id, passwordHash, mustChange) => update(id, { password_hash: passwordHash, must_change_password: !!mustChange });
const setDisabled = (id, disabled) => update(id, { disabled: !!disabled });
const setTotp = (id, { secretEnc, enabled }) => update(id, { totp_secret: secretEnc || null, totp_enabled: !!enabled });
const touchLogin = (id) => update(id, { last_login_at: Date.now() });

async function remove(id) {
  const { error } = await supabase.from('admins').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { revokedAt, findByUsername, findById, list, create, updatePassword, setDisabled, setTotp, touchLogin, remove };
