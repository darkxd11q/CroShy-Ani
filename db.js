const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    id: row.id,
    url: row.url,
    publicId: row.public_id,
    type: row.type,
    uploaderName: row.uploader_name,
    userId: row.user_id,
    ip: row.ip,
    caption: row.caption,
    status: row.status,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || null,
  };
}

function toRow(item) {
  return {
    id: item.id,
    url: item.url,
    public_id: item.publicId,
    type: item.type,
    uploader_name: item.uploaderName,
    user_id: item.userId,
    ip: item.ip,
    caption: item.caption,
    status: item.status,
    created_at: item.createdAt,
  };
}

// Aşağıdaki tüm "normal" sorgular (pending/approved/tek öğe/kullanıcının
// öğeleri) yumuşak silinmiş (deleted_at dolu) öğeleri hariç tutar — silinen
// bir şey, kalıcı temizlik süresi dolana kadar hiçbir listede görünmez,
// sadece admin'in "Son Silinenler" ekranında geri alınabilir durumda kalır.

async function getPendingItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function getApprovedItems() {
  const { data, error } = await supabase.from('items').select('*').eq('status', 'approved').is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function getApprovedCount() {
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('deleted_at', null);
  if (error) throw error;
  return count || 0;
}

async function getItemById(id) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function getPendingItemsByIp(ip) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'pending')
    .eq('ip', ip)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function insertItem(item) {
  const { error } = await supabase.from('items').insert(toRow(item));
  if (error) throw error;
}

async function approveItem(id) {
  const { error } = await supabase.from('items').update({ status: 'approved' }).eq('id', id);
  if (error) throw error;
}

async function getItemsByUserId(userId) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// deleted_at durumuna bakmaksızın ham kaydı getirir — sadece geri alma
// (restore) işleminden önce "gerçekten silinmiş mi" diye doğrulamak için.
async function getAnyItemById(id) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// ---------- Yumuşak silme / geri alma ----------

async function softDeleteItem(id) {
  const { error } = await supabase.from('items').update({ deleted_at: Date.now() }).eq('id', id);
  if (error) throw error;
}

async function restoreItem(id) {
  const { error } = await supabase.from('items').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

// Admin'in "Son Silinenler" ekranında gösterdiği, henüz kalıcı olarak
// temizlenmemiş (24 saati doldurmamış) silinmiş öğeler.
async function getDeletedItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// 24 saati dolmuş, artık kalıcı olarak temizlenmesi gereken öğeler.
async function getExpiredDeletedItems(cutoffMs) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffMs);
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Kalıcı silme — sadece süresi dolmuş silinenleri temizlerken kullanılır.
async function hardDeleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  getPendingItems,
  getApprovedItems,
  getApprovedCount,
  getItemById,
  getPendingItemsByIp,
  getItemsByUserId,
  getAnyItemById,
  insertItem,
  approveItem,
  softDeleteItem,
  restoreItem,
  getDeletedItems,
  getExpiredDeletedItems,
  hardDeleteItem,
};
