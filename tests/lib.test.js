require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');

const settings = { maxImageBytes: 8912896, maxVideoBytes: 41943040, maxVideoDurationSec: 150, dailySubmitLimit: 2 };

test('latestAwardTime: her zaman Cuma 17:15 (TR), geçmişte', () => {
  const cases = [
    Date.UTC(2026, 9, 9, 14, 14), // Cuma 17:14 TR
    Date.UTC(2026, 9, 9, 14, 15), // Cuma 17:15 TR
    Date.UTC(2026, 9, 9, 20, 0),
    Date.UTC(2026, 9, 10, 7, 0), // Cumartesi
    Date.UTC(2026, 9, 13, 9, 0), // Salı
  ];
  for (const now of cases) {
    const t = core.latestAwardTime(now);
    assert.ok(t <= now, 'gelecekte olmamalı');
    const tr = new Date(t + 3 * 3600e3);
    assert.equal(tr.getUTCDay(), 5);
    assert.equal(tr.getUTCHours(), 17);
    assert.equal(tr.getUTCMinutes(), 15);
  }
  // 17:14 -> bir önceki Cuma, 17:15 -> aynı gün
  assert.equal(core.latestAwardTime(Date.UTC(2026, 9, 9, 14, 15)), Date.UTC(2026, 9, 9, 14, 15));
  assert.equal(core.latestAwardTime(Date.UTC(2026, 9, 9, 14, 14)), Date.UTC(2026, 9, 2, 14, 15));
});

test('safeNext: açık yönlendirmeyi engeller', () => {
  assert.equal(core.safeNext('/redeem'), '/redeem');
  assert.equal(core.safeNext('//evil.com'), null);
  assert.equal(core.safeNext('https://evil.com'), null);
  assert.equal(core.safeNext('/a\\b'), null);
  assert.equal(core.safeNext(undefined), null);
});

test('limitler: üye / ÖZEL / sınırsız', () => {
  const member = core.effectiveLimitsFor({ badges: ['member'] }, settings);
  assert.equal(member.dailyLimit, 2);
  assert.equal(member.unlimited, false);
  const special = core.effectiveLimitsFor({ badges: ['special'] }, settings);
  assert.equal(special.dailyLimit, 3);
  assert.equal(special.imageBytes, Math.round(settings.maxImageBytes * 1.5));
  assert.equal(core.effectiveLimitsFor({ badges: ['founder'] }, settings).unlimited, true);
  assert.equal(core.effectiveLimitsFor({ badges: ['croshy'] }, settings).unlimited, true);
  // Site Kurucusu + ÖZEL birlikte: tema hakkı için premium sayılır
  assert.equal(core.effectiveLimitsFor({ badges: ['founder', 'special'] }, settings).premium, true);
});

test('temalar: kim hangi temayı kullanabilir', () => {
  assert.deepEqual(core.allowedThemesFor({ badges: ['member'] }, 0), []);
  assert.deepEqual(core.allowedThemesFor({ badges: ['special'] }, 0), ['ocean', 'sunset', 'emerald']);
  assert.deepEqual(core.allowedThemesFor({ badges: ['member'] }, Date.now() + 1000), ['aurora', 'royal']);
  assert.deepEqual(core.allowedThemesFor({ badges: ['member'] }, Date.now() - 1000), []);
});

test('isim stili: XSS ve geçersiz renkler', () => {
  assert.equal(core.sanitizeNameStyle({ type: 'preset', id: 'hack' }, 'ayse'), undefined);
  assert.equal(core.sanitizeNameStyle({ type: 'none' }, 'ayse'), null);
  assert.deepEqual(core.sanitizeNameStyle({ type: 'letters', colors: ['#FFAA00', 'zzz'] }, 'abc').colors, ['#ffaa00', null, null]);
  const html = core.renderNameHtml('<img onerror=x>', { type: 'letters', colors: ['#ff0000'] });
  assert.ok(!html.includes('<img'));
  assert.ok(!core.renderNameHtml('ab', { type: 'letters', colors: ['red;"onload=x', '#00ff00'] }).includes('onload'));
});

test('kullanıcı adı doğrulama', () => {
  assert.ok(core.validateNewUsername('ab'));
  assert.ok(core.validateNewUsername('abcdefghijk'));
  assert.ok(core.validateNewUsername('a<b>c'));
  assert.equal(core.validateNewUsername('Ayşe_1'), null);
});

test('süreli rozet: süresi dolan görünmez, dolmayan görünür', () => {
  const users = require('../users');
  const expired = users._fromRow({ id: '1', username: 'a', badges: ['special', 'member'], badge_expiry: { special: Date.now() - 1000 } });
  assert.deepEqual(expired.badges, ['member']);
  const valid = users._fromRow({ id: '1', username: 'a', badges: ['special'], badge_expiry: { special: Date.now() + 100000 } });
  assert.deepEqual(valid.badges, ['special']);
  assert.equal(users._fromRow({ id: '1', username: 'a', badges: [] , banned: true }).banned, true);
});

test('Destekçi: günlük hak +1 (ÖZEL ile birlikte 3 -> 4)', () => {
  assert.equal(core.effectiveLimitsFor({ badges: ['supporter'] }, settings).dailyLimit, 3);
  assert.equal(core.effectiveLimitsFor({ badges: ['special', 'supporter'] }, settings).dailyLimit, 4);
  assert.equal(core.effectiveLimitsFor({ badges: ['founder', 'supporter'] }, settings).unlimited, true);
});
