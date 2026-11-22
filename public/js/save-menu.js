// "🔖 Kaydet": kullanıcının kendi listelerine anı ekle/çıkar, yeni liste oluştur.
(function () {
  let pop = null;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  async function call(url, body) {
    const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (window.openAuthModal) window.openAuthModal('login');
      throw Object.assign(new Error('Giriş gerekli'), { auth: true });
    }
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }
  function onDoc(e) {
    if (pop && !pop.contains(e.target) && !e.target.closest('.save-open, #saveBtn')) close();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    if (pop) pop.remove();
    pop = null;
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey);
  }

  async function open(anchor, itemId, { onChange } = {}) {
    close();
    pop = el('div', 'save-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Listeye kaydet');
    const title = el('div', 'save-title', '🔖 Listeye kaydet');
    const rows = el('div', 'save-rows');
    const msg = el('div', 'save-msg');
    msg.setAttribute('role', 'status');
    const create = el('form', 'save-create');
    const input = el('input');
    input.type = 'text';
    input.maxLength = 30;
    input.placeholder = 'Yeni liste (örn. Komik Anlar)';
    input.setAttribute('aria-label', 'Yeni liste adı');
    const add = el('button', 'btn small primary', 'Ekle');
    add.type = 'submit';
    create.append(input, add);
    const link = el('a', 'save-link', 'Tüm listelerim →');
    link.href = '/koleksiyonlar';
    pop.append(title, rows, msg, create, link);
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    const w = 270;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = r.top > 320 ? Math.max(8, r.top - 8 - 300) + 'px' : r.bottom + 8 + 'px';

    const state = { lists: [] };
    const notify = () => onChange && onChange({ saved: state.lists.some((l) => l.hasItem) });
    function paint() {
      rows.textContent = '';
      if (state.lists.length === 0) rows.appendChild(el('div', 'save-empty', 'Henüz listen yok. İlk listeni oluştur — örn. "Favoriler".'));
      state.lists.forEach((l) => {
        const b = el('button', 'save-row' + (l.hasItem ? ' on' : ''));
        b.type = 'button';
        b.dataset.id = l.id;
        b.setAttribute('aria-pressed', l.hasItem ? 'true' : 'false');
        b.append(el('span', 'save-check', l.hasItem ? '✓' : ''), el('span', 'save-name', l.name), el('small', null, String(l.count)));
        rows.appendChild(b);
      });
    }
    try {
      state.lists = (await call('/api/collections?item=' + encodeURIComponent(itemId))).collections;
      paint();
      notify();
    } catch (e) {
      close();
      if (!e.auth) alert(e.message);
      return;
    }

    rows.addEventListener('click', async (e) => {
      const b = e.target.closest('.save-row');
      if (!b) return;
      msg.textContent = '';
      try {
        const d = await call('/api/collections/' + b.dataset.id + '/toggle', { itemId });
        const l = state.lists.find((x) => String(x.id) === b.dataset.id);
        l.hasItem = d.saved;
        l.count += d.saved ? 1 : -1;
        paint();
        notify();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
    create.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      msg.textContent = '';
      try {
        const d = await call('/api/collections', { name, itemId });
        state.lists.push({ id: d.collection.id, name: d.collection.name, count: 1, hasItem: true });
        input.value = '';
        paint();
        notify();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
    setTimeout(() => {
      document.addEventListener('click', onDoc, true);
      document.addEventListener('keydown', onKey);
    }, 0);
  }

  window.CroshySave = { open, close };
})();
