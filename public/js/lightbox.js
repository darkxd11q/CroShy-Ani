function ensureLightbox() {
  if (document.getElementById('lightbox')) return document.getElementById('lightbox');

  const overlay = document.createElement('div');
  overlay.id = 'lightbox';
  overlay.className = 'lightbox-overlay';
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
    if (e.key === 'Escape') closeLightbox();
  });

  return overlay;
}

function openLightbox({ url, type, uploaderName, caption }) {
  const overlay = ensureLightbox();
  const media = overlay.querySelector('.lightbox-media');
  const meta = overlay.querySelector('.lightbox-meta');

  media.innerHTML =
    type === 'video'
      ? `<video src="${url}" controls autoplay playsinline></video>`
      : `<img src="${url}" alt="" />`;

  meta.textContent = [uploaderName, caption].filter(Boolean).join(' — ');

  overlay.classList.add('open');
  document.body.classList.add('lb-lock');
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('lb-lock');
  setTimeout(() => {
    const media = overlay.querySelector('.lightbox-media');
    if (media) media.innerHTML = '';
  }, 300);
}
