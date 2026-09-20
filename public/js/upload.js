const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const filenameEl = document.getElementById('filename');
const fileHint = document.getElementById('fileHint');
const form = document.getElementById('upload-form');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');
const progressBar = document.getElementById('progressBar');
const progressSpan = progressBar.querySelector('span');
const userGreeting = document.getElementById('userGreeting');
const quotaInfo = document.getElementById('quotaInfo');
const trimField = document.getElementById('trimField');
const trimStartSlider = document.getElementById('trimStartSlider');
const trimLengthSlider = document.getElementById('trimLengthSlider');
const trimStartLabel = document.getElementById('trimStartLabel');
const trimEndLabel = document.getElementById('trimEndLabel');
const trimTotalLabel = document.getElementById('trimTotalLabel');
const trimMaxLenLabel = document.getElementById('trimMaxLenLabel');

// Çok uzun videoları "kırpacağım" diyerek sınırsız depolamayı önlemek için
// makul bir üst sınır — sadece muaf olmayan hesaplar için geçerli.
const ABSOLUTE_VIDEO_CEILING_BYTES = 300 * 1024 * 1024; // 300 MB

let selectedFile = null;
let config = null;
let remainingToday = null;
let myLimits = null; // /api/me üzerinden gelen fiili (kişiye özel ya da genel) sınırlar
let videoDuration = null; // saniye, sadece video seçiliyken
let needsTrim = false;

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Cloudinary'nin yükleme sonrası döndürdüğü URL'ye "so_/du_" (başlangıç/uzunluk)
// parametresi ekleyerek videoyu SUNUCU TARAFINDA kırpılmış şekilde servis
// ettirir. Tarayıcıda yeniden kodlama yapmadığımız için bozulma riski yok.
function buildTrimmedVideoUrl(secureUrl, startSec, lengthSec) {
  const marker = '/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return secureUrl;
  const before = secureUrl.slice(0, idx + marker.length);
  const after = secureUrl.slice(idx + marker.length);
  const so = Math.max(0, Math.round(startSec));
  const du = Math.max(1, Math.round(lengthSec));
  return `${before}so_${so},du_${du}/${after}`;
}

// Giriş kontrolü + kalan günlük hak bilgisi + fiili sınırlar
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
    myLimits = me;

    fileHint.textContent = `JPG, PNG, MP4, MOV… — foto en fazla ${formatMb(me.maxImageBytes)}, video en fazla ${formatMb(me.maxVideoBytes)} / ${formatTime(me.maxVideoDurationSec)}`;

    const limitNote = me.hasCustomLimits ? ' · Senin için özel sınırlar tanımlı ✨' : '';

    if (remainingToday <= 0) {
      quotaInfo.textContent = `Bugünkü gönderme hakkını kullandın (günde en fazla ${me.dailyLimit} anı). Yarın tekrar deneyebilirsin.`;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Bugünlük hakkın doldu';
    } else {
      quotaInfo.textContent = `Bugün için ${remainingToday}/${me.dailyLimit} gönderme hakkın kaldı.${limitNote}`;
    }
  })
  .catch(() => {});

// Cloudinary config'i backend'den al
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

  const limit = myLimits ? myLimits.maxVideoDurationSec : 150;

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
      setupTrimUI(duration, limit);
      trimField.style.display = 'block';
      showStatus(
        `Bu video ${formatTime(duration)} uzunluğunda — en fazla ${formatTime(limit)} gönderebilirsin. Aşağıdan başlangıcı ve uzunluğu seçebilirsin.`,
        'info'
      );
    }
  } catch {
    filenameEl.textContent = `${file.name} (${formatMb(file.size)})`;
  }
}

function setupTrimUI(duration, limit) {
  trimMaxLenLabel.textContent = formatTime(limit);
  trimTotalLabel.textContent = formatTime(duration);

  trimStartSlider.min = '0';
  trimStartSlider.max = String(Math.max(0, Math.floor(duration - 1)));
  trimStartSlider.value = '0';

  updateLengthSliderBounds();
  trimLengthSlider.value = trimLengthSlider.max;

  updateTrimLabels();
}

function updateLengthSliderBounds() {
  const limit = myLimits ? myLimits.maxVideoDurationSec : 150;
  const start = Number(trimStartSlider.value);
  const remaining = Math.max(1, Math.floor(videoDuration - start));
  const maxLen = Math.max(1, Math.min(limit, remaining));
  trimLengthSlider.max = String(maxLen);
  if (Number(trimLengthSlider.value) > maxLen || !trimLengthSlider.value) {
    trimLengthSlider.value = String(maxLen);
  }
}

function updateTrimLabels() {
  const start = Number(trimStartSlider.value);
  const length = Number(trimLengthSlider.value);
  trimStartLabel.textContent = formatTime(start);
  trimEndLabel.textContent = formatTime(start + length);
}

trimStartSlider.addEventListener('input', () => {
  updateLengthSliderBounds();
  updateTrimLabels();
});
trimLengthSlider.addEventListener('input', updateTrimLabels);

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
  const sizeLimit = myLimits ? (isVideo ? myLimits.maxVideoBytes : myLimits.maxImageBytes) : (isVideo ? config.maxVideoBytes : config.maxImageBytes);
  const unlimited = !!(myLimits && myLimits.unlimited);

  let fileToUpload = selectedFile;

  if (!isVideo) {
    // Fotoğraf: eskisi gibi tarayıcıda güvenle sıkıştırabiliyoruz.
    submitBtn.disabled = true;
    try {
      submitBtn.textContent = 'Fotoğraf sıkıştırılıyor…';
      showStatus('Fotoğraf sıkıştırılıyor…', 'info');
      fileToUpload = await compressImage(selectedFile, sizeLimit);
    } catch {
      fileToUpload = selectedFile;
    }
    if (!unlimited && fileToUpload.size > sizeLimit) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Onaya Gönder';
      showStatus(
        `Fotoğraf, sıkıştırma sonrasında bile ${formatMb(sizeLimit)} sınırını aşıyor (${formatMb(fileToUpload.size)}). Lütfen daha küçük bir dosya seç.`,
        'err'
      );
      return;
    }
  } else {
    // Video: artık tarayıcıda yeniden kodlama YAPMIYORUZ (önceki sürümde
    // bazı videoların birkaç saniye sonra bozulmasına sebep oluyordu).
    // Orijinal dosya olduğu gibi Cloudinary'e yüklenir; kırpma gerekiyorsa
    // Cloudinary'nin kendi (güvenilir, sunucu taraflı) video işleme
    // özelliğiyle yapılır.
    if (!unlimited && selectedFile.size > ABSOLUTE_VIDEO_CEILING_BYTES) {
      showStatus(
        `Bu video çok büyük (${formatMb(selectedFile.size)}). Lütfen ${formatMb(ABSOLUTE_VIDEO_CEILING_BYTES)}'ı aşmayan bir video seç.`,
        'err'
      );
      return;
    }
    if (!unlimited && !needsTrim && selectedFile.size > sizeLimit) {
      showStatus(
        `Video, ${formatMb(sizeLimit)} sınırını aşıyor (${formatMb(selectedFile.size)}). Lütfen daha küçük bir video seç ya da videoyu kısaltarak tekrar dene.`,
        'err'
      );
      return;
    }
    submitBtn.disabled = true;
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

    let finalUrl = cloudResult.secure_url;
    let durationSec = cloudResult.duration || null;
    let trimmed = false;

    if (isVideo && needsTrim) {
      const start = Number(trimStartSlider.value);
      const length = Number(trimLengthSlider.value);
      finalUrl = buildTrimmedVideoUrl(cloudResult.secure_url, start, length);
      durationSec = length;
      trimmed = true;
    }

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: finalUrl,
        publicId: cloudResult.public_id,
        type: resourceType,
        bytes: cloudResult.bytes,
        durationSec,
        trimmed,
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
