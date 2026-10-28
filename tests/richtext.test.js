require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractTags, extractMentions, renderRich, escapeHtml } = require('../src/lib/richtext');
const { cloudImg, videoPoster } = require('../src/lib/cloud');

test('etiketler: çıkarma, tekrar ve sınır', () => {
  assert.deepEqual(extractTags('Harika gün #Anı #komik #anı (#yaz)'), ['anı', 'komik', 'yaz']);
  assert.deepEqual(extractTags('a#b # c #x'), []); // kelime ortası / tek harf sayılmaz
  assert.equal(extractTags('#a1 #b2 #c3 #d4 #e5 #f6 #g7').length, 5);
});

test('bahsetmeler: sondaki noktalama kullanıcı adına dahil değil', () => {
  assert.deepEqual(extractMentions('selam @ayse. nasılsın @Mehmet_1!'), ['ayse', 'Mehmet_1']);
  assert.deepEqual(extractMentions('mail@ornek.com'), []); // e-posta bahsetme sayılmaz
});

test('renderRich: XSS kaçışı + bağlantılar', () => {
  const html = renderRich('<script>alert(1)</script> #komik @ayse\nikinci satır');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('href="/?tag=komik"'));
  assert.ok(html.includes('href="/u/ayse"'));
  assert.ok(html.includes('<br>'));
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  // etiket/bahsetme içinde tırnakla özniteliği kırma denemesi
  assert.ok(!renderRich('#x"onmouseover="alert(1)').includes('onmouseover="'));
});

test('cloudImg / videoPoster', () => {
  const img = 'https://res.cloudinary.com/c/image/upload/v1/croshy/media/a.jpg';
  assert.equal(cloudImg(img, 600), 'https://res.cloudinary.com/c/image/upload/f_auto,q_auto,w_600,c_limit/v1/croshy/media/a.jpg');
  const gif = 'https://res.cloudinary.com/c/image/upload/v1/a.gif';
  assert.equal(cloudImg(gif, 600), gif); // GIF değişmez
  const vid = 'https://res.cloudinary.com/c/video/upload/v1/a.mp4';
  assert.equal(videoPoster(vid), 'https://res.cloudinary.com/c/video/upload/so_0,f_jpg,w_1200,c_limit/v1/a.jpg');
  const trimmed = 'https://res.cloudinary.com/c/video/upload/so_10,du_150/v1/a.mp4';
  assert.equal(videoPoster(trimmed), 'https://res.cloudinary.com/c/video/upload/so_10,f_jpg,w_1200,c_limit/v1/a.jpg');
});
