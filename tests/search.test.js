require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchItems, searchUsers, searchTags, trendingTags } = require('../src/lib/search');

const items = [
  { id: '1', uploaderName: 'Ayşe', caption: 'İstanbul gezisi #yaz', tags: ['yaz'], likes: 5, createdAt: 3 },
  { id: '2', uploaderName: 'Mehmet', caption: 'Deniz kenarı', tags: ['yaz', 'deniz'], likes: 9, createdAt: 2 },
  { id: '3', uploaderName: 'ayse2', caption: 'kış', tags: ['kış'], likes: 1, createdAt: 1 },
];
const ids = (r) => r.items.map((i) => i.id);

test('arama: Türkçe büyük/küçük harf (İ/ı), etiket, VE mantığı, kısa sorgu', () => {
  assert.deepEqual(ids(searchItems(items, 'istanbul')), ['1']); // "İstanbul" ← "istanbul"
  assert.deepEqual(ids(searchItems(items, 'ayş')), ['1']);
  assert.deepEqual(ids(searchItems(items, '#yaz')), ['2', '1']); // eşit puan → beğeni
  assert.deepEqual(ids(searchItems(items, 'deniz yaz')), ['2']); // her kelime eşleşmeli
  assert.deepEqual(ids(searchItems(items, '#yaz mehmet')), ['2']);
  assert.equal(searchItems(items, 'a').total, 0);
  assert.equal(searchItems(items, '#').total, 0);
  assert.equal(searchItems(items, 'bulunmaz').total, 0);
});

test('arama: sayfalama', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'k' + i, uploaderName: 'x', caption: 'merhaba', tags: [], likes: i, createdAt: i }));
  const p1 = searchItems(many, 'merhaba', { limit: 20, offset: 0 });
  const p2 = searchItems(many, 'merhaba', { limit: 20, offset: 20 });
  assert.equal(p1.total, 30);
  assert.equal(p1.items.length, 20);
  assert.equal(p2.items.length, 10);
  assert.equal(new Set([...p1.items, ...p2.items].map((i) => i.id)).size, 30);
});

test('kişi ve etiket önerileri', () => {
  assert.deepEqual(searchUsers(items, 'ayse').map((u) => u.username), ['ayse2']);
  assert.deepEqual(searchUsers(items, '#yaz'), []);
  assert.deepEqual(searchTags(items, '#de').map((t) => t.tag), ['deniz']);
  assert.deepEqual(searchTags(items, 'ya').map((t) => [t.tag, t.count]), [['yaz', 2]]);
});

test('trend etiketler: yeni olanlar önde, eski olanlar elenir; hiç yeni yoksa tüm zamanlar', () => {
  const DAY = 86400000;
  const now = 1_800_000_000_000;
  const mk = (tag, ageDays, n) => Array.from({ length: n }, () => ({ tags: [tag], createdAt: now - ageDays * DAY }));
  const list = [...mk('yeni', 1, 2), ...mk('orta', 20, 3), ...mk('eski', 200, 10)];
  assert.deepEqual(trendingTags(list, now).map((t) => t.tag), ['yeni', 'orta']);
  assert.deepEqual(trendingTags(mk('eski', 200, 4).concat(mk('daha', 300, 2)), now).map((t) => t.tag), ['eski', 'daha']);
  assert.deepEqual(trendingTags([], now), []);
});
