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

(function startIntro() {
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 450))]).then(() => {
    splitIntroLetters();
    setTimeout(hideIntro, 1400);
  });
  setTimeout(hideIntro, 3500); // ne olursa olsun takılı kalmasın
})();

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

function renderRow(item, index) {
  const side = index % 2 === 0 ? 'left' : 'right';
  const avatarHtml = item.uploaderAvatar
    ? '<img class="card-avatar" src="' + escapeHtml(item.uploaderAvatar) + '" alt="" />'
    : '';
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
            <div class="name card-uploader">${avatarHtml}<a href="/u/${encodeURIComponent(item.uploaderName)}" class="uploader-link" onclick="event.stopPropagation()">${styledName(item.uploaderName, item.uploaderStyle)}</a></div>
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
