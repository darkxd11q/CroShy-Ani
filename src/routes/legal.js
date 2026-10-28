// Hukuki sayfalar, hesap silme ve veri dışa aktarma (KVKK).
const { app, asyncRoute, requireUserPage, users, buildOwnProfileData, verifyHashedPassword, deletedUserIds } = require('../core');
const legalText = require('../lib/legalText');
const { deleteAccountPermanently, exportUserData } = require('../services/accounts');

const pages = { '/gizlilik': 'gizlilik', '/kosullar': 'kosullar', '/cerezler': 'cerezler' };
for (const [route, key] of Object.entries(pages)) {
  app.get(route, (req, res) => res.render('legal', { doc: legalText[key], route }));
}

// KVKK: "Verilerimi indir"
app.get(
  '/profile/export',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const user = await users.findUserById(req.session.userId);
    if (!user) return res.redirect('/');
    const data = await exportUserData(user);
    res.setHeader('Content-Disposition', 'attachment; filename="croshy-verilerim.json"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data, null, 2));
  })
);

// KVKK: "Hesabımı sil" (şifre + kullanıcı adı onayı ister; geri alınamaz)
app.post(
  '/profile/delete-account',
  requireUserPage,
  asyncRoute(async (req, res) => {
    const user = await users.findUserById(req.session.userId);
    if (!user) return res.redirect('/');

    const fail = async (msg) => {
      const data = await buildOwnProfileData(req.session.userId, req.session.username);
      return res.render('profile', { ...data, error: msg });
    };
    if (!verifyHashedPassword(req.body.password, user.passwordHash)) return fail('Şifren yanlış.');
    if (String(req.body.confirm || '').trim().toLowerCase() !== user.username.toLowerCase()) {
      return fail('Onay için kullanıcı adını doğru yazmalısın.');
    }

    await deleteAccountPermanently(user);
    deletedUserIds.add(user.id);
    res.clearCookie('croshy_remember', { path: '/' });
    res.clearCookie('croshy_theme', { path: '/' });
    req.session.destroy(() => {
      res.clearCookie('croshy.sid');
      res.redirect('/?hesap=silindi');
    });
  })
);
