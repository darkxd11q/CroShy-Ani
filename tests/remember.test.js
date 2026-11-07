require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { pickRotation, pruneRotations } = require('../src/lib/rotation');

test('belirteç döndürme: tolerans süresindeki paralel istekler AYNI yeni belirteci alır', () => {
  const map = new Map();
  let n = 0;
  const make = () => 'yeni-' + ++n;
  const t0 = 1_000_000;
  const first = pickRotation(map, 'eskiHash', t0, 120000, make);
  assert.deepEqual(first, { raw: 'yeni-1', reused: false });
  // aynı anda gelen ikinci/üçüncü istek: aynı yeni belirteç, tekrar üretilmez
  assert.deepEqual(pickRotation(map, 'eskiHash', t0 + 50, 120000, make), { raw: 'yeni-1', reused: true });
  assert.deepEqual(pickRotation(map, 'eskiHash', t0 + 100000, 120000, make), { raw: 'yeni-1', reused: true });
  assert.equal(n, 1);
  // tolerans bitince yeni döndürme
  assert.deepEqual(pickRotation(map, 'eskiHash', t0 + 130000, 120000, make), { raw: 'yeni-2', reused: false });
  // farklı kullanıcılar birbirine karışmaz
  assert.equal(pickRotation(map, 'baskaHash', t0, 120000, make).raw, 'yeni-3');
  pruneRotations(map, t0 + 999999999);
  assert.equal(map.size, 0);
});

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

const cookiesOf = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean);

test('/api/quick-login: giriş yoksa ok=false, oturum varsa ok=true', async () => {
  const anon = await (await fetch(base + '/api/quick-login', { method: 'POST' })).json();
  assert.equal(anon.ok, false);

  const r = await fetch(base + '/admin/login', {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'testmod', password: 'testpass' }),
  });
  const cookie = cookiesOf(r).map((c) => c.split(';')[0]).join('; ');
  const logged = await (await fetch(base + '/api/quick-login', { method: 'POST', headers: { Cookie: cookie } })).json();
  assert.equal(logged.ok, true);
  assert.equal(logged.isAdmin, true);
});

test('"beni hatırla" çerezi SameSite=Lax (dış bağlantıdan gelişte de girer), oturum çerezi Strict kalır', async () => {
  const r = await fetch(base + '/admin/login', {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'testmod', password: 'testpass', remember: '1' }),
  });
  const list = cookiesOf(r);
  const remember = list.find((c) => c.startsWith('croshy_remember='));
  const sid = list.find((c) => c.startsWith('croshy.sid='));
  assert.ok(remember, 'remember çerezi verilmedi');
  assert.match(remember, /SameSite=Lax/i);
  assert.match(remember, /HttpOnly/i);
  assert.match(remember, /Max-Age=7776000/); // 90 gün = 3 ay
  assert.match(sid, /SameSite=Strict/i);
});

test('"beni hatırla" işaretsizse kalıcı çerez verilmez', async () => {
  const r = await fetch(base + '/admin/login', {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'testmod', password: 'testpass' }),
  });
  assert.ok(!cookiesOf(r).some((c) => c.startsWith('croshy_remember=')));
});
