// /api/admin altındaki tüm değiştirici işlemleri kaydeder (oturum açıldıktan sonra, rotalardan önce).
const { app } = require('./core');
const { auditMiddleware } = require('./audit');

app.use('/api/admin', auditMiddleware);
