require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { onThisDay } = require('../src/lib/onthisday');
const T = (s) => Date.parse(s);

test('geçen yıl bugün: aynı gün-ay, önceki yıllar, Türkiye saatine göre', () => {
  const now = T('2026-10-10T12:00:00Z');
  const items = [
    { id: 'a', createdAt: T('2025-10-10T08:00:00Z'), likes: 1 },
    { id: 'b', createdAt: T('2025-10-09T22:30:00Z'), likes: 5 }, // TR'de 10 Ekim 01:30 → dahil (UTC'de 9 Ekim)
    { id: 'c', createdAt: T('2025-10-10T21:30:00Z'), likes: 9 }, // TR'de 11 Ekim 00:30 → dahil DEĞİL
    { id: 'd', createdAt: T('2024-10-10T10:00:00Z'), likes: 2 },
    { id: 'e', createdAt: T('2026-10-10T01:00:00Z'), likes: 99 }, // bu yıl → dahil değil
    { id: 'f', createdAt: T('2025-11-10T10:00:00Z'), likes: 1 }, // başka ay
  ];
  const g = onThisDay(items, now);
  assert.deepEqual(g.map((x) => [x.yearsAgo, x.year]), [[1, 2025], [2, 2024]]);
  assert.deepEqual(g[0].items.map((i) => i.id), ['b', 'a']); // beğeniye göre
  assert.deepEqual(g[1].items.map((i) => i.id), ['d']);
});

test('grup başına sınır ve en fazla yıl', () => {
  const now = T('2026-10-10T12:00:00Z');
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, createdAt: T('2025-10-10T08:00:00Z') + i, likes: i }));
  assert.equal(onThisDay(many, now, { perGroup: 5 })[0].items.length, 5);
  assert.deepEqual(onThisDay([{ id: 'old', createdAt: T('2010-10-10T08:00:00Z') }], now), []);
  assert.deepEqual(onThisDay([], now), []);
});
