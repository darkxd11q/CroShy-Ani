// ---------- Açılış animasyonu ----------
// Not: logo yazısı CSS ile başta gizli (#introLogo { visibility: hidden }).
// Font yüklenip harfler hazırlanınca görünür yapılıyor — böylece sayfa
// açılırken beyaz/düz bir "CroShy Anı" yazısı çakılıp sonra renklenmiyor.
function splitIntroLetters() {
  const el = document.getElementById('introLogo');
  if (!el) return;
  const text = el.textContent;
  el.textContent = '';
  let letterIndex = 0;
  [...text].forEach((ch) => {
    const span = document.createElement('span');
    if (ch === ' ') {
      span.className = 'space';
      span.textContent = '\u00A0';
    } else {
      span.className = 'letter';
      span.textContent = ch;
      span.style.animationDelay = letterIndex * 0.035 + 's';
      letterIndex++;
    }
    el.appendChild(span);
  });
  el.classList.add('ready');
}

let introHidden = false;
function hideIntro() {
  if (introHidden) return;
  introHidden = true;
  const intro = document.getElementById('intro');
  document.body.classList.remove('no-scroll');
  if (!intro) return;
  intro.classList.add('hide');
  setTimeout(() => intro.remove(), 800);
}

if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.body.classList.remove('no-scroll'); // hareketi azalt: animasyon yok
}

(function startIntro() {
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 450))]).then(() => {
    splitIntroLetters();
    setTimeout(hideIntro, 1400);
  });
  setTimeout(hideIntro, 3500); // ne olursa olsun takılı kalmasın
})();

// ---------- Çapraz kaydırmalı anı zaman çizgisi (sayfalı / sonsuz kaydırma) ----------
const TIMELINE = document.getElementById('memory-timeline');
const COUNT_EL = document.getElementById('gallery-count');
const SORT_CONTROLS = document.getElementById('sortControls');
const TAG_FILTER = document.getElementById('tagFilter');
const LOAD_BTN = document.getElementById('loadMoreBtn');
const SENTINEL = document.getElementById('loadSentinel');

const PAGE_SIZE = 12;
let items = []; // ekrandaki tüm anılar (sıralı)
let currentSort = 'algorithm';
let currentTag = normalizeTag(new URLSearchParams(location.search).get('tag'));
let token = null; // sunucunun verdiği gezinme belirteci (sıralama sayfalar arasında kaymasın)
let total = 0;
let hasMore = false;
let loading = false;
let loadId = 0;

function normalizeTag(q) {
  return String(q || '').toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 24);
}

// Tüm metin ve öznitelikler kaçışlanır (tırnak dahil)
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cloudinary görsellerini sunucuda küçült + en uygun biçime çevir (GIF hariç)
function optimizeImg(url, width) {
  const m = '/upload/';
  const i = url.indexOf(m);
  if (i < 0 || !/\/image\/upload\//.test(url) || /\.gif($|\?)/i.test(url)) return url;
  return url.slice(0, i + m.length) + 'f_auto,q_auto,w_' + width + ',c_limit/' + url.slice(i + m.length);
}

const REDUCED_MOTION = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);

function renderMedia(item) {
  const label = escapeHtml(item.caption || 'Paylaşılan anı');
  // Videolar ekrana girince yüklenir/oynar (mobil veri ve pil tasarrufu)
  return item.type === 'video'
    ? `<video data-src="${escapeHtml(item.url)}" muted loop playsinline preload="none" aria-label="${label}"></video>`
    : `<img src="${escapeHtml(optimizeImg(item.url, 720))}" alt="${label}" loading="lazy" decoding="async" />`;
}

const NAME_PRESETS = {
  sunrise: 'linear-gradient(90deg,#f97316,#ec4899,#a855f7)',
  ocean: 'linear-gradient(90deg,#22d3ee,#3b82f6,#8b5cf6)',
  mint: 'linear-gradient(90deg,#34d399,#a3e635,#fde047)',
};
function styledName(name, style) {
  if (!style) return escapeHtml(name);
  if (style.type === 'preset' && NAME_PRESETS[style.id]) {
    return '<span class="name-grad" style="background-image:' + NAME_PRESETS[style.id] + '">' + escapeHtml(name) + '</span>';
  }
  if (style.type === 'letters' && Array.isArray(style.colors)) {
    return [...name]
      .map((ch, i) => {
        const c = style.colors[i];
        return /^#[0-9a-fA-F]{6}$/.test(c || '') ? '<span style="color:' + c + '">' + escapeHtml(ch) + '</span>' : escapeHtml(ch);
      })
      .join('');
  }
  return escapeHtml(name);
}

// #etiket ve @kullanıcı bağlantıları (önce kaçış, sonra bağlantı)
function richCaption(text) {
  return escapeHtml(text)
    .replace(/(^|[\s(])#([\p{L}\p{N}_]{2,24})/gu, (m, pre, tag) => `${pre}<a class="tag-link" href="/?tag=${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`)
    .replace(/(^|[\s(])@([\p{L}\p{N}_.\-]{3,10})/gu, (m, pre, name) => {
      const clean = name.replace(/[.\-]+$/, '');
      return `${pre}<a class="mention-link" href="/u/${encodeURIComponent(clean)}">@${clean}</a>${name.slice(clean.length)}`;
    });
}

function renderRow(item, index) {
  const side = index % 2 === 0 ? 'left' : 'right';
  const avatarHtml = item.uploaderAvatar
    ? '<img class="card-avatar" src="' + escapeHtml(item.uploaderAvatar) + '" alt="" />'
    : '';
  return `
    <div class="memory-row ${side}">
      <span class="dot-marker"></span>
      <div class="memory-card" data-index="${index}" tabindex="0" role="button" aria-label="${escapeHtml(item.uploaderName)} anısını büyüt">
        ${renderMedia(item)}
        ${item.type === 'video' ? '<div class="play-icon">▶</div>' : ''}
        <span class="badge">${item.type === 'video' ? '🎬 Video' : '📷 Fotoğraf'}</span>
        <button type="button" class="like-btn ${item.likedByMe ? 'liked' : ''}" data-id="${escapeHtml(item.id)}" aria-pressed="${item.likedByMe ? 'true' : 'false'}" aria-label="Beğen">
          <span class="heart">${item.likedByMe ? '❤️' : '🤍'}</span>
          <span class="like-count">${item.likes || 0}</span>
        </button>
        <div class="overlay">
          <div class="meta">
            <div class="name card-uploader">${avatarHtml}<a href="/u/${encodeURIComponent(item.uploaderName)}" class="uploader-link">${styledName(item.uploaderName, item.uploaderStyle)}</a></div>
            ${item.caption ? `<div class="caption">${richCaption(item.caption)}</div>` : ''}
            <a class="comment-chip" href="/m/${encodeURIComponent(item.id)}#comments" aria-label="Yorumlar">💬 ${item.commentCount || 0}</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---- Olay yönetimi (tek yerden; sonradan eklenen kartlar da çalışır) ----
TIMELINE.addEventListener('click', (e) => {
  const likeBtn = e.target.closest('.like-btn');
  if (likeBtn) {
    e.stopPropagation();
    return handleLike(likeBtn);
  }
  const tagLink = e.target.closest('a.tag-link');
  if (tagLink) {
    e.preventDefault();
    return setTag(normalizeTag(new URL(tagLink.href).searchParams.get('tag')), true);
  }
  if (e.target.closest('a')) return; // gönderen profili / yorumlar: normal gezinme
  const card = e.target.closest('.memory-card');
  if (card && items[Number(card.dataset.index)]) openLightbox(items[Number(card.dataset.index)], card);
});
TIMELINE.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('memory-card')) {
    e.preventDefault();
    const it = items[Number(e.target.dataset.index)];
    if (it) openLightbox(it, e.target);
  }
});

async function handleLike(btn) {
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/like/${encodeURIComponent(id)}`, { method: 'POST' });
    if (res.status === 401) {
      // beğenmek için giriş gerekir (hesap başına 1 beğeni)
      if (window.openAuthModal) window.openAuthModal('login');
      else location.href = '/login?next=/';
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');

    const item = items.find((i) => i.id === id);
    if (item) {
      item.likes = data.count;
      item.likedByMe = data.liked;
    }
    btn.classList.toggle('liked', data.liked);
    btn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
    btn.querySelector('.heart').textContent = data.liked ? '❤️' : '🤍';
    btn.querySelector('.like-count').textContent = data.count;
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 400);
  } catch (e) {
    // sessizce yut, kritik değil
  } finally {
    btn.disabled = false;
  }
}

// ---- Kartların görünür olunca belirmesi + videoların tembel oynatılması ----
const revealIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealIO.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

const videoIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (!v.getAttribute('src')) v.src = v.dataset.src + '#t=0.1';
        if (!REDUCED_MOTION && !SAVE_DATA) {
          const p = v.play();
          if (p && p.catch) p.catch(() => {}); // eski tarayıcılarda play() söz döndürmeyebilir
        }
      } else {
        v.pause();
      }
    });
  },
  { threshold: [0, 0.5] }
);

// ---- Yükleme ----
function updateHeader() {
  if (total === 0 && !loading) COUNT_EL.textContent = currentTag ? `#${currentTag} etiketli anı yok` : 'Henüz anı eklenmedi';
  else COUNT_EL.textContent = `${total} anı ${currentTag ? 'bulundu' : 'paylaşıldı'}`;

  TAG_FILTER.textContent = '';
  TAG_FILTER.hidden = !currentTag;
  if (currentTag) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = '#' + currentTag;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Etiket filtresini temizle');
    clear.textContent = '✕';
    clear.addEventListener('click', () => setTag('', true));
    chip.appendChild(clear);
    TAG_FILTER.appendChild(chip);
  }
}

async function fetchPage(offset) {
  const params = new URLSearchParams({ sort: currentSort, limit: PAGE_SIZE, offset });
  if (currentTag) params.set('tag', currentTag);
  if (token) params.set('token', token);
  const res = await fetch('/api/approved?' + params.toString());
  if (!res.ok) throw new Error('yüklenemedi');
  return res.json();
}

function appendItems(newItems) {
  const start = items.length;
  items.push(...newItems);
  const wrap = document.createElement('div');
  wrap.innerHTML = newItems.map((it, i) => renderRow(it, start + i)).join('');
  [...wrap.children].forEach((row) => {
    TIMELINE.appendChild(row);
    revealIO.observe(row);
    row.querySelectorAll('video[data-src]').forEach((v) => videoIO.observe(v));
  });
}

async function loadGallery() {
  const myLoad = ++loadId;
  items = [];
  token = null;
  total = 0;
  hasMore = false;
  TIMELINE.innerHTML = '<div class="empty-state">Anılar yükleniyor…</div>';
  LOAD_BTN.hidden = true;
  loading = true;
  try {
    const data = await fetchPage(0);
    if (myLoad !== loadId) return;
    token = data.token;
    total = data.total;
    hasMore = data.hasMore;
    TIMELINE.innerHTML = '';
    if (data.items.length === 0) {
      TIMELINE.innerHTML = currentTag
        ? '<div class="empty-state">Bu etikete ait onaylı anı yok.</div>'
        : '<div class="empty-state">Henüz onaylanmış bir anı yok. İlk anıyı sen ekle! 🌱</div>';
    } else {
      appendItems(data.items);
    }
  } catch (e) {
    if (myLoad !== loadId) return;
    TIMELINE.innerHTML = '<div class="empty-state">Anılar yüklenemedi. Sayfayı yenile.</div>';
  } finally {
    if (myLoad === loadId) {
      loading = false;
      updateHeader();
      LOAD_BTN.hidden = !hasMore;
    }
  }
}

async function loadMore() {
  if (loading || !hasMore) return;
  const myLoad = loadId;
  loading = true;
  LOAD_BTN.disabled = true;
  try {
    const data = await fetchPage(items.length);
    if (myLoad !== loadId) return;
    token = data.token;
    total = data.total;
    hasMore = data.hasMore;
    appendItems(data.items);
  } catch (e) {
    // bir sonraki kaydırmada tekrar denenir
  } finally {
    loading = false;
    LOAD_BTN.disabled = false;
    LOAD_BTN.hidden = !hasMore;
    updateHeader();
  }
}

// Sayfanın sonuna yaklaşınca otomatik sonraki sayfayı getir
new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '700px 0px' }).observe(SENTINEL);
LOAD_BTN.addEventListener('click', loadMore);

function setTag(tag, push) {
  currentTag = tag;
  if (push) history.pushState({ tag }, '', tag ? '/?tag=' + encodeURIComponent(tag) : '/');
  loadGallery();
  document.getElementById('galeri').scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}
window.addEventListener('popstate', () => {
  currentTag = normalizeTag(new URLSearchParams(location.search).get('tag'));
  loadGallery();
});

if (SORT_CONTROLS) {
  SORT_CONTROLS.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sort === currentSort) return;
      currentSort = btn.dataset.sort;
      SORT_CONTROLS.querySelectorAll('.sort-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      loadGallery();
    });
  });
}

loadGallery();
