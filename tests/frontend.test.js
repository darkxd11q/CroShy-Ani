const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

test('tüm ön yüz betikleri sözdizimi olarak geçerli', () => {
  const dir = path.join(root, 'public', 'js');
  for (const f of fs.readdirSync(dir)) new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
});

test('ana sayfa: sayfalama, etiket filtresi, rastgele anı ve erişilebilirlik öğeleri', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  for (const needle of ['loadSentinel', 'loadMoreBtn', 'tagFilter', '/random', 'skip-link', 'cookie-banner.js', 'auth-nav.js']) {
    assert.ok(html.includes(needle), 'ana sayfada eksik: ' + needle);
  }
});

test('galeri: videolar tembel yüklenir, görseller optimize edilir, içerik kaçışlanır', () => {
  const js = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
  assert.ok(js.includes('data-src'), 'video tembel yükleme yok');
  assert.ok(js.includes('f_auto,q_auto'), 'görsel optimizasyonu yok');
  assert.ok(js.includes('IntersectionObserver'));
  assert.ok(js.includes('&quot;'), 'öznitelik kaçışı yok');
  assert.ok(js.includes('prefers-reduced-motion'));
});

test('giriş kartı /login sayfası ile ana sayfa penceresinde aynı partial', () => {
  const nav = fs.readFileSync(path.join(root, 'public', 'js', 'auth-nav.js'), 'utf8');
  assert.ok(nav.includes('/auth-card'));
  assert.ok(fs.existsSync(path.join(root, 'views', 'partials', 'auth-card.ejs')));
});
