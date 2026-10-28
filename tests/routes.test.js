require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
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

function routeTable() {
  const out = [];
  for (const l of app._router.stack) if (l.route) for (const m of Object.keys(l.route.methods)) out.push(m.toUpperCase() + ' ' + l.route.path);
  return out;
}

test('önemli rotalar kayıtlı', () => {
  const t = routeTable();
  for (const r of ['GET /', 'GET /login', 'POST /login', 'GET /api/approved', 'POST /api/submit', 'POST /api/upload-signature', 'GET /admin', 'POST /api/admin/approve/:id']) {
    assert.ok(t.includes(r), 'eksik rota: ' + r);
  }
});

test('ana sayfa, giriş ve 404', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/login')).status, 200);
  assert.equal((await fetch(base + '/yok-boyle-bir-sayfa')).status, 404);
});

test('yetkisiz istekler reddedilir', async () => {
  const post = (p, body = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/submit')).status, 401);
  assert.equal((await post('/api/upload-signature', { kind: 'media', resourceType: 'image' })).status, 401);
  assert.equal((await post('/api/admin/approve/x')).status, 401);
  assert.equal((await post('/api/admin/redeem-codes/create', { badge: 'special' })).status, 401);
  assert.equal((await fetch(base + '/redeem', { redirect: 'manual' })).status, 302);
});

test('tema çerezi oturumsuz ziyaretçide temizlenir (tema hesaba bağlı)', async () => {
  const res = await fetch(base + '/', { headers: { Cookie: 'croshy_theme=ocean' } });
  assert.ok((res.headers.get('set-cookie') || '').includes('croshy_theme=;'));
});

test('admin girişi: yanlış şifre reddedilir, doğru şifre yönlendirir', async () => {
  const login = (u, p) =>
    fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: u, password: p }) });
  assert.equal((await login('testmod', 'yanlis')).status, 200);
  assert.equal((await login('testmod', 'testpass')).status, 302);
});

test('yasal sayfalar açılır ve çerez bildirimi eklenir', async () => {
  for (const p of ['/gizlilik', '/kosullar', '/cerezler']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.ok((await r.text()).includes('KVKK') || p !== '/gizlilik');
  }
  assert.ok((await (await fetch(base + '/')).text()).includes('cookie-banner.js'));
});

test('beğeni artık giriş gerektirir (hesap bazlı)', async () => {
  const r = await fetch(base + '/api/like/abc', { method: 'POST' });
  assert.equal(r.status, 401);
});

test('hesap silme / veri indirme giriş gerektirir', async () => {
  assert.equal((await fetch(base + '/profile/export', { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(base + '/profile/delete-account', { method: 'POST', redirect: 'manual' })).status, 302);
});

test('hesap yasaklama / şifre sıfırlama sadece süper admin', async () => {
  const post = (p) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await post('/api/admin/users/ban')).status, 401);
  assert.equal((await post('/api/admin/users/reset-password')).status, 401);
});

test('sosyal/bildirim API\'leri giriş ister', async () => {
  const post = (p) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await post('/api/memory/abc/comments')).status, 401);
  assert.equal((await post('/api/memory/abc/react')).status, 401);
  assert.equal((await post('/api/comments/1/delete')).status, 401);
  assert.equal((await fetch(base + '/api/notifications')).status, 401);
  assert.equal((await fetch(base + '/api/notifications/count')).status, 401);
  assert.equal((await post('/api/notifications/read')).status, 401);
});

test('yeni rotalar kayıtlı', () => {
  const t = routeTable();
  for (const r of ['GET /m/:id', 'GET /random', 'POST /api/memory/:id/comments', 'POST /api/memory/:id/react', 'GET /api/notifications', 'GET /gizlilik', 'POST /profile/delete-account']) {
    assert.ok(t.includes(r), 'eksik rota: ' + r);
  }
});
