// Ana sayfada "Geçen yıl bugün" şeridi (o gün geçmiş yıllarda paylaşılan anılar). Yoksa hiç görünmez.
(function () {
  const box = document.getElementById('onThisDay');
  if (!box) return;

  function cloudImg(url, w) {
    const m = '/upload/';
    const i = url.indexOf(m);
    if (i < 0 || !/\/image\/upload\//.test(url) || /\.gif($|\?)/i.test(url)) return url;
    return url.slice(0, i + m.length) + 'f_auto,q_auto,w_' + w + ',c_limit/' + url.slice(i + m.length);
  }
  // Videonun (kırpılmışsa kırpılan bölümün ilk karesinden) JPEG önizlemesi
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
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  fetch('/api/on-this-day')
    .then((r) => r.json())
    .then((d) => {
      if (!d.groups || d.groups.length === 0) return;
      box.textContent = '';
      box.appendChild(el('h2', 'otd-title', '📅 Geçen yıl bugün'));
      d.groups.forEach((g) => {
        const sec = el('div', 'otd-group');
        sec.appendChild(el('h3', 'otd-sub', g.yearsAgo + ' yıl önce bugün (' + g.year + ')'));
        const row = el('div', 'otd-scroll');
        g.items.forEach((it) => {
          const a = el('a', 'otd-card');
          a.href = '/m/' + encodeURIComponent(it.id);
          const img = document.createElement('img');
          img.src = it.type === 'video' ? poster(it.url, 360) : cloudImg(it.url, 360);
          img.alt = it.caption || 'Anı';
          img.loading = 'lazy';
          a.appendChild(img);
          if (it.type === 'video') a.appendChild(el('span', 'otd-play', '▶'));
          const meta = el('div', 'otd-meta');
          meta.appendChild(el('strong', null, it.uploaderName));
          if (it.caption) meta.appendChild(el('span', null, it.caption.length > 50 ? it.caption.slice(0, 50) + '…' : it.caption));
          a.appendChild(meta);
          row.appendChild(a);
        });
        sec.appendChild(row);
        box.appendChild(sec);
      });
      box.hidden = false;
    })
    .catch(() => {});
})();
