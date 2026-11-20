// Giriş denemesi / hız sınırı sayaçlarını sunucu yeniden başlasa da korur (yazma-sonra: arka planda toplu).
// Asıl sayaçlar bellekte kalır (hızlı); değişiklikler 5 sn'de bir veritabanına yazılır, açılışta geri yüklenir.
const supabase = require('./supabaseClient');

const dirty = new Map(); // "name\0key" -> { name, key, state, expires_at }
const removed = new Map(); // "name\0key" -> { name, key }
let lastErrLog = 0;

const id = (name, key) => `${name}\u0000${key}`;

function logErr(where, e) {
  if (Date.now() - lastErrLog > 10 * 60 * 1000) {
    lastErrLog = Date.now();
    console.error(`Sayaç kalıcılığı (${where}) hatası:`, e && e.message ? e.message : e);
  }
}

function save(name, key, state, expiresAt) {
  removed.delete(id(name, key));
  dirty.set(id(name, key), { name, key, state, expires_at: Math.round(expiresAt) });
}

function remove(name, key) {
  dirty.delete(id(name, key));
  removed.set(id(name, key), { name, key });
}

async function flush() {
  const rows = [...dirty.values()];
  const gone = [...removed.values()];
  dirty.clear();
  removed.clear();
  try {
    if (rows.length) {
      const { error } = await supabase.from('rate_state').upsert(rows, { onConflict: 'name,key' });
      if (error) throw error;
    }
    const byName = new Map();
    for (const g of gone) byName.set(g.name, [...(byName.get(g.name) || []), g.key]);
    for (const [name, keys] of byName) {
      const { error } = await supabase.from('rate_state').delete().eq('name', name).in('key', keys);
      if (error) throw error;
    }
  } catch (e) {
    logErr('yazma', e);
  }
}

async function loadAll(name) {
  try {
    const { data, error } = await supabase.from('rate_state').select('key, state').eq('name', name).gt('expires_at', Date.now());
    if (error) throw error;
    return data || [];
  } catch (e) {
    logErr('yükleme', e);
    return [];
  }
}

async function purgeExpired() {
  try {
    const { error } = await supabase.from('rate_state').delete().lt('expires_at', Date.now());
    if (error) throw error;
  } catch (e) {
    logErr('temizlik', e);
  }
}

setInterval(flush, 5000).unref();

module.exports = { save, remove, flush, loadAll, purgeExpired, __dirty: () => [...dirty.values()], __removed: () => [...removed.values()] };
