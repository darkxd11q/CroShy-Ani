const supabase = require('./supabaseClient');
const { fetchAll } = require('./pager');

// Yorum/tepki veri katmanı
const EMOJIS = ['😂', '😮', '😢', '🔥', '👏', '🎉', '😍', '🥹', '😡', '🤯', '💀', '👀', '🙌', '💯', '🤝', '🥳'];

function commentFromRow(r) {
  return {
    id: r.id, itemId: r.item_id, userId: r.user_id, body: r.body, createdAt: Number(r.created_at),
    parentId: r.parent_id || null, pinnedAt: r.pinned_at ? Number(r.pinned_at) : null,
  };
}

async function listComments(itemId, limit = 300) {
  const { data, error } = await supabase.from('comments').select('*').eq('item_id', itemId).order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  return (data || []).map(commentFromRow);
}

async function addComment({ itemId, userId, body, parentId }) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ item_id: itemId, user_id: userId, body, created_at: Date.now(), parent_id: parentId || null })
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

// Üst yorum silinirse yanıtları da silinir
async function deleteComment(id) {
  const rep = await supabase.from('comments').delete().eq('parent_id', id);
  if (rep.error) throw rep.error;
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

// Bir anıda aynı anda yalnızca BİR yorum sabit kalır
async function setPinned(itemId, commentId) {
  const clear = await supabase.from('comments').update({ pinned_at: null }).eq('item_id', itemId).not('pinned_at', 'is', null);
  if (clear.error) throw clear.error;
  if (commentId) {
    const { error } = await supabase.from('comments').update({ pinned_at: Date.now() }).eq('id', commentId).eq('item_id', itemId);
    if (error) throw error;
  }
}

// Galeri kartlarındaki "💬 3" sayıları için (tüm anılar)
async function commentCountsAll() {
  const out = {};
  try {
    const rows = await fetchAll(supabase, 'comment_counts', 'item_id, cnt', (q) => q.order('item_id'));
    for (const r of rows) out[r.item_id] = Number(r.cnt);
  } catch (e) {
    const rows = await fetchAll(supabase, 'comments', 'item_id', (q) => q.order('id'));
    for (const r of rows) out[r.item_id] = (out[r.item_id] || 0) + 1;
  }
  return out;
}

// { itemId: { '😂': 4, '🔥': 2 } } — kartlarda en çok verilen 2 emojiyi göstermek için
async function reactionCountsAll() {
  const out = {};
  try {
    const rows = await fetchAll(supabase, 'reaction_counts', 'item_id, emoji, cnt', (q) => q.order('item_id').order('emoji'));
    for (const r of rows) (out[r.item_id] = out[r.item_id] || {})[r.emoji] = Number(r.cnt);
  } catch (e) {
    const rows = await fetchAll(supabase, 'reactions', 'item_id, emoji', (q) => q.order('item_id').order('user_id').order('emoji'));
    for (const r of rows) {
      const m = (out[r.item_id] = out[r.item_id] || {});
      m[r.emoji] = (m[r.emoji] || 0) + 1;
    }
  }
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
  const { data: existing, error } = await supabase.from('reactions').select('emoji').eq('item_id', itemId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
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

module.exports = { EMOJIS, listComments, addComment, getComment, deleteComment, setPinned, commentCountsAll, reactionCountsAll, reactionSummary, toggleReaction, removeAllForItem };
