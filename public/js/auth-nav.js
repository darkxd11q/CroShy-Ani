// Ana sayfanın sağ üstüne "Giriş Yap" düğmesi ekler; basınca giriş/kayıt
// penceresi açılır. Giriş yapılmışsa yerine profil bağlantısı gösterilir.
(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const slot = document.createElement('span');
  slot.className = 'auth-nav';
  const anchor = nav.querySelector('a[href="/upload"]');
  if (anchor) nav.insertBefore(slot, anchor);
  else nav.appendChild(slot);

  fetch('/api/session-status')
    .then((r) => r.json())
    .then(render)
    .catch(() => render({ loggedIn: false }));

  function render(s) {
    slot.textContent = '';
    if (s.loggedIn && s.isAdmin) {
      const a = document.createElement('a');
      a.href = '/admin';
      a.className = 'btn';
      a.textContent = '🛡️ Admin Paneli';
      slot.appendChild(a);
    } else if (s.loggedIn) {
      const a = document.createElement('a');
      a.href = '/profile';
      a.className = 'btn nav-user';
      const dot = document.createElement('span');
      dot.className = 'nav-user-dot';
      dot.textContent = (s.username || '?').charAt(0).toUpperCase();
      const name = document.createElement('span');
      name.className = 'nav-user-name';
      name.textContent = s.username;
      a.append(dot, name);
      slot.appendChild(a);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Giriş Yap';
      b.addEventListener('click', () => openModal('login'));
      slot.appendChild(b);
      if (location.hash === '#giris') openModal('login');
    }
  }

  function openModal(tab) {
    if (document.getElementById('authModal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.id = 'authModal';
    overlay.innerHTML =
      '<div class="auth-card" role="dialog" aria-modal="true">' +
      '<button type="button" class="auth-close" aria-label="Kapat">✕</button>' +
      '<div class="auth-tabs"><button type="button" data-tab="login">Giriş Yap</button><button type="button" data-tab="register">Kayıt Ol</button></div>' +
      '<form method="POST" action="/login" class="auth-form" data-form="login">' +
      '<input type="hidden" name="next" value="/" />' +
      '<input type="text" name="username" placeholder="Kullanıcı adı" autocomplete="username" required />' +
      '<input type="password" name="password" placeholder="Şifre" autocomplete="current-password" required />' +
      '<label class="remember-row"><input type="checkbox" name="remember" value="1" /> <span>Beni hatırla <em>(3 ay)</em></span></label>' +
      '<button type="submit" class="btn primary">Giriş Yap</button>' +
      '<p class="auth-switch">Hesabın yok mu? <a href="#" data-go="register">Kayıt ol</a></p></form>' +
      '<form method="POST" action="/register" class="auth-form" data-form="register">' +
      '<input type="hidden" name="next" value="/" />' +
      '<input type="text" name="username" placeholder="Kullanıcı adı (3-10 karakter)" maxlength="10" autocomplete="username" required />' +
      '<input type="password" name="password" placeholder="Şifre (en az 6 karakter)" minlength="6" autocomplete="new-password" required />' +
      '<input type="password" name="confirmPassword" placeholder="Şifre (tekrar)" minlength="6" autocomplete="new-password" required />' +
      '<label class="remember-row"><input type="checkbox" name="remember" value="1" /> <span>Beni hatırla <em>(3 ay)</em></span></label>' +
      '<button type="submit" class="btn primary">Kayıt Ol</button>' +
      '<p class="auth-switch">Zaten hesabın var mı? <a href="#" data-go="login">Giriş yap</a></p></form>' +
      '</div>';
    document.body.appendChild(overlay);

    const show = (t) => {
      overlay.querySelectorAll('.auth-form').forEach((f) => (f.style.display = f.dataset.form === t ? 'flex' : 'none'));
      overlay.querySelectorAll('.auth-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
      const first = overlay.querySelector('.auth-form[data-form="' + t + '"] input[type="text"]');
      if (first) setTimeout(() => first.focus(), 50);
    };
    const close = () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('.auth-close').addEventListener('click', close);
    overlay.querySelectorAll('.auth-tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    overlay.querySelectorAll('[data-go]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        show(a.dataset.go);
      })
    );
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => overlay.classList.add('open'));
    show(tab);
  }
})();
