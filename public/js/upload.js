const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const filenameEl = document.getElementById('filename');
const form = document.getElementById('upload-form');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');
const progressBar = document.getElementById('progressBar');
const progressSpan = progressBar.querySelector('span');
const userGreeting = document.getElementById('userGreeting');
const quotaInfo = document.getElementById('quotaInfo');
const trimField = document.getElementById('trimField');
const trimSlider = document.getElementById('trimSlider');
const trimStartLabel = document.getElementById('trimStartLabel');
const trimEndLabel = document.getElementById('trimEndLabel');
const trimTotalLabel = document.getElementById('trimTotalLabel');

let selectedFile = null;
let config = null;
let remainingToday = null;
let sizeLimitExempt = false;
let videoDuration = null; // saniye, sadece video seçiliyken
let needsTrim = false;

const MAX_VIDEO_DURATION_SEC = 150; // 2:30 — /api/config ile senkron

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Giriş kontrolü + kalan günlük hak bilgisi
fetch('/api/me')
  .then((r) => {
    if (r.status === 401) {
      window.location.href = '/login';
      throw new Error('Giriş gerekli');
    }
    return r.json();
  })
  .then((me) => {
    userGreeting.textContent = `Merhaba, ${me.username}`;
    remainingToday = me.remainingToday;
    sizeLimitExempt = !!me.sizeLimitExempt;

    const limitNote = sizeLimitExempt
      ? ' · Dosya boyutu/süre sınırın kaldırılmış ✨'
      : ` · Foto en fazla ${formatMb(me.maxImageBytes)}, video en fazla ${formatMb(me.maxVideoBytes)} / 2:30`;

    if (remainingToday <= 0) {
      quotaInfo.textContent = `Bugünkü gönderme hakkını kullandın (günde en fazla ${me.dailyLimit} anı). Yarın tekrar deneyebilirsin.`;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Bugünlük hakkın doldu';
    } else {
      quotaInfo.textContent = `Bugün için ${remainingToday}/${me.dailyLimit} gönderme hakkın kaldı.${limitNote}`;
    }
  })
  .catch(() => {});

// Cloudinary config'i (ve boyut/süre limitlerini) backend'den al
fetch('/api/config')
  .then((r) => r.json())
  .then((c) => (config = c))
  .catch(() => showStatus('Sunucu ayarlarına ulaşılamadı.', 'err'));

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    handleFile(file);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  selectedFile = file;
  videoDuration = null;
  needsTrim = false;
  trimField.style.display = 'none';
  filenameEl.textContent = `${file.name} (${formatMb(file.size)})`;

  if (!file.type.startsWith('video/')) return;

  const limit = (config && config.maxVideoDurationSec) || MAX_VIDEO_DURATION_SEC;

  try {
    filenameEl.textContent += ' · süre okunuyor…';
    const duration = await getVideoDuration(file);
    videoDuration = duration;

    if (duration == null) {
      filenameEl.textContent = `${file.name} (${formatMb(file.size)})`;
      return;
    }

    filenameEl.textContent = `${file.name} (${formatMb(file.size)}, ${formatTime(duration)})`;

    if (duration > limit + 0.5) {
      needsTrim = true;
      const maxStart = Math.max(0, Math.floor(duration - limit));
      trimSlider.max = String(maxStart);
      trimSlider.value = '0';
      trimTotalLabel.textContent = formatTime(duration);
      updateTrimLabels();
      trimField.style.display = 'block';
      showStatus(
        `Bu video ${formatTime(duration)} uzunluğunda — en fazla 2:30 gönderebilirsin. Aşağıdan hangi bölümü göndermek istediğini seçebilirsin.`,
        'info'
      );
    }
  } catch {
    filenameEl.textContent = `${file.name} (${formatMb(file.size)})`;
  }
}

function updateTrimLabels() {
  const start = Number(trimSlider.value);
  const limit = (config && config.maxVideoDurationSec) || MAX_VIDEO_DURATION_SEC;
  const end = videoDuration ? Math.min(start + limit, videoDuration) : start + limit;
  trimStartLabel.textContent = formatTime(start);
  trimEndLabel.textContent = formatTime(end);
}
trimSlider.addEventListener('input', updateTrimLabels);

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg show ${type}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (remainingToday !== null && remainingToday <= 0) {
    showStatus('Bugünkü gönderme hakkını kullandın. Yarın tekrar deneyebilirsin.', 'err');
    return;
  }
  if (!selectedFile) {
    showStatus('Lütfen bir fotoğraf veya video seç.', 'err');
    return;
  }
  const captionValue = document.getElementById('caption').value.trim();
  if (!captionValue) {
    showStatus('Açıklama yazman zorunlu.', 'err');
    document.getElementById('caption').focus();
    return;
  }
  if (!config || !config.cloudName || !config.uploadPreset) {
    showStatus('Depolama servisi yapılandırılmamış. Sunucu .env dosyasını kontrol et.', 'err');
    return;
  }

  const isVideo = selectedFile.type.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';
  const sizeLimit = isVideo ? config.maxVideoBytes : config.maxImageBytes;
  const durationLimit = config.maxVideoDurationSec || MAX_VIDEO_DURATION_SEC;

  submitBtn.disabled = true;

  let fileToUpload = selectedFile;

  if (isVideo && needsTrim && !sizeLimitExempt) {
    submitBtn.textContent = 'Video kırpılıyor…';
    showStatus('Seçtiğin bölüm hazırlanıyor…', 'info');
    const trimmed = await compressVideo(selectedFile, sizeLimit, {
      trimStart: Number(trimSlider.value),
      trimDuration: durationLimit,
      onProgress: (pct) => showStatus(`Video hazırlanıyor… %${pct}`, 'info'),
    });

    if (!trimmed) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Onaya Gönder';
      showStatus(
        'Tarayıcın video kırpmayı desteklemiyor. Lütfen videoyu göndermeden önce başka bir uygulamayla 2:30 veya altına kısalt.',
        'err'
      );
      return;
    }
    fileToUpload = trimmed;
  } else if (!sizeLimitExempt) {
    try {
      if (isVideo) {
        submitBtn.textContent = 'Video sıkıştırılıyor…';
        showStatus('Video sıkıştırılıyor, bu biraz sürebilir…', 'info');
        fileToUpload = await compressVideo(selectedFile, sizeLimit, {
          onProgress: (pct) => showStatus(`Video sıkıştırılıyor… %${pct}`, 'info'),
        });
      } else {
        submitBtn.textContent = 'Fotoğraf sıkıştırılıyor…';
        showStatus('Fotoğraf sıkıştırılıyor…', 'info');
        fileToUpload = await compressImage(selectedFile, sizeLimit);
      }
    } catch {
      fileToUpload = selectedFile; // sıkıştırma başarısız olursa orijinali dene
    }

    if (fileToUpload.size > sizeLimit) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Onaya Gönder';
      progressBar.style.display = 'none';
      showStatus(
        `Dosya, sıkıştırma sonrasında bile ${isVideo ? 'video' : 'fotoğraf'} sınırı olan ${formatMb(sizeLimit)}'ı aşıyor (${formatMb(fileToUpload.size)}). Lütfen daha küçük/kısa bir dosya seç.`,
        'err'
      );
      return;
    }
  }

  submitBtn.textContent = 'Yükleniyor…';
  progressBar.style.display = 'block';
  showStatus('Medya yükleniyor, lütfen bekle…', 'info');

  try {
    const cloudUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`;
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('upload_preset', config.uploadPreset);

    const cloudResult = await uploadWithProgress(cloudUrl, formData, (pct) => {
      progressSpan.style.width = pct + '%';
    });

    if (!cloudResult.secure_url) {
      throw new Error(cloudResult.error?.message || 'Yükleme başarısız oldu.');
    }

    submitBtn.textContent = 'Onaya gönderiliyor…';

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: cloudResult.secure_url,
        publicId: cloudResult.public_id,
        type: resourceType,
        bytes: cloudResult.bytes,
        durationSec: cloudResult.duration || null,
        caption: captionValue,
      }),
    });

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Kayıt başarısız oldu.');

    showStatus('Teşekkürler! Anın admin onayına gönderildi. Onaylandığında ana sayfada görünecek. 🎉', 'ok');
    form.reset();
    filenameEl.textContent = '';
    selectedFile = null;
    videoDuration = null;
    needsTrim = false;
    trimField.style.display = 'none';
    progressBar.style.display = 'none';
    progressSpan.style.width = '0%';

    if (typeof remainingToday === 'number') {
      remainingToday -= 1;
      if (remainingToday <= 0) {
        quotaInfo.textContent = 'Bugünkü gönderme hakkını kullandın. Yarın tekrar deneyebilirsin.';
        submitBtn.textContent = 'Bugünlük hakkın doldu';
        submitBtn.disabled = true;
        return;
      }
      quotaInfo.textContent = `Bugün için ${remainingToday} gönderme hakkın kaldı.`;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Onaya Gönder';
  } catch (err) {
    showStatus('Bir şeyler ters gitti: ' + err.message, 'err');
    progressBar.style.display = 'none';
    submitBtn.disabled = remainingToday !== null && remainingToday <= 0;
    submitBtn.textContent = submitBtn.disabled ? 'Bugünlük hakkın doldu' : 'Onaya Gönder';
  }
});

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Sunucu yanıtı okunamadı.'));
      }
    };
    xhr.onerror = () => reject(new Error('Ağ hatası.'));
    xhr.send(formData);
  });
}
