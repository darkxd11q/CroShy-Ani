(function () {
  const cfg = window.AVATAR_CFG || {};
  const openBtn = document.getElementById('avatarEditBtn');
  const modal = document.getElementById('avatarModal');
  if (!openBtn || !modal) return;

  const stage = document.getElementById('avatarStage');
  const imgEl = document.getElementById('avatarStageImg');
  const emptyEl = document.getElementById('avatarEmpty');
  const zoomEl = document.getElementById('avatarZoom');
  const fileEl = document.getElementById('avatarFile');
  const saveBtn = document.getElementById('avatarSave');
  const cancelBtn = document.getElementById('avatarCancel');
  const removeBtn = document.getElementById('avatarRemove');
  const statusEl = document.getElementById('avatarStatus');
  const hintEl = document.getElementById('avatarLimitHint');

  const STAGE = 280; // sahne boyutu (px)
  const D = 240; // görünen yuvarlak alanın çapı
  const OFF = (STAGE - D) / 2;
  const MB = 1024 * 1024;

  hintEl.textContent = cfg.canGif
    ? 'En fazla 5 MB (GIF için 8 MB).'
    : 'En fazla 5 MB. (GIF profil fotoğrafı ÖZEL / Plus üyelere özel.)';

  let file = null;
  let isGif = false;
  let natW = 0;
  let natH = 0;
  let minScale = 1;
  let scale = 1;
  let x = 0;
  let y = 0;
  let objectUrl = null;

  const setStatus = (msg, type) => {
    statusEl.textContent = msg || '';
    statusEl.className = 'avatar-status' + (type ? ' ' + type : '');
  };

  function clamp() {
    const w = natW * scale;
    const h = natH * scale;
    x = Math.min(OFF, Math.max(OFF + D - w, x));
    y = Math.min(OFF, Math.max(OFF + D - h, y));
  }
  function apply() {
    clamp();
    imgEl.style.width = natW * scale + 'px';
    imgEl.style.height = natH * scale + 'px';
    imgEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function openModal() {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
  }
  function closeModal() {
    modal.classList.remove('open');
    setTimeout(() => (modal.hidden = true), 200);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    file = null;
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    emptyEl.style.display = '';
    zoomEl.disabled = true;
    saveBtn.disabled = true;
    setStatus('');
  }

  openBtn.addEventListener('click', openModal);
  document.getElementById('profileAvatar').addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  fileEl.addEventListener('change', () => {
    const f = fileEl.files[0];
    fileEl.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return setStatus('Lütfen bir görsel seç.', 'err');

    isGif = f.type === 'image/gif';
    if (isGif && !cfg.canGif) return setStatus('GIF profil fotoğrafı sadece ÖZEL ve Plus üyelere açık.', 'err');
    const limit = isGif ? cfg.maxGifBytes : cfg.maxBytes;
    if (f.size > limit) return setStatus('Dosya çok büyük (en fazla ' + Math.round(limit / MB) + ' MB).', 'err');

    file = f;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    imgEl.onload = () => {
      natW = imgEl.naturalWidth;
      natH = imgEl.naturalHeight;
      minScale = D / Math.min(natW, natH);
      scale = minScale;
      zoomEl.value = 1;
      x = OFF + (D - natW * scale) / 2;
      y = OFF + (D - natH * scale) / 2;
      imgEl.style.display = 'block';
      emptyEl.style.display = 'none';
      zoomEl.disabled = false;
      saveBtn.disabled = false;
      apply();
      setStatus(isGif ? 'GIF seçildi — hareketi korunur ✨' : '');
    };
    imgEl.onerror = () => setStatus('Görsel okunamadı.', 'err');
    imgEl.src = objectUrl;
  });

  // Yakınlaştırma: yuvarlağın merkezi sabit kalsın
  zoomEl.addEventListener('input', () => {
    const cx = OFF + D / 2;
    const cy = OFF + D / 2;
    const ix = (cx - x) / scale;
    const iy = (cy - y) / scale;
    scale = minScale * Number(zoomEl.value);
    x = cx - ix * scale;
    y = cy - iy * scale;
    apply();
  });

  // Sürükleme
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!file) return;
    drag = { px: e.clientX, py: e.clientY, x, y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    x = drag.x + (e.clientX - drag.px);
    y = drag.y + (e.clientY - drag.py);
    apply();
  });
  const endDrag = () => (drag = null);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function cropRect() {
    const sw = D / scale;
    const sx = Math.min(natW - sw, Math.max(0, (OFF - x) / scale));
    const sy = Math.min(natH - sw, Math.max(0, (OFF - y) / scale));
    return { sx, sy, sw };
  }

  // Kırpılan alanı 512x512'ye küçültüp JPEG olarak sıkıştırır (görünür kalite
  // kaybı olmadan çok küçük dosya); yükleme bundan sonra yapılır.
  function cropToBlob() {
    const { sx, sy, sw } = cropRect();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(0, 0, 512, 512);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, sx, sy, sw, sw, 0, 0, 512, 512);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  }

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (res.status === 401) {
      window.location.href = '/login?next=/profile';
      throw new Error('Giriş gerekli');
    }
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }

  saveBtn.addEventListener('click', async () => {
    if (!file) return;
    saveBtn.disabled = true;
    setStatus('Hazırlanıyor…');
    try {
      const conf = await fetch('/api/config').then((r) => r.json());
      if (!conf.cloudName || !conf.uploadPreset) throw new Error('Depolama servisi yapılandırılmamış.');

      const fd = new FormData();
      if (isGif) {
        fd.append('file', file); // GIF: hareket bozulmasın diye olduğu gibi yükle
      } else {
        const blob = await cropToBlob();
        if (!blob) throw new Error('Görsel işlenemedi.');
        fd.append('file', blob, 'avatar.jpg');
      }
      fd.append('upload_preset', conf.uploadPreset);

      setStatus('Yükleniyor…');
      const up = await fetch('https://api.cloudinary.com/v1_1/' + conf.cloudName + '/image/upload', { method: 'POST', body: fd }).then((r) => r.json());
      if (!up.secure_url) throw new Error((up.error && up.error.message) || 'Yükleme başarısız oldu.');

      let finalUrl = up.secure_url;
      if (isGif) {
        // GIF'te kırpma/küçültme Cloudinary tarafında (tüm kareler için) yapılır
        const { sx, sy, sw } = cropRect();
        const marker = '/upload/';
        const i = finalUrl.indexOf(marker);
        if (i !== -1) {
          const tr = 'c_crop,x_' + Math.round(sx) + ',y_' + Math.round(sy) + ',w_' + Math.round(sw) + ',h_' + Math.round(sw) + '/c_scale,w_320/';
          finalUrl = finalUrl.slice(0, i + marker.length) + tr + finalUrl.slice(i + marker.length);
        }
      }

      setStatus('Kaydediliyor…');
      await postJson('/api/profile/avatar', {
        url: finalUrl,
        publicId: up.public_id,
        bytes: up.bytes,
        format: up.format,
      });
      window.location.reload();
    } catch (err) {
      setStatus(err.message, 'err');
      saveBtn.disabled = false;
    }
  });

  removeBtn.addEventListener('click', async () => {
    if (!confirm('Profil fotoğrafın kaldırılsın mı?')) return;
    try {
      await postJson('/api/profile/avatar/remove');
      window.location.reload();
    } catch (err) {
      setStatus(err.message, 'err');
    }
  });
})();
