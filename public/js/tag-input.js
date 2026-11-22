// Etiket girişi: yaz + Enter/virgül/boşluk, çipler, ve GERÇEK kullanım verisinden "sık kullanılanlar".
// Kurallar sunucuyla aynıdır: 2-24 harf/rakam/_, en fazla 5, "croshy" kullanılamaz.
(function () {
  const MAX = 5;
  const norm = (t) => String(t || '').toLocaleLowerCase('tr').trim().replace(/^#+/, '');
  const valid = (t) => /^[\p{L}\p{N}_]{2,24}$/u.test(t);
  const banned = (t) => t.replace(/_/g, '') === 'croshy';
  let popularPromise = null;
  const popular = () => (popularPromise = popularPromise || fetch('/api/tags/popular').then((r) => r.json()).then((d) => d.tags || []).catch(() => []));
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function create(root, { initial = [], suggestions = true, onChange } = {}) {
    const tags = [];
    root.textContent = '';
    root.classList.add('tag-input');
    const box = el('div', 'tag-box');
    const input = el('input');
    input.type = 'text';
    input.maxLength = 25;
    input.placeholder = 'Etiket yaz, Enter ile ekle…';
    input.setAttribute('aria-label', 'Etiket ekle');
    const msg = el('div', 'tag-msg');
    msg.setAttribute('role', 'status');
    const suggest = el('div', 'tag-suggest');
    suggest.hidden = true;
    root.append(box, msg, suggest);

    const say = (m) => (msg.textContent = m || '');
    function render() {
      box.textContent = '';
      tags.forEach((t) => {
        const chip = el('span', 'tag-chip', '#' + t);
        const x = el('button', null, '✕');
        x.type = 'button';
        x.setAttribute('aria-label', '#' + t + ' etiketini kaldır');
        x.addEventListener('click', () => {
          tags.splice(tags.indexOf(t), 1);
          render();
          changed();
        });
        chip.appendChild(x);
        box.appendChild(chip);
      });
      box.appendChild(input);
      paintSuggest();
    }
    const changed = () => onChange && onChange(tags.slice());
    function add(raw) {
      const t = norm(raw);
      if (!t) return false;
      if (banned(t)) return say('#croshy etiketi kullanılamaz.'), false;
      if (!valid(t)) return say('Etiket 2-24 harf/rakam olmalı.'), false;
      if (tags.includes(t)) return say(''), true;
      if (tags.length >= MAX) return say('En fazla ' + MAX + ' etiket ekleyebilirsin.'), false;
      tags.push(t);
      say('');
      render();
      changed();
      return true;
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
        e.preventDefault();
        if (add(input.value)) input.value = '';
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        render();
        changed();
        input.focus();
      }
    });
    input.addEventListener('blur', () => {
      if (input.value && add(input.value)) input.value = '';
    });

    let list = [];
    function paintSuggest() {
      suggest.textContent = '';
      const rest = list.filter((s) => !tags.includes(s.tag) && !banned(s.tag));
      suggest.hidden = !suggestions || rest.length === 0; // hiç veri yoksa öneri satırı HİÇ görünmez
      if (suggest.hidden) return;
      suggest.appendChild(el('span', 'tag-suggest-title', 'Sık kullanılanlar:'));
      const row = el('div', 'chip-row');
      rest.forEach((s) => {
        const b = el('button', 'chip', '#' + s.tag + (s.users > 1 ? ' · ' + s.users + ' kişi' : ''));
        b.type = 'button';
        b.dataset.tag = s.tag;
        b.addEventListener('click', () => add(s.tag));
        row.appendChild(b);
      });
      suggest.appendChild(row);
    }
    if (suggestions) popular().then((l) => { list = l; paintSuggest(); });

    initial.forEach((t) => { const n = norm(t); if (n && valid(n) && !banned(n) && !tags.includes(n) && tags.length < MAX) tags.push(n); });
    render();
    return {
      getTags: () => tags.slice(),
      setTags(arr) {
        tags.length = 0;
        (arr || []).forEach((t) => { const n = norm(t); if (n && valid(n) && !banned(n) && !tags.includes(n) && tags.length < MAX) tags.push(n); });
        say('');
        render();
      },
    };
  }

  window.CroshyTags = { create };
  const auto = document.getElementById('tagInput');
  if (auto) window.uploadTags = create(auto);
})();
