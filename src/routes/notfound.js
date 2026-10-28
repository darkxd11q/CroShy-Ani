// 404 — her zaman en son.
const { ROOT, app, path } = require('../core');

// 404 - her zaman en sonda
app.use((req, res) => {
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
});
