const supabase = require('./supabaseClient');
const { fetchAll } = require('./pager');

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
    rejectReason: row.reject_reason || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
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
    tags: item.tags || [],
  };
}

// Aşağıdaki tüm "normal" sorgular (pending/approved/tek öğe/kullanıcının
// öğeleri) yumuşak silinmiş (deleted_at dolu) öğeleri hariç tutar — silinen
// bir şey, kalıcı temizlik süresi dolana kadar hiçbir listede görünmez,
// sadece admin'in "Son Silinenler" ekranında geri alınabilir durumda kalır.

async function getPendingItems() {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.eq('status', 'pending').is('deleted_at', null).order('created_at', { ascending: true }).order('id'));
  return rows.map(fromRow);
}

async function getApprovedItems() {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.eq('status', 'approved').is('deleted_at', null).order('created_at', { ascending: true }).order('id'));
  return rows.map(fromRow);
}

// Admin paneli için sayfalı + aranabilir onaylı anı listesi (hepsini çekmez)
async function listApprovedPage({ offset = 0, limit = 40, q = '' } = {}) {
  let query = supabase.from('items').select('*', { count: 'exact' }).eq('status', 'approved').is('deleted_at', null);
  const term = String(q || '').trim().replace(/[%,()*\\]/g, '').slice(0, 40);
  if (term) query = query.or(`uploader_name.ilike.%${term}%,caption.ilike.%${term}%`);
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  return { items: (data || []).map(fromRow), total: count || 0 };
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
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.eq('status', 'pending').eq('ip', ip).is('deleted_at', null).order('id'));
  return rows.map(fromRow);
}

async function insertItem(item) {
  const { error } = await supabase.from('items').insert(toRow(item));
  if (error) throw error;
}

async function approveItem(id) {
  const { error } = await supabase.from('items').update({ status: 'approved' }).eq('id', id).eq('status', 'pending');
  if (error) throw error;
}

async function getItemsByUserId(userId) {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.eq('user_id', userId).is('deleted_at', null).neq('status', 'draft').order('created_at', { ascending: false }).order('id'));
  return rows.map(fromRow);
}

// deleted_at durumuna bakmaksızın ham kaydı getirir — sadece geri alma
// (restore) işleminden önce "gerçekten silinmiş mi" diye doğrulamak için.
async function getAnyItemById(id) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// "Rastgele anı" için: onaylı anılardan rastgele birinin kimliği
async function getRandomApprovedId() {
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('deleted_at', null);
  if (error) throw error;
  if (!count) return null;
  const offset = Math.floor(Math.random() * count);
  const { data, error: e2 } = await supabase
    .from('items')
    .select('id')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range(offset, offset);
  if (e2) throw e2;
  return data && data.length ? data[0].id : null;
}

// ---------- Yumuşak silme / geri alma ----------

async function softDeleteItem(id, reason) {
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: Date.now(), reject_reason: reason ? String(reason).slice(0, 200) : null })
    .eq('id', id);
  if (error) throw error;
}

async function restoreItem(id) {
  const { error } = await supabase.from('items').update({ deleted_at: null, reject_reason: null }).eq('id', id);
  if (error) throw error;
}

// Admin'in "Son Silinenler" ekranında gösterdiği, henüz kalıcı olarak
// temizlenmemiş (24 saati doldurmamış) silinmiş öğeler.
async function getDeletedItems() {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).order('id'));
  return rows.map(fromRow);
}

// 24 saati dolmuş, artık kalıcı olarak temizlenmesi gereken öğeler.
async function getExpiredDeletedItems(cutoffMs) {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.not('deleted_at', 'is', null).lt('deleted_at', cutoffMs).order('id'));
  return rows.map(fromRow);
}

// Kalıcı silme — sadece süresi dolmuş silinenleri temizlerken kullanılır.
async function hardDeleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Taslaklar (status = 'draft'): yayınlanana kadar kimseye görünmez, günlük hakka sayılmaz ----------
async function getDraftsByUserId(userId) {
  const { data, error } = await supabase.from('items').select('*').eq('user_id', userId).eq('status', 'draft').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}
async function countDrafts(userId) {
  const { count, error } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'draft');
  if (error) throw error;
  return count || 0;
}
async function getDraft(id, userId) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).eq('user_id', userId).eq('status', 'draft').maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}
async function updateDraft(id, userId, { caption, tags }) {
  const { error } = await supabase.from('items').update({ caption, tags }).eq('id', id).eq('user_id', userId).eq('status', 'draft');
  if (error) throw error;
}
// Yayınlar: taslak -> onay bekleyen; sıralamada yeni görünsün diye tarih güncellenir. Taslak değilse false.
async function publishDraft(id, userId) {
  const { data, error } = await supabase
    .from('items')
    .update({ status: 'pending', created_at: Date.now() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'draft')
    .select('id');
  if (error) throw error;
  return (data || []).length === 1;
}
async function deleteDraft(id, userId) {
  const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId).eq('status', 'draft');
  if (error) throw error;
}
async function getExpiredDrafts(cutoffMs) {
  const rows = await fetchAll(supabase, 'items', '*', (q) => q.eq('status', 'draft').lt('created_at', cutoffMs).order('id'));
  return rows.map(fromRow);
}

module.exports = {
  getPendingItems,
  getApprovedItems,
  listApprovedPage,
  getDraftsByUserId,
  countDrafts,
  getDraft,
  updateDraft,
  publishDraft,
  deleteDraft,
  getExpiredDrafts,
  getApprovedCount,
  getItemById,
  getPendingItemsByIp,
  getItemsByUserId,
  getAnyItemById,
  getRandomApprovedId,
  insertItem,
  approveItem,
  softDeleteItem,
  restoreItem,
  getDeletedItems,
  getExpiredDeletedItems,
  hardDeleteItem,
};
