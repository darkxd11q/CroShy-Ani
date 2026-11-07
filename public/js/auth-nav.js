// Her sayfanın sağ üstünde AYNI menüyü kurar:
//  misafir  : Giriş Yap (pencere) + Anı Ekle
//  üye      : Anı Ekle · Kod · Profil (isim) · Çıkış
//  admin    : Admin Paneli · Çıkış
// Giriş penceresi, /login ve /register sayfalarıyla AYNI karttır (sunucudan gelir).
// Oturum durumu: sayfadaki tüm betikler AYNI isteği paylaşır (paralel istek yarışı olmasın).
window.getSessionStatus =
  window.getSessionStatus ||
  function () {
    if (!window.__sessionStatusP) window.__sessionStatusP = fetch('/api/session-status').then((r) => r.json());
    return window.__sessionStatusP;
  };

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

  window
    .getSessionStatus()
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

  // Hesap menüsü: Profilim / Genel profilim / Kod / Çıkış tek bir tuşun arkasında
  function accountMenu(name) {
    const root = document.createElement('div');
    root.className = 'nav-menu';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn nav-menu-btn';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Hesap menüsü: ' + name);
    const dot = document.createElement('span');
    dot.className = 'nav-user-dot';
    dot.textContent = (name || '?').charAt(0).toUpperCase();
    const label = document.createElement('span');
    label.className = 'nav-user-name';
    label.textContent = name;
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = '▾';
    btn.append(dot, label, caret);

    const panel = document.createElement('div');
    panel.className = 'nav-menu-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');

    const item = (href, text) => {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'nav-menu-item';
      a.setAttribute('role', 'menuitem');
      a.textContent = text;
      return a;
    };
    const sep = () => {
      const d = document.createElement('div');
      d.className = 'nav-menu-sep';
      d.setAttribute('role', 'separator');
      return d;
    };
    const logout = document.createElement('form');
    logout.method = 'POST';
    logout.action = '/logout';
    const lo = document.createElement('button');
    lo.type = 'submit';
    lo.className = 'nav-menu-item';
    lo.setAttribute('role', 'menuitem');
    lo.textContent = '🚪 Çıkış yap';
    logout.appendChild(lo);

    panel.append(item('/profile', '👤 Profilim'), item('/u/' + encodeURIComponent(name), '🌐 Herkese açık profilim'), item('/redeem', '🎟️ Kod kullan'), sep(), logout);
    root.append(btn, panel);

    const items = () => [...panel.querySelectorAll('[role="menuitem"]')];
    function close(focusBtn) {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
      if (focusBtn) btn.focus();
    }
    function onDoc(e) {
      if (!root.contains(e.target)) close(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') return close(true);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
      }
    }
    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onDoc, true);
      document.addEventListener('keydown', onKey);
    }
    btn.addEventListener('click', () => (panel.hidden ? open() : close(false)));
    return root;
  }

  function addButton() {
    const a = document.createElement('a');
    a.href = '/upload';
    a.className = 'btn primary nav-add';
    const plus = document.createElement('span');
    plus.className = 'nav-add-plus';
    plus.textContent = '＋';
    const text = document.createElement('span');
    text.className = 'nav-add-label';
    text.textContent = 'Anı Ekle';
    a.append(plus, text);
    return a;
  }

  function render(s) {
    cluster.textContent = '';
    if (s.loggedIn && s.isAdmin) {
      cluster.append(link('/admin', 'btn primary', '🛡️ Admin Paneli'), logoutForm('/admin/logout'));
    } else if (s.loggedIn) {
      cluster.append(buildBell(), addButton(), accountMenu(s.username));
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Giriş Yap';
      // Önce sessizce dene: "beni hatırla" 3 ay içinde geçerliyse doğrudan hesaba girer, değilse pencere açılır
      b.addEventListener('click', async () => {
        if (b.disabled) return;
        const old = b.textContent;
        b.disabled = true;
        b.textContent = 'Kontrol ediliyor…';
        try {
          const r = await fetch('/api/quick-login', { method: 'POST' }).then((x) => x.json());
          if (r && r.ok) {
            location.reload();
            return;
          }
        } catch {}
        b.disabled = false;
        b.textContent = old;
        openAuthModal('login');
      });
      cluster.append(b, addButton());
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
  // ---------- Bildirim çanı ----------
  function timeAgo(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'az önce';
    if (s < 3600) return Math.floor(s / 60) + ' dk önce';
    if (s < 86400) return Math.floor(s / 3600) + ' saat önce';
    return Math.floor(s / 86400) + ' gün önce';
  }

  function buildBell() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn bell-btn';
    btn.setAttribute('aria-label', 'Bildirimler');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.append(document.createTextNode('🔔'));
    const badge = document.createElement('span');
    badge.className = 'bell-badge';
    badge.hidden = true;
    btn.appendChild(badge);

    const panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Bildirimler');
    document.body.appendChild(panel);

    const setBadge = (n) => {
      badge.hidden = !n;
      badge.textContent = n > 99 ? '99+' : String(n);
    };
    const refresh = () =>
      fetch('/api/notifications/count')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setBadge(d.unread))
        .catch(() => {});
    refresh();
    setInterval(() => document.visibilityState === 'visible' && refresh(), 60 * 1000);

    function place() {
      const r = btn.getBoundingClientRect();
      panel.style.top = r.bottom + 8 + 'px';
      panel.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    }
    function close() {
      panel.hidden = true;
      document.removeEventListener('click', onDoc, true);
    }
    function onDoc(e) {
      if (!panel.contains(e.target) && !btn.contains(e.target)) close();
    }

    async function open() {
      place();
      panel.hidden = false;
      document.addEventListener('click', onDoc, true);
      panel.textContent = '';
      const loadingEl = document.createElement('div');
      loadingEl.className = 'notif-empty';
      loadingEl.textContent = 'Yükleniyor…';
      panel.appendChild(loadingEl);
      try {
        const d = await fetch('/api/notifications').then((r) => r.json());
        panel.textContent = '';
        const head = document.createElement('div');
        head.className = 'notif-head';
        head.textContent = 'Bildirimler';
        panel.appendChild(head);
        if (!d.items || d.items.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'notif-empty';
          empty.textContent = 'Henüz bildirimin yok.';
          panel.appendChild(empty);
        }
        (d.items || []).forEach((n) => {
          const a = document.createElement(n.link ? 'a' : 'div');
          a.className = 'notif-item' + (n.read ? '' : ' unread');
          if (n.link) a.href = n.link;
          const t = document.createElement('span');
          t.textContent = n.text;
          const time = document.createElement('time');
          time.textContent = timeAgo(n.createdAt);
          a.append(t, time);
          panel.appendChild(a);
        });
        if (d.unread) {
          setBadge(0);
          fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
        }
      } catch {
        panel.textContent = 'Bildirimler yüklenemedi.';
      }
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close()));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && close());
    return btn;
  }

  window.openAuthModal = openAuthModal;
})();
