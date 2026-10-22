const supabase = require('./supabaseClient');

function fromRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    message: r.message,
    status: r.status,
    createdAt: Number(r.created_at),
    reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : null,
    thanksSeen: !!r.thanks_seen,
  };
}

async function create({ userId, username, message }) {
  const { error } = await supabase
    .from('feedback')
    .insert({ user_id: userId, username, message, status: 'pending', created_at: Date.now(), thanks_seen: true });
  if (error) throw error;
}

async function countRecent(userId, since) {
  const { count, error } = await supabase
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', since);
  if (error) throw error;
  return count || 0;
}

async function listForAdmin(limit = 60) {
  const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const list = (data || []).map(fromRow);
  // Bekleyenler en üstte
  return list.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.createdAt - a.createdAt);
}

async function getById(id) {
  const { data, error } = await supabase.from('feedback').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// approved/loved olunca kullanıcı bir sonraki girişinde teşekkür ekranını görür.
async function setStatus(id, status) {
  const thanks = status === 'approved' || status === 'loved';
  const { error } = await supabase
    .from('feedback')
    .update({ status, reviewed_at: Date.now(), thanks_seen: !thanks })
    .eq('id', id);
  if (error) throw error;
}

async function getUnseenThanks(userId) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('thanks_seen', false)
    .in('status', ['approved', 'loved'])
    .order('reviewed_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function markThanksSeen(userId) {
  const { error } = await supabase.from('feedback').update({ thanks_seen: true }).eq('user_id', userId).eq('thanks_seen', false);
  if (error) throw error;
}

async function deleteForUser(userId) {
  const { error } = await supabase.from('feedback').delete().eq('user_id', userId);
  if (error) throw error;
}

module.exports = { create, countRecent, listForAdmin, getById, setStatus, getUnseenThanks, markThanksSeen, deleteForUser };
