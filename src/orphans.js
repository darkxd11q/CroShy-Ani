// Yetim yükleme temizliği: Cloudinary'e yüklenip hiçbir anıya/profile bağlanmamış dosyaları siler
// (örn. yükleyip gönderme adımını yarıda bırakanlar, kural dışı büyük yüklemeler).
// GÜVENLİK İÇİN VARSAYILAN KAPALIDIR:
//   ORPHAN_CLEANUP=dry -> sadece neleri sileceğini loglar
//   ORPHAN_CLEANUP=on  -> gerçekten siler (günde en fazla 100 dosya, 48 saatten eski olanlar)
// Yalnızca "croshy/" klasöründeki (imzalı yüklemelerle gelen) dosyalara dokunur.
const supabase = require('../supabaseClient');
const cloudinary = require('cloudinary').v2;

const HOUR = 60 * 60 * 1000;

// Supabase tek sorguda en fazla 1000 satır döndürür: HEPSİNİ sayfa sayfa çek (eksik liste = yanlış silme!)
async function fetchAll(table, column, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(column).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function referencedPublicIds() {
  const [items, avatars] = await Promise.all([
    fetchAll('items', 'public_id'), // silinmiş (yumuşak) olanlar dahil: onları temizlik işi siler
    fetchAll('app_users', 'avatar_public_id', (q) => q.not('avatar_public_id', 'is', null)),
  ]);
  return new Set([...items.map((r) => r.public_id), ...avatars.map((r) => r.avatar_public_id)].filter(Boolean));
}

async function purgeOrphanUploads() {
  const mode = process.env.ORPHAN_CLEANUP;
  if (mode !== 'on' && mode !== 'dry') return;
  try {
    const referenced = await referencedPublicIds();
    if (referenced.size === 0) {
      console.warn('Yetim temizliği atlandı: referans listesi boş (güvenlik).');
      return;
    }
    const cutoff = Date.now() - 48 * HOUR;
    let found = 0;
    let deleted = 0;
    for (const resourceType of ['image', 'video']) {
      let cursor;
      for (let page = 0; page < 5; page++) {
        const res = await cloudinary.api.resources({ type: 'upload', prefix: 'croshy/', resource_type: resourceType, max_results: 500, next_cursor: cursor });
        for (const r of res.resources || []) {
          if (referenced.has(r.public_id)) continue;
          if (new Date(r.created_at).getTime() > cutoff) continue;
          found++;
          if (mode === 'on' && deleted < 100) {
            await cloudinary.uploader.destroy(r.public_id, { resource_type: resourceType });
            deleted++;
          } else if (mode === 'dry') {
            console.log('[yetim-dosya, silinmedi]', resourceType, r.public_id);
          }
        }
        cursor = res.next_cursor;
        if (!cursor) break;
      }
    }
    console.log(`🧹 Yetim yükleme taraması: ${found} bulundu, ${deleted} silindi (mod: ${mode}).`);
  } catch (e) {
    console.error('Yetim temizliği hatası:', e.message);
  }
}

module.exports = { purgeOrphanUploads, fetchAll };
