const supabase = require('./supabaseClient');

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
  const { data, error } = await supabase.from('likes').select('item_id');
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    map[row.item_id] = (map[row.item_id] || 0) + 1;
  }
  return map;
}

// Bir IP'nin hangi öğeleri beğendiğinin kümesi
async function getLikedSetForIp(ip) {
  const { data, error } = await supabase.from('likes').select('item_id').eq('ip', ip);
  if (error) throw error;
  return new Set((data || []).map((r) => r.item_id));
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
  getLikedSetForIp,
  removeAllForItem,
  countLikesForItemIds,
};
