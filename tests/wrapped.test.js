require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWrapped, weekIndex, longestRun } = require('../src/lib/wrapped');
const T = (s) => Date.parse(s);

const mk = (id, userId, extra) => ({ id, userId, type: 'image', likes: 0, commentCount: 0, tags: [], ...extra });
const items = [
  mk('a', 'u1', { likes: 3, commentCount: 1, tags: ['yaz', 'deniz'], createdAt: T('2026-03-02T10:00:00Z') }),
  mk('b', 'u1', { type: 'video', likes: 9, commentCount: 2, tags: ['yaz'], createdAt: T('2026-03-09T10:00:00Z') }),
  mk('c', 'u1', { likes: 1, createdAt: T('2026-03-16T10:00:00Z') }),
  mk('d', 'u1', { likes: 50, createdAt: T('2026-12-31T22:00:00Z') }), // TR'de 2027 → 2026 özetine girmez
  mk('e', 'u1', { likes: 2, createdAt: T('2026-06-20T10:00:00Z') }),
  mk('f1', 'u2', { createdAt: T('2026-01-05T10:00:00Z') }), mk('f2', 'u2', { createdAt: T('2026-01-06T10:00:00Z') }), mk('f3', 'u2', { createdAt: T('2026-01-07T10:00:00Z') }),
  mk('g1', 'u3', { createdAt: T('2026-02-05T10:00:00Z') }), mk('g2', 'u3', { createdAt: T('2026-02-06T10:00:00Z') }),
  mk('h1', 'u4', { createdAt: T('2026-02-05T10:00:00Z') }), mk('i1', 'u5', { createdAt: T('2026-02-05T10:00:00Z') }), mk('j1', 'u6', { createdAt: T('2026-02-05T10:00:00Z') }),
];

test('yıl özeti: sayılar, en iyi anı, en aktif ay, seri, etiketler, sıra', () => {
  const w = buildWrapped({ items, userId: 'u1', year: 2026, now: T('2026-12-01T00:00:00Z') });
  assert.equal(w.empty, false);
  assert.equal(w.memories, 4);
  assert.equal(w.photos, 3);
  assert.equal(w.videos, 1);
  assert.equal(w.likes, 15);
  assert.equal(w.comments, 3);
  assert.equal(w.topMemory.id, 'b');
  assert.deepEqual([w.busiestMonth.name, w.busiestMonth.count], ['Mart', 3]);
  assert.equal(w.months[5], 1);
  assert.equal(w.longestStreakWeeks, 3); // 2, 9 ve 16 Mart ardışık haftalar
  assert.deepEqual(w.topTags, [{ tag: 'yaz', count: 2 }, { tag: 'deniz', count: 1 }]);
  assert.deepEqual(w.rank, { rank: 1, total: 6, topPercent: 17 });
  assert.equal(w.firstMemoryAt, T('2026-03-02T10:00:00Z'));
});

test('yıl sınırı Türkiye saatiyle; başka yıl ve boş durum', () => {
  assert.equal(buildWrapped({ items, userId: 'u1', year: 2027 }).memories, 1);
  const none = buildWrapped({ items, userId: 'u1', year: 2025 });
  assert.equal(none.empty, true);
  assert.equal(none.memories, 0);
  assert.equal(buildWrapped({ items, userId: 'yok', year: 2026 }).empty, true);
});

test('az kişi varsa sıra gösterilmez; haftalık ödüller yıla göre sayılır', () => {
  const few = items.filter((i) => ['u1', 'u2'].includes(i.userId));
  assert.equal(buildWrapped({ items: few, userId: 'u1', year: 2026 }).rank, null);
  const w = buildWrapped({
    items, userId: 'u1', year: 2026, now: T('2026-12-01T00:00:00Z'),
    awards: [
      { badge: 'weekly_active', awarded_at: T('2026-05-01T00:00:00Z') },
      { badge: 'weekly_liked', awarded_at: T('2025-05-01T00:00:00Z') }, // geçen yıl → sayılmaz
      { badge: 'weekly_liked', week_end: T('2026-07-01T00:00:00Z') },
    ],
  });
  assert.equal(w.weeklyActive, 1);
  assert.equal(w.weeklyLiked, 1);
});

test('hafta numarası Pazartesi başlar (TR saati) ve ardışık seri', () => {
  const sunday = T('2026-03-01T20:59:00Z'); // Pazar 23:59 TR
  const monday = T('2026-03-01T21:00:00Z'); // Pazartesi 00:00 TR
  assert.equal(weekIndex(monday), weekIndex(sunday) + 1);
  assert.equal(weekIndex(T('2026-03-02T10:00:00Z')), weekIndex(T('2026-03-08T10:00:00Z')));
  assert.equal(longestRun([1, 2, 3, 5, 6]), 3);
  assert.equal(longestRun([]), 0);
});
