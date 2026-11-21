require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
const app = require('../src/app');

let server;
let base;
test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = 'http://127.0.0.1:' + server.address().port;
      resolve();
    });
  });
});
test.after(() => server && server.close());
const root = path.join(__dirname, '..');

test('arama sayfası, manifest ve service worker sunuluyor', async () => {
  const ara = await fetch(base + '/ara?q=deneme');
  assert.equal(ara.status, 200);
  const html = await ara.text();
  assert.ok(html.includes('id="searchInput"') && html.includes('value="deneme"'));

  const mf = await fetch(base + '/manifest.webmanifest');
  assert.equal(mf.status, 200);
  const m = await mf.json();
  assert.equal(m.start_url, '/');
  assert.equal(m.display, 'standalone');
  for (const icon of m.icons) assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), 'ikon yok: ' + icon.src);
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'));

  const sw = await fetch(base + '/sw.js');
  assert.equal(sw.status, 200);
  assert.ok((await sw.text()).includes("addEventListener('push'"));
});

test('bildirim ayarı: anahtar yoksa kapalı; abonelik uçları giriş ister', async () => {
  const cfg = await (await fetch(base + '/api/push/config')).json();
  assert.equal(cfg.enabled, false);
  const post = (p) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await post('/api/push/subscribe')).status, 401);
  assert.equal((await post('/api/push/unsubscribe')).status, 401);
});

test('yıl özeti giriş ister; kısa aramada veritabanına gitmeden boş döner', async () => {
  const r = await fetch(base + '/yilim', { redirect: 'manual' });
  assert.equal(r.status, 302);
  const s = await (await fetch(base + '/api/search?q=a')).json();
  assert.deepEqual([s.items, s.users, s.tags, s.total], [[], [], [], 0]);
});

test('her sayfada manifest + pwa.js var (uygulama olarak kurulabilir)', () => {
  const files = [
    ...fs.readdirSync(path.join(root, 'views')).filter((f) => f.endsWith('.ejs')).map((f) => path.join('views', f)),
    'public/index.html', 'public/404.html', 'protected/upload.html',
  ];
  for (const f of files) {
    const h = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(h.includes('rel="manifest"') && h.includes('/js/pwa.js'), 'eksik: ' + f);
  }
});

test('yeni rotalar kayıtlı', () => {
  const stack = [];
  const walk = (layer, prefix) => {
    if (layer.route) for (const m of Object.keys(layer.route.methods)) stack.push(m.toUpperCase() + ' ' + prefix + layer.route.path);
  };
  (app._router || app.router).stack.forEach((l) => walk(l, ''));
  for (const r of ['GET /ara', 'GET /yilim', 'GET /api/search', 'GET /api/on-this-day', 'GET /api/tags/trending', 'GET /api/push/config', 'POST /api/push/subscribe']) {
    assert.ok(stack.includes(r), 'eksik rota: ' + r);
  }
});
