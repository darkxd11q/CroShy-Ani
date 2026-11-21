// Bildirim aboneliği uçları.
const core = require('../core');
const { app, asyncRoute, requireUserApi, createRateLimiter } = core;
const push = require('../push');
const pushSubs = require('../../pushSubs');

const pushLimiter = createRateLimiter({ name: 'pushLimiter', windowMs: 60 * 60 * 1000, max: 30, message: 'Çok fazla deneme. Biraz sonra tekrar dene.' });

app.get('/api/push/config', (req, res) => res.json({ enabled: push.isEnabled(), publicKey: push.publicKey() }));

app.post(
  '/api/push/subscribe',
  requireUserApi,
  pushLimiter,
  asyncRoute(async (req, res) => {
    if (!push.isEnabled()) return res.status(503).json({ error: 'Bildirimler bu sunucuda kapalı.' });
    const sub = (req.body && req.body.subscription) || {};
    const endpoint = String(sub.endpoint || '');
    const keys = sub.keys || {};
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 600) return res.status(400).json({ error: 'Geçersiz abonelik.' });
    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return res.status(400).json({ error: 'Geçersiz abonelik anahtarı.' });
    }
    await pushSubs.upsert({ userId: req.session.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.get('user-agent') });
    res.json({ ok: true });
  })
);

app.post(
  '/api/push/unsubscribe',
  requireUserApi,
  asyncRoute(async (req, res) => {
    const endpoint = String((req.body && req.body.endpoint) || '');
    if (endpoint) await pushSubs.removeByEndpoint(endpoint, req.session.userId);
    res.json({ ok: true });
  })
);
