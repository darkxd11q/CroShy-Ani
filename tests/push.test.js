require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const push = require('../src/push');

test('push: anahtar yoksa kapalı; varsa tüm cihazlara gider, ölü abonelik silinir, beğeni/tepki gitmez', async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(push.isEnabled(), false);
  assert.deepEqual(await push.sendToUser('u1', { type: 'comment', text: 'x' }), { sent: 0 });

  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  const sent = [];
  const removed = [];
  const details = [];
  push.__setDeps({
    webpush: {
      setVapidDetails: (...a) => details.push(a),
      async sendNotification(sub, payload) {
        if (sub.endpoint === 'https://dead') { const e = new Error('gone'); e.statusCode = 410; throw e; }
        if (sub.endpoint === 'https://bozuk') { const e = new Error('hata'); e.statusCode = 500; throw e; }
        sent.push({ sub, payload: JSON.parse(payload) });
      },
    },
    store: {
      async listForUser() { return [{ endpoint: 'https://ok', p256dh: 'a', auth: 'b' }, { endpoint: 'https://dead', p256dh: 'c', auth: 'd' }, { endpoint: 'https://bozuk', p256dh: 'e', auth: 'f' }]; },
      async removeByEndpoint(ep) { removed.push(ep); },
    },
  });
  const r = await push.sendToUser('u1', { type: 'comment', text: 'Ayşe anına yorum yaptı', link: '/m/1' });
  assert.equal(r.sent, 1);
  assert.deepEqual(sent[0].payload, { title: 'CroShy Anı', body: 'Ayşe anına yorum yaptı', url: '/m/1', tag: 'comment' });
  assert.deepEqual(removed, ['https://dead']); // yalnızca 404/410 silinir, 500 silinmez
  assert.equal(details.length, 1);
  assert.equal((await push.sendToUser('u1', { type: 'like', text: 'x' })).sent, 0);
  assert.equal((await push.sendToUser('u1', { type: 'reaction', text: 'x' })).sent, 0);
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});
