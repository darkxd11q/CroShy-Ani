require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../src/lib/totp');

test('RFC 6238 test vektörü (SHA1, t=59 -> 287082)', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totp.verifyTotp(secret, '287082', { window: 0, now: 59000 }), true);
  assert.equal(totp.verifyTotp(secret, '287083', { window: 0, now: 59000 }), false);
  // 1111111109 -> 081804 (RFC 6238, 6 haneye indirgenmiş)
  assert.equal(totp.verifyTotp(secret, '081804', { window: 0, now: 1111111109000 }), true);
});

test('saat farkı toleransı: ±1 adım kabul, ±2 reddedilir', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const at = (offsetSteps) => totp.hotp(totp.base32Decode(secret), Math.floor(now / 1000 / 30) + offsetSteps);
  assert.equal(totp.verifyTotp(secret, at(1), { now }), true);
  assert.equal(totp.verifyTotp(secret, at(-1), { now }), true);
  assert.equal(totp.verifyTotp(secret, at(3), { now }), false);
  assert.equal(totp.verifyTotp(secret, 'abcdef', { now }), false);
  assert.equal(totp.verifyTotp(secret, '12345', { now }), false);
});

test('gizli anahtar şifreleme gidiş-dönüş ve kurcalamaya karşı', () => {
  const secret = totp.generateSecret();
  const stored = totp.encryptSecret(secret);
  assert.ok(!stored.includes(secret));
  assert.equal(totp.decryptSecret(stored), secret);
  const parts = stored.split(':');
  parts[2] = Buffer.from('bozuk').toString('base64');
  assert.throws(() => totp.decryptSecret(parts.join(':')));
});

test('otpauth bağlantısı', () => {
  const u = totp.otpauthUrl({ secret: 'ABC', account: 'ayse' });
  assert.ok(u.startsWith('otpauth://totp/CroShy%20An%C4%B1:ayse?secret=ABC'));
});
