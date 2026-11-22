require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectTags, isBannedTag, normalizeTag } = require('../src/lib/tags');
const { popularTags, trendingTags } = require('../src/lib/search');

test('etiket: en az 1 zorunlu, normalleştirme, tekrar ve açıklamadaki #etiketler birleşir', () => {
  assert.equal(collectTags({ tagsInput: [], caption: 'merhaba' }).error, 'En az 1 etiket seçmelisin.');
  assert.deepEqual(collectTags({ tagsInput: ['#Yaz', 'yaz', 'DENİZ'], caption: 'tatil #komik' }).tags, ['yaz', 'deniz', 'komik']);
  assert.deepEqual(collectTags({ tagsInput: 'a1,b2', caption: '' }).tags, ['a1', 'b2']); // "a,b" metni de kabul
  assert.deepEqual(collectTags({ tagsInput: [], caption: 'x', required: false }).tags, []); // taslakta zorunlu değil
  assert.equal(normalizeTag('#İstanbul'), 'istanbul');
});

test('etiket: "croshy" kullanılamaz (büyük/küçük harf, alt çizgi, açıklamadaki #croshy dahil)', () => {
  for (const bad of ['croshy', 'CroShy', '#CROSHY', 'cro_shy', 'c_r_o_s_h_y']) {
    assert.equal(collectTags({ tagsInput: [bad], caption: '' }).error, '#croshy etiketi kullanılamaz.', bad);
    assert.equal(isBannedTag(bad), true, bad);
  }
  assert.equal(collectTags({ tagsInput: ['yaz'], caption: 'harika #croshy günü' }).error, '#croshy etiketi kullanılamaz.');
  assert.equal(isBannedTag('croshyyy'), false);
  assert.equal(isBannedTag('crosh'), false);
});

test('etiket: uzunluk, karakter ve en fazla 5 sınırı', () => {
  assert.match(collectTags({ tagsInput: ['a'], caption: '' }).error, /geçerli bir etiket değil/);
  assert.match(collectTags({ tagsInput: ['a'.repeat(25)], caption: '' }).error, /geçerli bir etiket değil/);
  assert.match(collectTags({ tagsInput: ['yaz sonu'], caption: '' }).error, /geçerli bir etiket değil/);
  assert.match(collectTags({ tagsInput: ['<b>'], caption: '' }).error, /geçerli bir etiket değil/);
  assert.equal(collectTags({ tagsInput: ['aa', 'bb', 'cc', 'dd', 'ee'], caption: '' }).tags.length, 5);
  assert.equal(collectTags({ tagsInput: ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'], caption: '' }).error, 'En fazla 5 etiket kullanabilirsin.');
  assert.equal(collectTags({ tagsInput: ['aa', 'bb', 'cc'], caption: '#dd #ee #ff' }).error, 'En fazla 5 etiket kullanabilirsin.');
});

test('sık kullanılan etiketler: GERÇEK veriden, en çok farklı kişi önde, croshy hariç, veri yoksa boş', () => {
  const it = (userId, tags) => ({ userId, tags });
  const items = [it('u1', ['yaz', 'deniz']), it('u2', ['yaz']), it('u3', ['yaz', 'komik']), it('u1', ['komik', 'komik2']), it('u4', ['croshy', 'komik']), it('u1', ['deniz'])];
  const pop = popularTags(items);
  // yaz ve komik 3'er farklı kişi (eşit) → alfabetik; deniz tek kişi ama 2 anı; komik2 tek kişi 1 anı
  assert.deepEqual(pop.map((p) => p.tag), ['komik', 'yaz', 'deniz', 'komik2']);
  assert.deepEqual(pop[1], { tag: 'yaz', users: 3, count: 3 });
  assert.ok(!pop.some((p) => p.tag === 'croshy'));
  assert.deepEqual(popularTags([]), []); // kimse etiket kullanmadıysa öneri YOK
  assert.deepEqual(popularTags([{ userId: 'u1', tags: [] }, { userId: 'u2' }]), []);
  assert.equal(popularTags(items, 2).length, 2);
});

test('trend etiketlerde de croshy görünmez', () => {
  const now = Date.now();
  const r = trendingTags([{ tags: ['croshy', 'yaz'], createdAt: now }, { tags: ['croshy'], createdAt: now }], now);
  assert.deepEqual(r.map((t) => t.tag), ['yaz']);
});
