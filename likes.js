const supabase = require('./supabaseClient');
const { fetchAll } = require('./pager');

async function countLikes(itemId) {
  const { count, error } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', itemId);
  if (error) throw error;
  return count || 0;
}

// Beğeniyi açar/kapatır (toggle), yeni durumu ve güncel sayacı döndürür
async function toggleLike(itemId, ip) {
  const { data: existing, error: selErr } = await supabase
    .from('likes')
    .select('*')
    .eq('item_id', itemId)
    .eq('ip', ip)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabase.from('likes').delete().eq('item_id', itemId).eq('ip', ip);
    if (error) throw error;
    return { liked: false, count: await countLikes(itemId) };
  }

  const { error } = await supabase.from('likes').insert({ item_id: itemId, ip, ts: Date.now() });
  if (error) throw error;
  return { liked: true, count: await countLikes(itemId) };
}

// Tüm öğeler için toplu beğeni sayısı haritası (N sorgu yerine tek okuma)
async function getAllCounts() {
  const map = {};
  try {
    // Özet görünüm: öğe başına tek satır (migration 006)
    const rows = await fetchAll(supabase, 'like_counts', 'item_id, cnt', (q) => q.order('item_id'));
    for (const r of rows) map[r.item_id] = Number(r.cnt);
    return map;
  } catch (e) {
    // Görünüm henüz yoksa: tüm beğenileri sayfa sayfa sayarak yedekle
    const rows = await fetchAll(supabase, 'likes', 'item_id', (q) => q.order('item_id').order('ip'));
    for (const r of rows) map[r.item_id] = (map[r.item_id] || 0) + 1;
    return map;
  }
}

// Belirli öğeler için beğeni sayıları (sayfalı listeler / admin için)
async function countsForItemIds(ids) {
  const list = [...new Set(ids || [])];
  const map = {};
  if (list.length === 0) return map;
  try {
    const rows = await fetchAll(supabase, 'like_counts', 'item_id, cnt', (q) => q.in('item_id', list).order('item_id'));
    for (const r of rows) map[r.item_id] = Number(r.cnt);
  } catch (e) {
    const rows = await fetchAll(supabase, 'likes', 'item_id', (q) => q.in('item_id', list).order('item_id').order('ip'));
    for (const r of rows) map[r.item_id] = (map[r.item_id] || 0) + 1;
  }
  return map;
}

// Bir IP'nin hangi öğeleri beğendiğinin kümesi
async function getLikedSetForIp(ip) {
  const rows = await fetchAll(supabase, 'likes', 'item_id', (q) => q.eq('ip', ip).order('item_id'));
  return new Set(rows.map((r) => r.item_id));
}

// Bir öğe tamamen silindiğinde (reddedildiğinde) beğenilerini de temizle
async function removeAllForItem(itemId) {
  const { error } = await supabase.from('likes').delete().eq('item_id', itemId);
  if (error) throw error;
}

// Belirli bir öğe id listesi için toplam beğeni sayısı (profil istatistikleri için)
async function countLikesForItemIds(itemIds) {
  if (!itemIds || itemIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .in('item_id', itemIds);
  if (error) throw error;
  return count || 0;
}

module.exports = {
  countLikes,
  toggleLike,
  getAllCounts,
  countsForItemIds,
  getLikedSetForIp,
  removeAllForItem,
  countLikesForItemIds,
};
