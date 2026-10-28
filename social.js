const supabase = require('./supabaseClient');

// Yorum/tepki veri katmanı
const EMOJIS = ['😂', '😮', '😢', '🔥', '👏', '🎉'];

function commentFromRow(r) {
  return { id: r.id, itemId: r.item_id, userId: r.user_id, body: r.body, createdAt: Number(r.created_at) };
}

async function listComments(itemId, limit = 100) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(commentFromRow);
}

async function addComment({ itemId, userId, body }) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ item_id: itemId, user_id: userId, body, created_at: Date.now() })
    .select()
    .single();
  if (error) throw error;
  return commentFromRow(data);
}

async function getComment(id) {
  const { data, error } = await supabase.from('comments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? commentFromRow(data) : null;
}

async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

// Galeri kartlarındaki "💬 3" sayıları için (tüm anılar; küçük tablo)
async function commentCountsAll() {
  const { data, error } = await supabase.from('comments').select('item_id');
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[r.item_id] = (out[r.item_id] || 0) + 1;
  return out;
}

async function reactionSummary(itemId, userId) {
  const { data, error } = await supabase.from('reactions').select('user_id, emoji').eq('item_id', itemId);
  if (error) throw error;
  const counts = {};
  const mine = [];
  for (const r of data || []) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (userId && r.user_id === userId) mine.push(r.emoji);
  }
  return { counts, mine };
}

async function toggleReaction(itemId, userId, emoji) {
  const { data: existing, error } = await supabase
    .from('reactions')
    .select('emoji')
    .eq('item_id', itemId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    const { error: delErr } = await supabase.from('reactions').delete().eq('item_id', itemId).eq('user_id', userId).eq('emoji', emoji);
    if (delErr) throw delErr;
    return { active: false };
  }
  const { error: insErr } = await supabase.from('reactions').insert({ item_id: itemId, user_id: userId, emoji, created_at: Date.now() });
  if (insErr && insErr.code !== '23505') throw insErr;
  return { active: true };
}

async function removeAllForItem(itemId) {
  await supabase.from('comments').delete().eq('item_id', itemId);
  await supabase.from('reactions').delete().eq('item_id', itemId);
}

module.exports = {
  EMOJIS,
  listComments,
  addComment,
  getComment,
  deleteComment,
  commentCountsAll,
  reactionSummary,
  toggleReaction,
  removeAllForItem,
};
