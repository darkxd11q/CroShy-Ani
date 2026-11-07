require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const audit = require('../src/audit');

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

async function login(u, p) {
  const r = await fetch(base + '/admin/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: u, password: p }),
  });
  const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, cookie };
}
const post = (path, cookie, body = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie || '' }, body: JSON.stringify(body) });

test('acil durum hesapları veritabanı yokken de giriş yapabilir (ve 2FA alanı isteğe bağlı)', async () => {
  const mod = await login('testmod', 'testpass');
  assert.equal(mod.status, 302);
  assert.ok(mod.cookie.includes('croshy.sid'));
  assert.equal((await login('testmod', 'yanlis')).status, 200);
});

test('moderatör: süper admin rotalarına 403, kişisel hesap rotalarına 400', async () => {
  const { cookie } = await login('testmod', 'testpass');
  for (const p of ['/api/admin/admins/create', '/api/admin/admins/reset-password', '/api/admin/reports/resolve', '/api/admin/users/ban']) {
    assert.equal((await post(p, cookie)).status, 403, p);
  }
  // acil durum hesabı (kişisel hesap değil) 2FA/şifre rotalarını kullanamaz
  assert.equal((await post('/api/admin/me/2fa/setup', cookie)).status, 400);
  assert.equal((await post('/api/admin/me/password', cookie, { currentPassword: 'x', newPassword: 'y'.repeat(12) })).status, 400);
});

test('süper admin: yeni yönetici adı doğrulanır, acil durum adı rezerve', async () => {
  const { cookie } = await login('testsuper', 'testsuperpass');
  assert.equal((await post('/api/admin/admins/create', cookie, { username: 'a' })).status, 400);
  assert.equal((await post('/api/admin/admins/create', cookie, { username: 'testmod' })).status, 400);
});

test('kullanıcı şikayet uçları giriş ister; yönetici ucu kullanıcıya kapalı', async () => {
  assert.equal((await post('/api/memory/x/report', '')).status, 401);
  assert.equal((await post('/api/comments/1/report', '')).status, 401);
  assert.equal((await post('/api/admin/reports/resolve', '')).status, 401);
});

test('işlem kaydı: etiketler ve gizli alanların maskelenmesi', () => {
  assert.equal(audit.labelFor('/api/admin/approve/abc'), 'Anıyı onayladı');
  assert.equal(audit.labelFor('/api/admin/users/delete'), 'Hesabı sildi');
  assert.equal(audit.labelFor('/api/admin/bilinmeyen'), 'Admin işlemi');
  const r = JSON.parse(audit.redact({ username: 'ayse', password: 'gizli', currentPassword: 'x', code: '123456', reason: 'spam' }));
  assert.equal(r.username, 'ayse');
  assert.equal(r.reason, 'spam');
  for (const k of ['password', 'currentPassword', 'code']) assert.equal(r[k], '***');
});

test('admin paneli çökmeden yanıt verir (veritabanı yoksa 500, sunucu ayakta)', async () => {
  const { cookie } = await login('testsuper', 'testsuperpass');
  const r = await fetch(base + '/admin', { headers: { Cookie: cookie } });
  assert.ok([200, 500].includes(r.status));
  assert.equal((await fetch(base + '/')).status, 200);
});
