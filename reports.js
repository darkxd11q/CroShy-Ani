const supabase = require('./supabaseClient');

const REASONS = {
  uygunsuz: 'Uygunsuz içerik',
  spam: 'Spam / reklam',
  taciz: 'Taciz / nefret söylemi',
  telif: 'Telif / izinsiz paylaşım',
  kisisel: 'Kişisel bilgi / gizlilik',
  diger: 'Diğer',
};

async function create({ itemId, commentId, reporterId, reason, details }) {
  const { error } = await supabase.from('reports').insert({
    item_id: itemId,
    comment_id: commentId || null,
    reporter_id: reporterId,
    reason,
    details: details ? String(details).slice(0, 300) : null,
    status: 'open',
    created_at: Date.now(),
  });
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
}

// Açık şikayetleri hedef (anı/yorum) bazında gruplar; en çok şikayet alan önde.
async function listGroupedForAdmin(limit = 300) {
  const { data, error } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  const commentIds = [...new Set(rows.map((r) => r.comment_id).filter(Boolean))];
  const [items, comments] = await Promise.all([
    supabase.from('items').select('id, url, type, caption, uploader_name, status, deleted_at').in('id', itemIds),
    commentIds.length ? supabase.from('comments').select('id, body, user_id').in('id', commentIds) : Promise.resolve({ data: [] }),
  ]);
  const itemMap = new Map((items.data || []).map((i) => [i.id, i]));
  const commentRows = comments.data || [];
  const commentMap = new Map(commentRows.map((c) => [c.id, c]));
  const authorIds = [...new Set(commentRows.map((c) => c.user_id))];
  const authors = authorIds.length ? (await supabase.from('app_users').select('id, username').in('id', authorIds)).data || [] : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.username]));

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.item_id}:${r.comment_id || 0}`;
    if (!groups.has(key)) {
      const item = itemMap.get(r.item_id) || null;
      const c = r.comment_id ? commentMap.get(r.comment_id) : null;
      groups.set(key, {
        itemId: r.item_id,
        commentId: r.comment_id || null,
        count: 0,
        reasons: {},
        details: [],
        firstAt: Number(r.created_at),
        item: item && !item.deleted_at ? { id: item.id, url: item.url, type: item.type, caption: item.caption, uploaderName: item.uploader_name } : null,
        itemGone: !item || !!item.deleted_at,
        comment: c ? { id: c.id, body: c.body, username: authorMap.get(c.user_id) || 'silinmiş hesap' } : null,
        commentGone: !!r.comment_id && !c,
      });
    }
    const g = groups.get(key);
    g.count += 1;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.details) g.details.push(r.details);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);
}

// Bir hedefe ait tüm açık şikayetleri kapatır ve şikayet edenlerin kimliklerini döndürür.
async function closeTarget({ itemId, commentId }, status, by) {
  let q = supabase.from('reports').select('reporter_id').eq('item_id', itemId).eq('status', 'open');
  q = commentId ? q.eq('comment_id', commentId) : q.is('comment_id', null);
  const { data, error } = await q;
  if (error) throw error;
  let u = supabase.from('reports').update({ status, resolved_by: by, resolved_at: Date.now() }).eq('item_id', itemId).eq('status', 'open');
  u = commentId ? u.eq('comment_id', commentId) : u.is('comment_id', null);
  const { error: upErr } = await u;
  if (upErr) throw upErr;
  return [...new Set((data || []).map((r) => r.reporter_id))];
}

async function openCount() {
  const { count, error } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open');
  if (error) throw error;
  return count || 0;
}

module.exports = { REASONS, create, listGroupedForAdmin, closeTarget, openCount };
