// Admin panelini kategorilere böler: üstte sekme düğmeleri, yalnızca seçili kategori görünür.
// (Sayfadaki bölümler başlıklarına göre gruplanır; hiçbir öğe silinmez, sadece gizlenir.)
(function () {
  const wrap = document.querySelector('.admin-wrap');
  const header = wrap && wrap.querySelector('.admin-topbar');
  if (!wrap || !header) return;

  const CATS = {
    mod: { icon: '📥', label: 'Moderasyon' },
    users: { icon: '👥', label: 'Kullanıcılar' },
    badges: { icon: '🏅', label: 'Rozetler' },
    settings: { icon: '⚙️', label: 'Ayarlar' },
    security: { icon: '🔐', label: 'Güvenlik' },
  };
  const RULES = [
    [/şikayet|geri bildirim|onaylı anı|son silinen|bekle/i, 'mod'],
    [/hesap yönetimi|yasaklı|limit/i, 'users'],
    [/rozet|öne çıkan/i, 'badges'],
    [/ayar/i, 'settings'],
    [/yönetici|işlem kaydı/i, 'security'],
  ];
  const catFor = (el) => {
    // Türkçe kurallı küçük harfe çevir: "İşlem Kaydı" gibi büyük İ, /i bayrağıyla "i" ile eşleşmez
    const t = ((el.querySelector('h1,h2') || {}).textContent || '').trim().toLocaleLowerCase('tr');
    const hit = RULES.find(([re]) => re.test(t));
    return hit ? hit[1] : 'mod';
  };

  // 1) Bölümleri topla (ilk üst çubuk sayfa başlığıdır; onu ve altındaki bekleyenler listesini ayırıyoruz)
  const sections = [];
  let cur = null;
  [...wrap.children].forEach((el) => {
    if (el === header) {
      cur = { cat: 'mod', nodes: [] }; // başlığın hemen altındaki "bekleyenler" içeriği Moderasyon'a girer
      sections.push(cur);
      return;
    }
    if (el.classList.contains('admin-topbar')) {
      cur = { cat: catFor(el), nodes: [el] };
      sections.push(cur);
    } else if (el.id === 'myAdminCard') {
      cur = { cat: 'security', nodes: [el] };
      sections.push(cur);
    } else if (cur) {
      cur.nodes.push(el);
    }
  });

  // 2) Her bölümü kategori paneline sar
  sections.forEach((sec) => {
    if (sec.nodes.length === 0) return;
    const panel = document.createElement('section');
    panel.className = 'admin-sec';
    panel.dataset.cat = sec.cat;
    panel.setAttribute('role', 'tabpanel');
    sec.nodes[0].before(panel);
    sec.nodes.forEach((n) => panel.appendChild(n));
  });

  const cats = Object.keys(CATS).filter((c) => wrap.querySelector('.admin-sec[data-cat="' + c + '"]'));
  if (cats.length < 2) return;

  // 3) Sekme çubuğu (+ moderasyonda bekleyen iş sayısı)
  const pendingWork =
    wrap.querySelectorAll('.pending-item[data-id]').length +
    wrap.querySelectorAll('#report-list .pending-item').length +
    wrap.querySelectorAll('#feedback-list [data-fb-action="approve"]').length;
  const counts = { mod: pendingWork };

  const bar = document.createElement('nav');
  bar.className = 'admin-tabs';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Admin kategorileri');
  cats.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'admin-tab';
    b.dataset.cat = c;
    b.id = 'tab-' + c;
    b.setAttribute('role', 'tab');
    b.append(document.createTextNode(CATS[c].icon + ' ' + CATS[c].label));
    if (counts[c]) {
      const n = document.createElement('span');
      n.className = 'tab-count';
      n.textContent = String(counts[c]);
      b.appendChild(n);
    }
    bar.appendChild(b);
  });
  header.after(bar);

  function show(cat, persist) {
    if (!cats.includes(cat)) cat = cats[0];
    bar.querySelectorAll('.admin-tab').forEach((b) => {
      const on = b.dataset.cat === cat;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    wrap.querySelectorAll('.admin-sec').forEach((p) => {
      p.hidden = p.dataset.cat !== cat;
      p.setAttribute('aria-labelledby', 'tab-' + p.dataset.cat);
    });
    if (persist) {
      try {
        localStorage.setItem('croshy_admin_tab', cat);
      } catch {}
      history.replaceState(null, '', '#tab-' + cat);
    }
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.admin-tab');
    if (b) show(b.dataset.cat, true);
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = cats.indexOf(bar.querySelector('[aria-selected="true"]').dataset.cat);
    const next = cats[(i + (e.key === 'ArrowRight' ? 1 : -1) + cats.length) % cats.length];
    show(next, true);
    bar.querySelector('#tab-' + next).focus();
  });

  let start = location.hash.startsWith('#tab-') ? location.hash.slice(5) : null;
  if (!start) {
    try {
      start = localStorage.getItem('croshy_admin_tab');
    } catch {}
  }
  show(start || 'mod', false);
})();
