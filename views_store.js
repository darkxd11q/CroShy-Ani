const supabase = require('./supabaseClient');

// Bir IP'nin daha önce gördüğü anı id'lerinin kümesi
async function getSeenSetForIp(ip) {
  const { data, error } = await supabase.from('media_views').select('item_id').eq('ip', ip);
  if (error) throw error;
  return new Set((data || []).map((r) => r.item_id));
}

// Bir grup anıyı bu IP için "görüldü" olarak işaretle (var olanları yok sayar)
async function markSeen(itemIds, ip) {
  if (!itemIds || itemIds.length === 0) return;
  const rows = itemIds.map((id) => ({ item_id: id, ip, ts: Date.now() }));
  const { error } = await supabase
    .from('media_views')
    .upsert(rows, { onConflict: 'item_id,ip', ignoreDuplicates: true });
  if (error) throw error;
}

// Bir anı reddedilip silindiğinde onun görüntülenme kayıtlarını da temizle
async function removeAllForItem(itemId) {
  const { error } = await supabase.from('media_views').delete().eq('item_id', itemId);
  if (error) throw error;
}

module.exports = { getSeenSetForIp, markSeen, removeAllForItem };
