// Her sayfanın sağ üstünde AYNI menüyü kurar:
//  misafir  : Giriş Yap (pencere) + Anı Ekle
//  üye      : Anı Ekle · Kod · Profil (isim) · Çıkış
//  admin    : Admin Paneli · Çıkış
// Giriş penceresi, /login ve /register sayfalarıyla AYNI karttır (sunucudan gelir).
(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const social = nav.querySelector('.social-dropdown');
  const greeting = nav.querySelector('#userGreeting'); // yükleme sayfasının karşılama metni
  Array.from(nav.children).forEach((ch) => {
    if (ch !== social && ch !== greeting) ch.remove();
  });
  const cluster = document.createElement('span');
  cluster.className = 'nav-cluster';
  nav.appendChild(cluster);

  fetch('/api/session-status')
    .then((r) => r.json())
    .then(render)
    .catch(() => render({ loggedIn: false }));

  function link(href, cls, text) {
    const a = document.createElement('a');
    a.href = href;
    a.className = cls;
    a.textContent = text;
    return a;
  }
  function logoutForm(action) {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = action;
    f.className = 'nav-logout';
    const b = document.createElement('button');
    b.type = 'submit';
    b.className = 'btn small';
    b.textContent = 'Çıkış';
    f.appendChild(b);
    return f;
  }

  function render(s) {
    cluster.textContent = '';
    if (s.loggedIn && s.isAdmin) {
      cluster.append(link('/admin', 'btn primary', '🛡️ Admin Paneli'), logoutForm('/admin/logout'));
    } else if (s.loggedIn) {
      const profile = link('/profile', 'btn nav-user', '');
      const dot = document.createElement('span');
      dot.className = 'nav-user-dot';
      dot.textContent = (s.username || '?').charAt(0).toUpperCase();
      const name = document.createElement('span');
      name.className = 'nav-user-name';
      name.textContent = s.username;
      profile.append(dot, name);
      cluster.append(link('/upload', 'btn primary', '+ Anı Ekle'), link('/redeem', 'btn', '🎟️ Kod'), profile, logoutForm('/logout'));
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Giriş Yap';
      b.addEventListener('click', () => openAuthModal('login'));
      cluster.append(b, link('/upload', 'btn primary', '+ Anı Ekle'));
      if (location.hash === '#giris') openAuthModal('login');
    }
  }

  async function openAuthModal(tab) {
    if (document.getElementById('authModal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.id = 'authModal';
    document.body.appendChild(overlay);

    try {
      const html = await fetch('/auth-card?tab=' + encodeURIComponent(tab || 'login') + '&next=' + encodeURIComponent(location.pathname === '/login' ? '/' : location.pathname)).then((r) => r.text());
      overlay.innerHTML = html;
    } catch {
      overlay.remove();
      location.href = '/login';
      return;
    }

    const card = overlay.querySelector('.auth-card');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'auth-close';
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.textContent = '✕';
    card.appendChild(closeBtn);

    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    function close() {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener('keydown', onKey);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    // sekme geçişleri (sayfadaki kartla aynı davranış)
    card.querySelectorAll('.auth-tabs button').forEach((b) => b.addEventListener('click', () => (card.dataset.tab = b.dataset.tab)));
    card.querySelectorAll('[data-go]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        card.dataset.tab = a.dataset.go;
      })
    );
    requestAnimationFrame(() => overlay.classList.add('open'));
  }
  window.openAuthModal = openAuthModal;
})();
