(function () {
  const input = document.getElementById('searchInput');
  if (!input) return;
  const form = document.getElementById('searchForm');
  const trendingBox = document.getElementById('trendingBox');
  const trending = document.getElementById('trending');
  const peopleBox = document.getElementById('peopleBox');
  const people = document.getElementById('people');
  const tagsBox = document.getElementById('tagsBox');
  const tagResults = document.getElementById('tagResults');
  const itemsBox = document.getElementById('itemsBox');
  const items = document.getElementById('items');
  const more = document.getElementById('searchMore');
  const status = document.getElementById('searchStatus');

  const LIMIT = 20;
  let q = '';
  let offset = 0;
  let seq = 0;
  let timer = null;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  function cloudImg(url, w) {
    const m = '/upload/';
    const i = url.indexOf(m);
    if (i < 0 || !/\/image\/upload\//.test(url) || /\.gif($|\?)/i.test(url)) return url;
    return url.slice(0, i + m.length) + 'f_auto,q_auto,w_' + w + ',c_limit/' + url.slice(i + m.length);
  }
  function poster(url, w) {
    const m = '/upload/';
    const i = url.indexOf(m);
    if (i < 0) return '';
    let rest = url.slice(i + m.length);
    let start = 0;
    const t = rest.match(/^so_(\d+),du_\d+\//);
    if (t) {
      start = Number(t[1]);
      rest = rest.slice(t[0].length);
    }
    return url.slice(0, i + m.length) + 'so_' + start + ',f_jpg,w_' + w + ',c_limit/' + rest.replace(/\.[a-z0-9]+$/i, '.jpg');
  }

  function card(it) {
    const a = el('a', 'search-card');
    a.href = '/m/' + encodeURIComponent(it.id);
    const img = document.createElement('img');
    img.src = it.type === 'video' ? poster(it.url, 480) : cloudImg(it.url, 480);
    img.alt = it.caption || 'Anı';
    img.loading = 'lazy';
    a.appendChild(img);
    if (it.type === 'video') a.appendChild(el('span', 'search-badge', '▶'));
    const meta = el('div', 'search-meta');
    meta.appendChild(el('strong', null, it.uploaderName));
    if (it.caption) meta.appendChild(el('span', null, it.caption.length > 70 ? it.caption.slice(0, 70) + '…' : it.caption));
    meta.appendChild(el('small', null, '❤️ ' + (it.likes || 0) + (it.commentCount ? '  💬 ' + it.commentCount : '')));
    a.appendChild(meta);
    return a;
  }
  function tagChip(tag, count) {
    const b = el('button', 'chip', '#' + tag + (count ? ' (' + count + ')' : ''));
    b.type = 'button';
    b.addEventListener('click', () => {
      input.value = '#' + tag;
      schedule(0);
    });
    return b;
  }

  function clearResults() {
    items.textContent = '';
    people.textContent = '';
    tagResults.textContent = '';
    peopleBox.hidden = tagsBox.hidden = itemsBox.hidden = more.hidden = true;
  }

  async function run(reset) {
    const my = ++seq;
    if (q.length < 2) {
      clearResults();
      trendingBox.hidden = trending.childElementCount === 0;
      status.textContent = q.length === 1 ? 'En az 2 karakter yaz.' : '';
      return;
    }
    trendingBox.hidden = true;
    if (reset) offset = 0;
    status.textContent = 'Aranıyor…';
    const res = await fetch('/api/search?q=' + encodeURIComponent(q) + '&offset=' + offset + '&limit=' + LIMIT);
    const d = await res.json();
    if (my !== seq) return;
    if (!res.ok) {
      status.textContent = d.error || 'Arama başarısız.';
      return;
    }
    if (reset) {
      clearResults();
      (d.users || []).forEach((u) => {
        const a = el('a', 'chip', '@' + u.username + ' (' + u.count + ')');
        a.href = '/u/' + encodeURIComponent(u.username);
        people.appendChild(a);
      });
      (d.tags || []).forEach((t) => tagResults.appendChild(tagChip(t.tag, t.count)));
      peopleBox.hidden = people.childElementCount === 0;
      tagsBox.hidden = tagResults.childElementCount === 0;
    }
    d.items.forEach((it) => items.appendChild(card(it)));
    offset = d.nextOffset;
    more.hidden = !d.hasMore;
    itemsBox.hidden = items.childElementCount === 0;
    const nothing = d.total === 0 && peopleBox.hidden && tagsBox.hidden;
    status.textContent = nothing ? 'Sonuç bulunamadı.' : d.total + ' anı bulundu';
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = input.value.trim().slice(0, 60);
      history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
      run(true).catch(() => (status.textContent = 'Arama başarısız.'));
    }, ms);
  }

  input.addEventListener('input', () => schedule(250));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    schedule(0);
  });
  more.addEventListener('click', () => run(false).catch(() => {}));

  fetch('/api/tags/trending')
    .then((r) => r.json())
    .then((d) => {
      (d.tags || []).forEach((t) => trending.appendChild(tagChip(t.tag, t.count)));
      trendingBox.hidden = trending.childElementCount === 0 || q.length >= 2;
    })
    .catch(() => (trendingBox.hidden = true));

  if (input.value.trim()) schedule(0);
})();
