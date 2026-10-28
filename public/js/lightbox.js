// Anıyı büyütür. Erişilebilir: odak yönetimi, Esc ile kapanma, Tab tuzağı, ARIA.
let lastFocus = null;

function lbCloudImg(url, width) {
  const m = '/upload/';
  const i = String(url).indexOf(m);
  if (i < 0 || !/\/image\/upload\//.test(url) || /\.gif($|\?)/i.test(url)) return url;
  return url.slice(0, i + m.length) + 'f_auto,q_auto,w_' + width + ',c_limit/' + url.slice(i + m.length);
}

function ensureLightbox() {
  if (document.getElementById('lightbox')) return document.getElementById('lightbox');

  const overlay = document.createElement('div');
  overlay.id = 'lightbox';
  overlay.className = 'lightbox-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anı görüntüleyici');
  overlay.innerHTML = `
    <div class="lightbox-content">
      <button type="button" class="lightbox-close" aria-label="Kapat">✕</button>
      <div class="lightbox-media"></div>
      <div class="lightbox-meta"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') return closeLightbox();
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button, a[href]')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return overlay;
}

function openLightbox({ id, url, type, uploaderName, caption }, opener) {
  const overlay = ensureLightbox();
  const media = overlay.querySelector('.lightbox-media');
  const meta = overlay.querySelector('.lightbox-meta');
  lastFocus = opener || document.activeElement;

  media.textContent = '';
  if (type === 'video') {
    const v = document.createElement('video');
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    media.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = lbCloudImg(url, 1600);
    img.alt = caption || 'Paylaşılan anı';
    media.appendChild(img);
  }

  meta.textContent = [uploaderName, caption].filter(Boolean).join(' — ');
  if (id) {
    const link = document.createElement('a');
    link.href = '/m/' + encodeURIComponent(id);
    link.className = 'lightbox-link';
    link.textContent = '💬 Yorumlar, tepkiler ve paylaş →';
    meta.appendChild(link);
  }

  overlay.classList.add('open');
  document.body.classList.add('lb-lock');
  overlay.querySelector('.lightbox-close').focus();
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('lb-lock');
  setTimeout(() => {
    const media = overlay.querySelector('.lightbox-media');
    if (media) media.textContent = '';
  }, 300);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
