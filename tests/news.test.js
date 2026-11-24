require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const MW = require('../public/js/media-window.js');
const { RELEASES, LATEST, AURAS } = require('../src/releases');
const core = require('../src/core');
const admins = require('../admins');
const users = require('../users');
const totp = require('../src/lib/totp');
const app = require('../src/app');

test('duyuru verisi: sürüm kimlikleri benzersiz, her slaytta aura/başlık/metin var', () => {
  assert.equal(new Set(RELEASES.map((r) => r.id)).size, RELEASES.length);
  assert.equal(LATEST, RELEASES[RELEASES.length - 1]);
  assert.ok(LATEST.slides.length >= 3 && LATEST.slides.length <= 7);
  const ids = new Set();
  for (const s of LATEST.slides) {
    assert.ok(AURAS.includes(s.aura), 'bilinmeyen aura: ' + s.aura);
    assert.ok(s.title && s.text && s.emoji && s.short, 'eksik alan: ' + s.id);
    assert.ok(Array.isArray(s.particles) && s.particles.length > 0);
    assert.ok(!ids.has(s.id)); ids.add(s.id);
  }
  // her slayt FARKLI aura (özelliğe özgü animasyon)
  assert.equal(new Set(LATEST.slides.map((s) => s.aura)).size, LATEST.slides.length);
});

test('medya ön yükleme: 2. videoya kadar (aradaki fotoğraflar dahil), sonrası yüklenmez', () => {
  const t = (spec) => [...spec].map((c) => (c === 'v' ? 'video' : 'image'));
  const sorted = (set) => [...set].sort((a, b) => a - b);
  // p p p p v p p v p p p  (görünen: 0-1)
  assert.deepEqual(sorted(MW.compute(t('ppppvppvppp'), 0, 1)), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(MW.MAX_VIDEOS, 2);
  assert.equal(MW.MAX_PHOTOS, 20);
});

test('medya ön yükleme: video gelmezse en fazla 20 fotoğraf; 1 video + fotoğraflarda da 20 sınırı', () => {
  const photos = Array(40).fill('image');
  assert.equal(Math.max(...MW.compute(photos, 0, 1)), 21); // 0,1 görünen + 20 fotoğraf (2..21)
  const one = ['image', 'image', 'video', ...Array(30).fill('image')];
  assert.equal(Math.max(...MW.compute(one, 0, 1)), 22); // video + 20 fotoğraf
});

test('medya ön yükleme: görünenin hemen üstündeki 2 kart yüklü kalır, sınırlar taşmaz', () => {
  const types = Array(30).fill('image');
  const set = MW.compute(types, 10, 11);
  assert.ok(set.has(8) && set.has(9) && !set.has(7));
  assert.deepEqual([...MW.compute([], 0, 0)], []);
  assert.deepEqual([...MW.compute(['image'], 5, 9)], [0]);
});

let server; let base;
test.before(async () => { await new Promise((r) => { server = app.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); }); }); });
test.after(() => server && server.close());
const j = async (p, o) => (await fetch(base + p, o)).json();

test('"Neler yeni?" API: ilk kez gelen misafire gösterilmez; eski sürümü gören görür; güncel olan görmez; önizleme', async () => {
  const first = await j('/api/whats-new');
  assert.equal(first.release, null); assert.equal(first.firstVisit, true); assert.equal(first.latestId, LATEST.id);
  const old = await j('/api/whats-new?seen=eski-surum');
  assert.equal(old.release.id, LATEST.id); assert.equal(old.release.slides.length, LATEST.slides.length);
  assert.equal((await j('/api/whats-new?seen=' + LATEST.id)).release, null);
  assert.equal((await j('/api/whats-new?force=1&seen=' + LATEST.id)).release.id, LATEST.id);
  const bad = await fetch(base + '/api/whats-new/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'uydurma' }) });
  assert.equal(bad.status, 400);
  const ok = await fetch(base + '/api/whats-new/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: LATEST.id }) });
  assert.equal(ok.status, 200);
});

// ---------- normal hesap <-> yönetici geçişi (veritabanı sahte) ----------
const hash = core.hashPassword('Sifre12345!');
const adminRow = { id: 'a1', username: 'zeynep', role: 'moderator', passwordHash: hash, totpEnabled: false, totpSecret: null, disabled: false, linkedUserId: 'u1', mustChangePassword: false };
const userRow = { id: 'u1', username: 'ayse', passwordHash: hash, banned: false, theme: null, badges: ['member'], badgeExpiry: {} };
const links = [];
admins.findByUsername = async (n) => (String(n).toLowerCase() === 'zeynep' ? adminRow : null);
admins.findById = async (id) => (id === 'a1' ? adminRow : null);
admins.findByLinkedUser = async (uid) => (adminRow.linkedUserId && adminRow.linkedUserId === uid ? adminRow : null);
admins.touchLogin = async () => {};
admins.setLinkedUser = async (id, uid) => { adminRow.linkedUserId = uid; links.push([id, uid]); };
admins.clearLinksForUser = async () => {};
users.findUserById = async (id) => (id === 'u1' ? userRow : null);
users.findUserByUsername = async (n) => (String(n).toLowerCase() === 'ayse' ? userRow : null);

const cookieOf = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith('croshy.sid=')) || '';
const post = (p, cookie, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie || '' }, body: JSON.stringify(body || {}) });
const status = async (cookie) => (await fetch(base + '/api/session-status', { headers: { Cookie: cookie } })).json();
async function adminLogin(u, p) {
  const r = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: u, password: p }) });
  return cookieOf(r);
}

test('şifresiz geçiş: yönetici -> normal hesap -> yönetici (eski oturum geçersiz olur)', async () => {
  adminRow.linkedUserId = 'u1'; adminRow.totpEnabled = false;
  const A = await adminLogin('zeynep', 'Sifre12345!');
  assert.ok(A, 'admin girişi çalışmadı');
  let s = await status(A);
  assert.deepEqual([s.isAdmin, s.username, s.canSwitch], [true, 'zeynep', 'user']);

  const r1 = await post('/api/identity/switch', A, { to: 'user' });
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).redirect, '/');
  const B = cookieOf(r1);
  assert.ok(B && B !== A);
  s = await status(B);
  assert.deepEqual([s.loggedIn, s.isAdmin, s.username, s.canSwitch], [true, false, 'ayse', 'admin']);
  assert.equal((await status(A)).loggedIn, false); // eski oturum kapandı

  const r2 = await post('/api/identity/switch', B, { to: 'admin' });
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).redirect, '/admin');
  const C = cookieOf(r2);
  s = await status(C);
  assert.deepEqual([s.isAdmin, s.username], [true, 'zeynep']);
  assert.equal((await fetch(base + '/api/admin/approved', { headers: { Cookie: C } })).status, 403); // moderatör oturumu: yetkili ama süper admin değil
});

test('şifresiz geçiş: 2 adımlı doğrulama AÇIKSA admin\'e geçerken kod ister (yanlış kod reddedilir)', async () => {
  adminRow.linkedUserId = 'u1'; adminRow.totpEnabled = false;
  const A = await adminLogin('zeynep', 'Sifre12345!');
  const B = cookieOf(await post('/api/identity/switch', A, { to: 'user' }));
  const secret = totp.generateSecret();
  adminRow.totpEnabled = true; adminRow.totpSecret = totp.encryptSecret(secret);
  try {
    const none = await post('/api/identity/switch', B, { to: 'admin' });
    assert.equal(none.status, 401); assert.equal((await none.json()).needTotp, true);
    const wrong = await post('/api/identity/switch', B, { to: 'admin', totp: '000000' });
    assert.equal(wrong.status, 401);
    const good = totp.hotp(totp.base32Decode(secret), Math.floor(Date.now() / 1000 / 30));
    const ok = await post('/api/identity/switch', B, { to: 'admin', totp: good });
    assert.equal(ok.status, 200);
  } finally {
    adminRow.totpEnabled = false; adminRow.totpSecret = null;
  }
});

test('şifresiz geçiş: bağ yoksa / devre dışıysa geçilemez; oturumsuz ve acil durum hesabı geçemez', async () => {
  adminRow.linkedUserId = 'u1'; adminRow.disabled = false;
  const A = await adminLogin('zeynep', 'Sifre12345!');
  const B = cookieOf(await post('/api/identity/switch', A, { to: 'user' }));
  adminRow.linkedUserId = null;
  assert.equal((await status(B)).canSwitch, null);
  assert.equal((await post('/api/identity/switch', B, { to: 'admin' })).status, 404);
  adminRow.linkedUserId = 'u1';
  const D = await adminLogin('zeynep', 'Sifre12345!');
  adminRow.linkedUserId = null;
  assert.equal((await post('/api/identity/switch', D, { to: 'user' })).status, 404);
  adminRow.linkedUserId = 'u1';

  assert.equal((await post('/api/identity/switch', '', { to: 'admin' })).status, 401);
  assert.equal((await post('/api/identity/switch', '', { to: 'user' })).status, 400);
  const env = await adminLogin('testmod', 'testpass'); // acil durum hesabı: kişisel yönetici kaydı yok
  assert.equal((await post('/api/identity/switch', env, { to: 'user' })).status, 400);
  assert.equal((await post('/api/identity/link-user', env, { username: 'ayse', password: 'Sifre12345!' })).status, 400);
  assert.equal((await post('/api/identity/link-user', '', { username: 'ayse', password: 'x' })).status, 401);
});

test('hesap bağlama: doğru şifreyle bağlanır, yanlışta reddedilir, kaldırılabilir', async () => {
  adminRow.linkedUserId = null; links.length = 0;
  const A = await adminLogin('zeynep', 'Sifre12345!');
  const bad = await post('/api/identity/link-user', A, { username: 'ayse', password: 'yanlis' });
  assert.equal(bad.status, 400); assert.equal(links.length, 0);
  const ok = await post('/api/identity/link-user', A, { username: 'ayse', password: 'Sifre12345!' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).linkedUser, 'ayse');
  assert.deepEqual(links[0], ['a1', 'u1']);
  assert.equal((await post('/api/identity/unlink', A)).status, 200);
  assert.deepEqual(links[1], ['a1', null]);
  adminRow.linkedUserId = 'u1';
});
