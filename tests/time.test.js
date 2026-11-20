require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { startOfTodayTR, nextMidnightTR, DAY_MS } = require('../src/lib/time');

test('günlük hak Türkiye saatiyle gece yarısı yenilenir (UTC değil)', () => {
  const t = (s) => Date.parse(s);
  // 23:59 TR (= 20:59 UTC) hâlâ "bugün"; başlangıç bir önceki gün 00:00 TR (= 21:00 UTC)
  assert.equal(startOfTodayTR(t('2026-10-09T20:59:59Z')), t('2026-10-08T21:00:00Z'));
  // 00:00 TR (= 21:00 UTC) yeni gün
  assert.equal(startOfTodayTR(t('2026-10-09T21:00:00Z')), t('2026-10-09T21:00:00Z'));
  // 03:00 TR (UTC gece yarısı): eski sistemde burada sıfırlanıyordu — artık sıfırlanmaz
  assert.equal(startOfTodayTR(t('2026-10-09T00:00:00Z')), t('2026-10-08T21:00:00Z'));
  assert.equal(nextMidnightTR(t('2026-10-09T10:00:00Z')), t('2026-10-09T21:00:00Z'));
  assert.equal(nextMidnightTR(t('2026-10-09T10:00:00Z')) - startOfTodayTR(t('2026-10-09T10:00:00Z')), DAY_MS);
});
