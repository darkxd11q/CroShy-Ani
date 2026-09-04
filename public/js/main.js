// ---------- Açılış animasyonu ----------
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
      span.style.animationDelay = letterIndex * 0.045 + 's';
      letterIndex++;
    }
    el.appendChild(span);
  });
}
splitIntroLetters();

window.addEventListener('load', () => {
  const intro = document.getElementById('intro');
  setTimeout(() => {
    intro.classList.add('hide');
    document.body.classList.remove('no-scroll');
    setTimeout(() => intro.remove(), 900);
  }, 2200);
});

// ---------- Çapraz kaydırmalı anı zaman çizgisi ----------
const TIMELINE = document.getElementById('memory-timeline');
const COUNT_EL = document.getElementById('gallery-count');
const SORT_CONTROLS = document.getElementById('sortControls');

let items = [];
let currentSort = 'algorithm';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderMedia(item) {
  return item.type === 'video'
    ? `<video src="${item.url}" muted loop autoplay playsinline></video>`
    : `<img src="${item.url}" alt="${escapeHtml(item.caption || 'anı')}" loading="lazy" />`;
}

function renderRow(item, index) {
  const side = index % 2 === 0 ? 'left' : 'right';
  return `
    <div class="memory-row ${side}">
      <span class="dot-marker"></span>
      <div class="memory-card" data-index="${index}">
        ${renderMedia(item)}
        ${item.type === 'video' ? '<div class="play-icon">▶</div>' : ''}
        <span class="badge">${item.type === 'video' ? '🎬 Video' : '📷 Fotoğraf'}</span>
        <button type="button" class="like-btn ${item.likedByMe ? 'liked' : ''}" data-id="${item.id}">
          <span class="heart">${item.likedByMe ? '❤️' : '🤍'}</span>
          <span class="like-count">${item.likes || 0}</span>
        </button>
        <div class="overlay">
          <div class="meta">
            <div class="name">${escapeHtml(item.uploaderName)}</div>
            ${item.caption ? `<div class="caption">${escapeHtml(item.caption)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachCardEvents() {
  TIMELINE.querySelectorAll('.memory-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.index);
      openLightbox(items[idx]);
    });
  });

  TIMELINE.querySelectorAll('.like-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLike(btn);
    });
  });
}

async function handleLike(btn) {
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/like/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');

    const item = items.find((i) => i.id === id);
    if (item) {
      item.likes = data.count;
      item.likedByMe = data.liked;
    }

    btn.classList.toggle('liked', data.liked);
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

function observeReveal() {
  const rows = TIMELINE.querySelectorAll('.memory-row');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );
  rows.forEach((row) => io.observe(row));
}

async function loadGallery(sort) {
  try {
    const res = await fetch(`/api/approved?sort=${encodeURIComponent(sort)}`);
    items = await res.json();

    COUNT_EL.textContent =
      items.length === 0 ? 'Henüz anı eklenmedi' : `${items.length} anı paylaşıldı`;

    if (items.length === 0) {
      TIMELINE.innerHTML = `<div class="empty-state">Henüz onaylanmış bir anı yok. İlk anıyı sen ekle! 🌱</div>`;
      return;
    }

    TIMELINE.innerHTML = items.map(renderRow).join('');
    attachCardEvents();
    observeReveal();
  } catch (e) {
    TIMELINE.innerHTML = `<div class="empty-state">Anılar yüklenemedi. Sayfayı yenile.</div>`;
  }
}

if (SORT_CONTROLS) {
  SORT_CONTROLS.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sort === currentSort) return;
      currentSort = btn.dataset.sort;
      SORT_CONTROLS.querySelectorAll('.sort-btn').forEach((b) => b.classList.toggle('active', b === btn));
      loadGallery(currentSort);
    });
  });
}

loadGallery(currentSort);
