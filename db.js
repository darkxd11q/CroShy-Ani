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

async function getPendingItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function getApprovedItems() {
  const { data, error } = await supabase.from('items').select('*').eq('status', 'approved');
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function getApprovedCount() {
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');
  if (error) throw error;
  return count || 0;
}

async function getItemById(id) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function getPendingItemsByIp(ip) {
  const { data, error } = await supabase.from('items').select('*').eq('status', 'pending').eq('ip', ip);
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

async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  getPendingItems,
  getApprovedItems,
  getApprovedCount,
  getItemById,
  getPendingItemsByIp,
  insertItem,
  approveItem,
  deleteItem,
};
