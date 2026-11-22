// Profil > Taslaklarım: düzenle (açıklama + etiket), paylaş, sil.
(function () {
  const box = document.getElementById('draftList');
  if (!box) return;
  const countEl = document.getElementById('draftCount');
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  async function api(url, body) {
    const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      location.href = '/login?next=' + encodeURIComponent('/profile#acc-taslaklar');
      throw new Error('Giriş gerekli');
    }
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }
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
    if (t) { start = Number(t[1]); rest = rest.slice(t[0].length); }
    return url.slice(0, i + m.length) + 'so_' + start + ',f_jpg,w_' + w + ',c_limit/' + rest.replace(/\.[a-z0-9]+$/i, '.jpg');
  }

  let remaining = 0;
  function updateCount() {
    if (countEl) countEl.textContent = remaining ? '(' + remaining + ')' : '';
    if (remaining === 0 && !box.querySelector('.draft-empty')) box.appendChild(el('div', 'empty-state draft-empty', 'Taslağın yok. Yükleme sayfasında "Taslak olarak kaydet" ile ekleyebilirsin.'));
  }

  function card(d) {
    const c = el('div', 'draft-card');
    c.dataset.id = d.id;
    const media = el('div', 'draft-media');
    const img = document.createElement('img');
    img.src = d.type === 'video' ? poster(d.url, 360) : cloudImg(d.url, 360);
    img.alt = 'Taslak önizlemesi';
    img.loading = 'lazy';
    media.appendChild(img);
    if (d.type === 'video') media.appendChild(el('span', 'draft-play', '▶'));

    const body = el('div', 'draft-body');
    const ta = el('textarea');
    ta.maxLength = 200;
    ta.rows = 2;
    ta.value = d.caption || '';
    ta.placeholder = 'Bu anla ilgili birkaç kelime…';
    ta.setAttribute('aria-label', 'Taslak açıklaması');
    const tagsBox = el('div');
    const tagCtl = window.CroshyTags ? window.CroshyTags.create(tagsBox, { initial: d.tags || [] }) : { getTags: () => d.tags || [] };
    const days = Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 86400000));
    const msg = el('div', 'draft-msg');
    msg.setAttribute('role', 'status');
    const row = el('div', 'draft-actions');
    const save = el('button', 'btn small', '💾 Kaydet');
    const pub = el('button', 'btn small primary', '🚀 Paylaş');
    const del = el('button', 'btn small danger', '🗑️ Sil');
    [save, pub, del].forEach((b) => (b.type = 'button'));
    row.append(save, pub, del);
    body.append(ta, tagsBox, el('small', 'draft-expiry', days + ' gün sonra otomatik silinir'), msg, row);
    c.append(media, body);

    const payload = () => ({ caption: ta.value.trim(), tags: tagCtl.getTags() });
    const say = (m, ok) => { msg.textContent = m; msg.className = 'draft-msg' + (ok ? ' ok' : ' err'); };

    save.addEventListener('click', async () => {
      save.disabled = true;
      try { await api('/api/drafts/' + d.id + '/update', payload()); say('Kaydedildi ✓', true); } catch (e) { say(e.message); }
      save.disabled = false;
    });
    pub.addEventListener('click', async () => {
      pub.disabled = true;
      try {
        await api('/api/drafts/' + d.id + '/publish', payload());
        c.remove();
        remaining -= 1;
        updateCount();
        const ok = el('div', 'status-msg show ok', 'Taslağın onaya gönderildi 🎉 Onaylanınca ana sayfada görünecek.');
        box.prepend(ok);
        setTimeout(() => ok.remove(), 6000);
      } catch (e) {
        say(e.message);
        pub.disabled = false;
      }
    });
    del.addEventListener('click', async () => {
      if (!confirm('Bu taslak silinsin mi? (Yüklediğin dosya da silinir.)')) return;
      del.disabled = true;
      try {
        await api('/api/drafts/' + d.id + '/delete', {});
        c.remove();
        remaining -= 1;
        updateCount();
      } catch (e) {
        say(e.message);
        del.disabled = false;
      }
    });
    return c;
  }

  api('/api/drafts')
    .then((data) => {
      remaining = data.drafts.length;
      data.drafts.forEach((d) => box.appendChild(card(d)));
      updateCount();
    })
    .catch(() => { box.textContent = 'Taslaklar yüklenemedi.'; });
})();
