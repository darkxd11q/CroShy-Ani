// "Neler yeni?" — güncellemeden sonraki ilk girişte açılan, her özelliğe özgü auralı/animasyonlu tanıtım.
(function () {
  const SKIP = [/^\/admin/, /^\/login/, /^\/register/, /^\/forgot-password/, /^\/upload/, /^\/recovery-codes/, /^\/redeem/];
  if (SKIP.some((re) => re.test(location.pathname))) return;

  const KEY = 'croshy_seen_release';
  const force = new URLSearchParams(location.search).get('whatsnew') === '1';
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const store = {
    get: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
    set: (v) => { try { localStorage.setItem(KEY, v); } catch {} },
  };

  function show(release) {
    const slides = release.slides || [];
    if (!slides.length) return;
    let i = 0;
    let closed = false;

    const overlay = el('div', 'wn-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Güncelleme notları');
    const card = el('div', 'wn-card');
    const aura = el('div', 'wn-aura');
    aura.setAttribute('aria-hidden', 'true');

    const skip = el('button', 'wn-skip', 'Atla ✕');
    skip.type = 'button';
    const head = el('div', 'wn-head');
    head.append(el('span', 'wn-badge', 'YENİ'), el('div', 'wn-release-title', release.title || 'Neler yeni?'));
    if (release.subtitle) head.appendChild(el('div', 'wn-release-sub', release.subtitle));

    const tabs = el('nav', 'wn-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Yenilikler');
    const tabBtns = slides.map((s, idx) => {
      const b = el('button', 'wn-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.i = String(idx);
      b.append(el('span', 'wn-tab-emoji', s.emoji || '✨'), el('span', 'wn-tab-label', s.short || String(idx + 1)));
      tabs.appendChild(b);
      return b;
    });

    const body = el('div', 'wn-slide');
    body.setAttribute('role', 'tabpanel');
    body.setAttribute('aria-live', 'polite');

    const foot = el('div', 'wn-foot');
    const count = el('span', 'wn-count');
    const back = el('button', 'btn ghost small wn-back', '← Geri');
    back.type = 'button';
    const next = el('button', 'btn primary wn-next');
    next.type = 'button';
    foot.append(count, back, next);

    card.append(aura, skip, head, tabs, body, foot);
    overlay.appendChild(card);

    function particles(slide) {
      aura.textContent = '';
      if (reduced()) return;
      const list = slide.particles && slide.particles.length ? slide.particles : [slide.emoji || '✨'];
      for (let n = 0; n < 14; n++) {
        const p = el('span', 'wn-p', list[n % list.length]);
        p.style.setProperty('--x', Math.round(Math.random() * 92) + '%');
        p.style.setProperty('--y', Math.round(10 + Math.random() * 75) + '%');
        p.style.setProperty('--d', (Math.random() * 4).toFixed(2) + 's');
        p.style.setProperty('--t', (4 + Math.random() * 4).toFixed(2) + 's');
        p.style.setProperty('--s', (0.8 + Math.random() * 1.1).toFixed(2));
        p.style.setProperty('--dx', Math.round(Math.random() * 260 - 130) + 'px');
        p.style.setProperty('--dy', Math.round(Math.random() * 220 - 110) + 'px');
        aura.appendChild(p);
      }
    }

    function go(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      const s = slides[i];
      card.dataset.aura = s.aura || 'spark';
      tabBtns.forEach((b, idx) => {
        b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
        b.classList.toggle('done', idx < i);
      });
      body.textContent = '';
      body.appendChild(el('div', 'wn-hero', s.emoji || '✨'));
      body.appendChild(el('h2', 'wn-title', s.title));
      body.appendChild(el('p', 'wn-text', s.text));
      if (s.bullets && s.bullets.length) {
        const ul = el('ul', 'wn-bullets');
        s.bullets.forEach((b) => ul.appendChild(el('li', null, b)));
        body.appendChild(ul);
      }
      body.classList.remove('wn-enter');
      void body.offsetWidth; // animasyonu bu özelliğe özgü yeniden başlat
      body.classList.add('wn-enter');
      particles(s);
      count.textContent = i + 1 + ' / ' + slides.length;
      back.disabled = i === 0;
      next.textContent = i === slides.length - 1 ? 'Hadi başlayalım 🚀' : 'Sonraki →';
    }

    function close() {
      if (closed) return;
      closed = true;
      store.set(release.id);
      fetch('/api/whats-new/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: release.id }) }).catch(() => {});
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('wn-lock');
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 280);
    }
    function onKey(e) {
      if (e.key === 'Escape') return close();
      if (e.key === 'ArrowRight') return go(i + 1);
      if (e.key === 'ArrowLeft') return go(i - 1);
      if (e.key === 'Tab') {
        const f = [...overlay.querySelectorAll('button:not([disabled])')];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.wn-tab');
      if (b) go(Number(b.dataset.i));
    });
    back.addEventListener('click', () => go(i - 1));
    next.addEventListener('click', () => (i >= slides.length - 1 ? close() : go(i + 1)));
    skip.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    document.body.classList.add('wn-lock');
    go(0);
    next.focus();
  }

  // Ana sayfadaki açılış animasyonu bitmeden pencere açılmaz
  function whenReady(cb) {
    let tries = 0;
    const tick = () => {
      if (document.body.classList.contains('no-scroll') && tries++ < 25) return setTimeout(tick, 200);
      setTimeout(cb, location.pathname === '/' ? 500 : 150);
    };
    tick();
  }

  fetch('/api/whats-new?seen=' + encodeURIComponent(store.get()) + (force ? '&force=1' : ''))
    .then((r) => r.json())
    .then((d) => {
      if (d.firstVisit || !d.release) {
        if (d.latestId) store.set(d.latestId);
        return;
      }
      whenReady(() => show(d.release));
    })
    .catch(() => {});

  window.CroshyWhatsNew = { show };
})();
