// Kurtarma kodları: e-posta olmadan, kullanıcının KENDİ başına şifre sıfırlaması için.
// Kayıtta 8 tek kullanımlık kod verilir; sunucuda yalnızca scrypt ile özetlenmiş hali durur.
const crypto = require('crypto');
const { promisify } = require('util');
const supabase = require('./supabaseClient');

const scrypt = promisify(crypto.scrypt);
// Karıştırılan harfler (0/O, 1/I/L) yok: elle yazarken hata olmasın
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 10; // 10 karakter ≈ 50 bit
const CODE_COUNT = 8;

function generateCodes(n = CODE_COUNT) {
  const out = new Set();
  while (out.size < n) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
    out.add(c);
  }
  return [...out];
}

const formatCode = (raw) => raw.slice(0, 5) + '-' + raw.slice(5);
// Kullanıcı küçük harfle/tiresiz/boşluklu yazsa da kabul edilir
const normalizeCode = (input) => String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function hashCode(raw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(raw, salt, 32);
  return salt.toString('base64') + ':' + hash.toString('base64');
}
async function verifyCode(raw, stored) {
  const [salt, hash] = String(stored).split(':');
  const expected = Buffer.from(hash || '', 'base64');
  const actual = await scrypt(raw, Buffer.from(salt || '', 'base64'), 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Yeni bir set oluşturur; eski (kullanılmamış/kullanılmış) tüm kodlar geçersiz olur. Açık halleri döndürür.
async function createSet(userId) {
  const codes = generateCodes();
  const rows = await Promise.all(
    codes.map(async (c) => ({ user_id: userId, code_hash: await hashCode(c), created_at: Date.now() }))
  );
  const del = await supabase.from('recovery_codes').delete().eq('user_id', userId);
  if (del.error) throw del.error;
  const ins = await supabase.from('recovery_codes').insert(rows);
  if (ins.error) throw ins.error;
  return codes.map(formatCode);
}

async function countUnused(userId) {
  const { count, error } = await supabase
    .from('recovery_codes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);
  if (error) throw error;
  return count || 0;
}

// Kodu doğrular ve TEK SEFERLİK tüketir (aynı anda iki istek gelse yalnızca biri başarılı olur).
async function consume(userId, input) {
  const norm = normalizeCode(input);
  if (norm.length !== CODE_LEN) return false;
  const { data, error } = await supabase.from('recovery_codes').select('id, code_hash').eq('user_id', userId).is('used_at', null);
  if (error) throw error;
  for (const row of data || []) {
    if (await verifyCode(norm, row.code_hash)) {
      const upd = await supabase.from('recovery_codes').update({ used_at: Date.now() }).eq('id', row.id).is('used_at', null).select();
      if (upd.error) throw upd.error;
      return (upd.data || []).length === 1;
    }
  }
  return false;
}

// Kullanıcı yoksa da aynı işi yapıp zamanlama farkından kullanıcı adı sızmasın
async function dummyWork() {
  await verifyCode('AAAAAAAAAA', await hashCode('BBBBBBBBBB'));
}

async function deleteForUser(userId) {
  const { error } = await supabase.from('recovery_codes').delete().eq('user_id', userId);
  if (error) throw error;
}

module.exports = { ALPHABET, CODE_LEN, CODE_COUNT, generateCodes, formatCode, normalizeCode, hashCode, verifyCode, createSet, countUnused, consume, dummyWork, deleteForUser };
