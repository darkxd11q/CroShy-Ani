require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../recovery');

test('kodlar: sayı, uzunluk, benzersizlik, karıştırılan harfler yok', () => {
  const codes = r.generateCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) {
    assert.equal(c.length, 10);
    assert.match(c, /^[A-HJKMNP-Z2-9]{10}$/); // 0 O 1 I L yok
  }
  assert.ok(!/[01OIL]/.test(r.ALPHABET));
});

test('biçimlendirme ve normalleştirme: küçük harf / tire / boşluk fark etmez', () => {
  assert.equal(r.formatCode('ABCDEFGHJK'), 'ABCDE-FGHJK');
  assert.equal(r.normalizeCode('abcde-fghjk'), 'ABCDEFGHJK');
  assert.equal(r.normalizeCode(' ABCDE FGHJK '), 'ABCDEFGHJK');
  assert.equal(r.normalizeCode(null), '');
});

test('scrypt özet: doğru kod geçer, yanlışı geçmez, aynı kodun özeti her seferinde farklı (tuzlu)', async () => {
  const h1 = await r.hashCode('ABCDEFGHJK');
  const h2 = await r.hashCode('ABCDEFGHJK');
  assert.notEqual(h1, h2);
  assert.ok(!h1.includes('ABCDEFGHJK'));
  assert.equal(await r.verifyCode('ABCDEFGHJK', h1), true);
  assert.equal(await r.verifyCode('ABCDEFGHJL', h1), false);
  assert.equal(await r.verifyCode('', 'bozuk'), false);
});
