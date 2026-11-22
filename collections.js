// Anı koleksiyonları ("kaydetme listeleri"): kullanıcıya özel, sadece sahibi görür.
const supabase = require('./supabaseClient');
const { fetchAll } = require('./pager');

const MAX_LISTS = 20;
const MAX_ITEMS = 500;
const NAME_MAX = 30;
const lc = (s) => String(s).toLocaleLowerCase('tr');
const cleanName = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
const httpErr = (status, message) => Object.assign(new Error(message), { status });

async function lists(userId) {
  const { data, error } = await supabase.from('collections').select('*').eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.name, createdAt: Number(r.created_at) }));
}

// Kullanıcının tüm listelerindeki satırlar: [{ collection_id, item_id, added_at }]
async function rowsFor(collectionIds) {
  if (!collectionIds.length) return [];
  return fetchAll(supabase, 'collection_items', 'collection_id, item_id, added_at', (q) => q.in('collection_id', collectionIds).order('collection_id').order('item_id'));
}

async function getOwned(userId, id) {
  const { data, error } = await supabase.from('collections').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name } : null;
}

async function create(userId, name) {
  const n = cleanName(name);
  if (!n) throw httpErr(400, 'Liste adı gerekli.');
  const existing = await lists(userId);
  if (existing.length >= MAX_LISTS) throw httpErr(409, `En fazla ${MAX_LISTS} liste oluşturabilirsin.`);
  const { data, error } = await supabase.from('collections').insert({ user_id: userId, name: n, name_lower: lc(n), created_at: Date.now() }).select().single();
  if (error) {
    if (error.code === '23505') throw httpErr(409, 'Bu adda bir listen zaten var.');
    throw error;
  }
  return { id: data.id, name: data.name };
}

async function rename(userId, id, name) {
  const n = cleanName(name);
  if (!n) throw httpErr(400, 'Liste adı gerekli.');
  if (!(await getOwned(userId, id))) throw httpErr(404, 'Liste bulunamadı.');
  const { error } = await supabase.from('collections').update({ name: n, name_lower: lc(n) }).eq('id', id).eq('user_id', userId);
  if (error) {
    if (error.code === '23505') throw httpErr(409, 'Bu adda bir listen zaten var.');
    throw error;
  }
}

async function remove(userId, id) {
  const { error } = await supabase.from('collections').delete().eq('id', id).eq('user_id', userId); // satırlar CASCADE ile silinir
  if (error) throw error;
}

async function addItem(userId, id, itemId) {
  if (!(await getOwned(userId, id))) throw httpErr(404, 'Liste bulunamadı.');
  const { data: item } = await supabase.from('items').select('id, status, deleted_at').eq('id', itemId).maybeSingle();
  if (!item || item.status !== 'approved' || item.deleted_at) throw httpErr(404, 'Anı bulunamadı.');
  const { count } = await supabase.from('collection_items').select('*', { count: 'exact', head: true }).eq('collection_id', id);
  if ((count || 0) >= MAX_ITEMS) throw httpErr(409, `Bir listede en fazla ${MAX_ITEMS} anı olabilir.`);
  const { error } = await supabase.from('collection_items').upsert({ collection_id: id, item_id: itemId, added_at: Date.now() }, { onConflict: 'collection_id,item_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function removeItem(userId, id, itemId) {
  if (!(await getOwned(userId, id))) throw httpErr(404, 'Liste bulunamadı.');
  const { error } = await supabase.from('collection_items').delete().eq('collection_id', id).eq('item_id', itemId);
  if (error) throw error;
}

// Varsa kaldırır, yoksa ekler. { saved } döner.
async function toggleItem(userId, id, itemId) {
  if (!(await getOwned(userId, id))) throw httpErr(404, 'Liste bulunamadı.');
  const { data } = await supabase.from('collection_items').select('item_id').eq('collection_id', id).eq('item_id', itemId).maybeSingle();
  if (data) {
    await removeItem(userId, id, itemId);
    return { saved: false };
  }
  await addItem(userId, id, itemId);
  return { saved: true };
}

// Hangi listelerde bu anı var? -> Set(collectionId)
async function membership(userId, itemId) {
  const mine = await lists(userId);
  if (!mine.length) return new Set();
  const { data, error } = await supabase.from('collection_items').select('collection_id').eq('item_id', itemId).in('collection_id', mine.map((l) => l.id));
  if (error) throw error;
  return new Set((data || []).map((r) => r.collection_id));
}

// Kullanıcının herhangi bir listesine kaydettiği tüm anılar (galeride 🔖 dolu göstermek için)
async function savedItemIds(userId) {
  const mine = await lists(userId);
  const rows = await rowsFor(mine.map((l) => l.id));
  return new Set(rows.map((r) => r.item_id));
}

async function ensureDefault(userId) {
  const mine = await lists(userId);
  const found = mine.find((l) => lc(l.name) === 'favoriler');
  return found || create(userId, 'Favoriler');
}

async function deleteForUser(userId) {
  const { error } = await supabase.from('collections').delete().eq('user_id', userId);
  if (error) throw error;
}

module.exports = { MAX_LISTS, MAX_ITEMS, lists, rowsFor, getOwned, create, rename, remove, addItem, removeItem, toggleItem, membership, savedItemIds, ensureDefault, deleteForUser };
