require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildThread, countThread } = require('../src/lib/threads');
const { topReactions } = require('../src/lib/reactions');
const { checkMedia } = require('../src/lib/mediaChecks');
const social = require('../social');
const root = path.join(__dirname, '..');

test('yorum zinciri: sabitlenen yorum en üstte, yanıtlar üst yorumun altında ve kronolojik', () => {
  const rows = [
    { id: 1, parentId: null, pinnedAt: null, createdAt: 10 },
    { id: 2, parentId: 1, pinnedAt: null, createdAt: 30 },
    { id: 3, parentId: null, pinnedAt: 500, createdAt: 20 }, // sabit
    { id: 4, parentId: 1, pinnedAt: null, createdAt: 25 },
    { id: 5, parentId: 99, pinnedAt: null, createdAt: 40 }, // ebeveyni silinmiş yetim yanıt → görünmez
    { id: 6, parentId: null, pinnedAt: null, createdAt: 5 },
  ];
  const t = buildThread(rows);
  assert.deepEqual(t.map((r) => r.id), [3, 6, 1]); // sabit, sonra eskiden yeniye
  assert.deepEqual(t[2].replies.map((r) => r.id), [4, 2]);
  assert.equal(countThread(t), 5);
  assert.deepEqual(buildThread([]), []);
});

test('en çok verilen 2 emoji: sayıya göre, beraberlikte emoji listesi sırası, 0 olanlar elenir', () => {
  const order = social.EMOJIS;
  assert.deepEqual(topReactions({ '😂': 12, '🔥': 5, '👏': 1 }, 2, order), [{ emoji: '😂', count: 12 }, { emoji: '🔥', count: 5 }]);
  assert.deepEqual(topReactions({ '🔥': 3, '😂': 3, '🎉': 3 }, 2, order).map((t) => t.emoji), ['😂', '🔥']);
  assert.deepEqual(topReactions({ '😂': 0 }, 2, order), []);
  assert.deepEqual(topReactions(undefined, 2, order), []);
  assert.deepEqual(topReactions({ '😂': 4 }, 2, order), [{ emoji: '😂', count: 4 }]);
});

test('emoji listesi sunucu ve tarayıcıda AYNI (seçici ile doğrulama aynı küme)', () => {
  const js = fs.readFileSync(path.join(root, 'public', 'js', 'reaction-picker.js'), 'utf8');
  const m = js.match(/const EMOJIS = \[(.*?)\];/s);
  const client = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(client, social.EMOJIS);
  assert.equal(new Set(social.EMOJIS).size, social.EMOJIS.length);
  assert.ok(!social.EMOJIS.includes('❤️'), 'beğeni (❤️) tepki listesinde olmamalı');
});

test('ortak medya doğrulaması: boyut/süre/kaynak ihlalinde dosya silinir', async () => {
  const destroyed = [];
  const cloudinary = { uploader: { destroy: async (id, o) => destroyed.push([id, o.resource_type]) } };
  const base = { limits: { unlimited: false, imageBytes: 1000, videoBytes: 5000, videoDurationSec: 60 }, cloudinary, formatDuration: (s) => s + ' sn', ceilingBytes: 20000, safeUrl: /^https:\/\/res\.cloudinary\.com\// };
  const ok = { url: 'https://res.cloudinary.com/c/image/upload/a.jpg', publicId: 'p1', type: 'image', bytes: 900 };
  assert.equal(await checkMedia({ ...base, body: ok }), null);
  assert.equal((await checkMedia({ ...base, body: { ...ok, type: 'gif' } })).status, 400);
  assert.equal((await checkMedia({ ...base, body: { ...ok, url: 'https://evil.example/x.jpg' } })).status, 400);
  assert.equal((await checkMedia({ ...base, body: { ...ok, publicId: '' } })).status, 400);
  assert.equal(destroyed.length, 0); // geçersiz kaynakta silme denenmez
  assert.equal((await checkMedia({ ...base, body: { ...ok, bytes: 5000 } })).status, 413);
  assert.deepEqual(destroyed[0], ['p1', 'image']);
  const vid = { url: 'https://res.cloudinary.com/c/video/upload/a.mp4', publicId: 'v1', type: 'video', bytes: 4000, durationSec: 30 };
  assert.equal(await checkMedia({ ...base, body: vid }), null);
  assert.equal((await checkMedia({ ...base, body: { ...vid, durationSec: 90 } })).status, 413);
  assert.equal(await checkMedia({ ...base, body: { ...vid, bytes: 15000, trimmed: true } }), null); // kırpılmışta orijinal boyut sayılmaz
  assert.equal((await checkMedia({ ...base, body: { ...vid, bytes: 25000, trimmed: true } })).status, 413); // ama üst tavan var
  assert.equal(await checkMedia({ ...base, limits: { ...base.limits, unlimited: true }, body: { ...vid, bytes: 25000, trimmed: true } }), null);
});

test('migration 008: taslak durumu, zincir/sabitleme, vitrin, koleksiyon ve tepki özeti', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations', '008_collections_drafts_threads.sql'), 'utf8');
  for (const needle of ["'draft'", 'pg_constraint', 'parent_id', 'pinned_at', 'pinned_item_id', 'create table if not exists collections', 'collection_items', 'on delete cascade', 'reaction_counts']) {
    assert.ok(sql.includes(needle), 'migration eksik: ' + needle);
  }
  assert.ok(!/drop table|truncate/i.test(sql), 'yıkıcı SQL olmamalı');
  assert.ok(fs.readFileSync(path.join(root, 'supabase-schema.sql'), 'utf8').includes('008_collections_drafts_threads.sql'));
});

test('yükleme sayfası: etiket alanı + taslak düğmesi; betik taslak ve etiketleri gönderiyor', () => {
  const html = fs.readFileSync(path.join(root, 'protected', 'upload.html'), 'utf8');
  assert.ok(html.includes('id="tagInput"') && html.includes('id="draftBtn"'));
  assert.ok(html.indexOf('/js/tag-input.js') < html.indexOf('/js/upload.js'), 'tag-input.js upload.js\'ten önce yüklenmeli');
  const js = fs.readFileSync(path.join(root, 'public', 'js', 'upload.js'), 'utf8');
  assert.ok(js.includes("'/api/drafts'") && js.includes('tags: tagList') && js.includes("handleSubmit('draft')"));
  assert.ok(js.includes('tagList.length < 1'), 'istemcide en az 1 etiket kontrolü yok');
});

test('gönderme rotası etiketi ZORUNLU tutuyor ve taslakla ortak doğrulamayı kullanıyor', () => {
  const media = fs.readFileSync(path.join(root, 'src', 'routes', 'media.js'), 'utf8');
  assert.ok(media.includes('collectTags({ tagsInput: req.body.tags') && media.includes('required: true'));
  assert.ok(media.includes('checkMedia('));
  const drafts = fs.readFileSync(path.join(root, 'src', 'routes', 'drafts.js'), 'utf8');
  assert.ok(drafts.includes('checkMedia(') && drafts.includes('countToday') && drafts.includes('required: true'));
  assert.ok(drafts.includes("status: 'draft'"));
});

test('yeni uçlar giriş ister (koleksiyon, taslak, sabitleme)', async () => {
  const app = require('../src/app');
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const post = (p) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    for (const p of ['/api/collections', '/api/collections/1/toggle', '/api/collections/1/rename', '/api/collections/1/delete', '/api/collections/1/items/x/remove', '/api/memory/x/quick-save', '/api/drafts', '/api/drafts/x/update', '/api/drafts/x/publish', '/api/drafts/x/delete', '/api/profile/pin', '/api/profile/unpin', '/api/comments/1/pin']) {
      assert.equal((await post(p)).status, 401, p);
    }
    assert.equal((await fetch(base + '/api/collections')).status, 401);
    assert.equal((await fetch(base + '/api/drafts')).status, 401);
    assert.equal((await fetch(base + '/koleksiyonlar', { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base + '/koleksiyonlar/1', { redirect: 'manual' })).status, 302);
  } finally {
    server.close();
  }
});
