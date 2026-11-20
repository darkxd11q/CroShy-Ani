require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAll } = require('../pager');

// Sahte Supabase: satırları "cap" kadar sayfa sayfa döndürür (PostgREST'in max_rows davranışı)
function fake(rows, cap) {
  const calls = [];
  return {
    calls,
    from() {
      return {
        select(_cols, opts) {
          const q = {
            order: () => q, eq: () => q, is: () => q, in: () => q, or: () => q, not: () => q, gt: () => q, lt: () => q, gte: () => q,
            range(a, b) {
              calls.push([a, b]);
              const slice = rows.slice(a, Math.min(b, a + cap - 1) + 1);
              return Promise.resolve({ data: slice, error: null, count: opts && opts.count ? rows.length : null });
            },
          };
          return q;
        },
      };
    },
  };
}
const make = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test('2500 satır: hepsi gelir, hiçbiri tekrarlanmaz (1000 sınırı aşılır)', async () => {
  const sb = fake(make(2500), 1000);
  const out = await fetchAll(sb, 'items', '*');
  assert.equal(out.length, 2500);
  assert.equal(new Set(out.map((r) => r.id)).size, 2500);
  assert.equal(sb.calls.length, 3);
});

test('sunucu sayfa başına daha az döndürse (max_rows=300) bile atlama olmaz', async () => {
  const out = await fetchAll(fake(make(1000), 300), 'items', '*');
  assert.equal(out.length, 1000);
  assert.equal(new Set(out.map((r) => r.id)).size, 1000);
});

test('küçük tablo tek istekte gelir, boş tablo boş döner, hata fırlatılır', async () => {
  const sb = fake(make(5), 1000);
  assert.equal((await fetchAll(sb, 't', '*')).length, 5);
  assert.equal(sb.calls.length, 1);
  assert.deepEqual(await fetchAll(fake([], 1000), 't', '*'), []);
  const bad = { from: () => ({ select: () => ({ range: () => Promise.resolve({ data: null, error: new Error('patladı') }) }) }) };
  await assert.rejects(fetchAll(bad, 't', '*'), /patladı/);
});
