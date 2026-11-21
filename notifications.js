const supabase = require('./supabaseClient');

function fromRow(r) {
  return { id: r.id, type: r.type, text: r.text, link: r.link || null, createdAt: Number(r.created_at), read: !!r.read };
}

async function create({ userId, type, text, link, dedupeKey }) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    text: String(text).slice(0, 300),
    link: link || null,
    created_at: Date.now(),
    read: false,
    dedupe_key: dedupeKey || null,
  });
  if (error && error.code === '23505') return false; // aynı bildirim zaten var: sessizce geç
  if (error) throw error;
  return true;
}

async function list(userId, limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function unreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
  return count || 0;
}

async function markAllRead(userId) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
}

async function deleteForUser(userId) {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
}

// Okunmuş bildirimler 60 gün, okunmamışlar 180 gün sonra silinir (tablo sonsuz büyümesin)
async function purgeOld() {
  const DAY = 24 * 60 * 60 * 1000;
  const a = await supabase.from('notifications').delete().eq('read', true).lt('created_at', Date.now() - 60 * DAY);
  if (a.error) throw a.error;
  const b = await supabase.from('notifications').delete().lt('created_at', Date.now() - 180 * DAY);
  if (b.error) throw b.error;
}

module.exports = { create, list, unreadCount, markAllRead, deleteForUser, purgeOld };
