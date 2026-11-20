require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginGuard, createRateLimiter } = require('../auth');
const rateState = require('../rateState');

test('adlı giriş koruması: 5 hatada kilitlenir ve durum kalıcılık kuyruğuna yazılır', () => {
  const g = createLoginGuard({ name: 'testGuardA' });
  for (let i = 0; i < 5; i++) g.registerFailedAttempt('1.2.3.4');
  assert.equal(g.getLoginStatus('1.2.3.4').locked, true);
  const saved = rateState.__dirty().find((r) => r.name === 'testGuardA' && r.key === '1.2.3.4');
  assert.ok(saved, 'kuyrukta yok');
  assert.ok(saved.state.lockedUntil > Date.now());
  assert.ok(saved.expires_at > Date.now());
  g.resetAttempts('1.2.3.4');
  assert.equal(g.getLoginStatus('1.2.3.4').locked, false);
  assert.ok(rateState.__removed().some((r) => r.name === 'testGuardA'));
  assert.ok(!rateState.__dirty().some((r) => r.name === 'testGuardA'));
});

test('adsız koruma kalıcılığa yazmaz (davranış aynı)', () => {
  const g = createLoginGuard();
  for (let i = 0; i < 5; i++) g.registerFailedAttempt('9.9.9.9');
  assert.equal(g.getLoginStatus('9.9.9.9').locked, true);
  assert.ok(!rateState.__dirty().some((r) => r.key === '9.9.9.9'));
});

test('adlı hız sınırlayıcı: limit aşılınca 429 ve sayaç kuyruğa yazılır', () => {
  const limiter = createRateLimiter({ name: 'testLimiterA', windowMs: 60000, max: 2, message: 'dur' });
  let status = null;
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  const run = () => limiter({ ip: '5.5.5.5' }, res, () => {});
  run(); run();
  assert.equal(status, null);
  run();
  assert.equal(status, 429);
  assert.equal(rateState.__dirty().find((r) => r.name === 'testLimiterA').state.count, 3);
});
