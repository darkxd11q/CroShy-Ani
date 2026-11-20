// Supabase/PostgREST tek sorguda varsayılan olarak EN FAZLA 1000 satır döndürür; fazlası sessizce kesilir
// (beğeni sayıları eksik çıkar, galeriden yeni anılar kaybolur...). Bu yardımcı tüm satırları
// sayfa sayfa toplar. Sunucu bir sayfada daha az satır döndürse bile (max_rows ayarı) atlama olmaz.
async function fetchAll(supabase, table, columns, apply, { pageSize = 1000, maxRows = 500000 } = {}) {
  const out = [];
  let from = 0;
  let total = null;
  while (from < maxRows) {
    let q = supabase.from(table).select(columns, { count: 'exact' });
    if (apply) q = apply(q); // filtreler + KARARLI sıralama (order) burada verilir
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    if (total === null && typeof count === 'number') total = count;
    const got = (data || []).length;
    if (got === 0) break;
    out.push(...data);
    from += got;
    if (total !== null && out.length >= total) break;
  }
  return out;
}

module.exports = { fetchAll };
