// Uygulamayı bir araya getirir (dinlemeye başlamaz — testler de bunu kullanır).
const { app } = require('./core');
require('./middleware');
require('./routes/media');
require('./routes/auth');
require('./routes/admin');
require('./routes/pages');
require('./routes/profile');
require('./routes/community');
require('./routes/uploads');
require('./routes/social');
require('./routes/notifications');
require('./routes/legal');
require('./routes/notfound');

module.exports = app;
