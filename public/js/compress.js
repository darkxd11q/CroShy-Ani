// ---------- Fotoğraf sıkıştırma (Canvas API, harici kütüphane yok) ----------
// Kaliteyi kademeli düşürerek ve gerekirse çözünürlüğü küçülterek dosyayı
// hedef boyutun altına indirmeye çalışır. Zaten yeterince küçükse dokunmaz.
async function compressImage(file, maxBytes) {
  if (file.size <= maxBytes * 0.7) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // tarayıcı desteklemiyorsa orijinali kullan
  }

  const MAX_DIMENSION = 2560;
  let scale = 1;
  if (Math.max(bitmap.width, bitmap.height) > MAX_DIMENSION) {
    scale = MAX_DIMENSION / Math.max(bitmap.width, bitmap.height);
  }

  let quality = 0.85;
  let blob = await drawToBlob(bitmap, bitmap.width * scale, bitmap.height * scale, quality);

  let attempts = 0;
  while (blob && blob.size > maxBytes && attempts < 7) {
    attempts++;
    if (quality > 0.45) {
      quality -= 0.1;
    } else {
      scale *= 0.82;
    }
    blob = await drawToBlob(bitmap, bitmap.width * scale, bitmap.height * scale, quality);
  }

  bitmap.close?.();

  if (!blob) return file;
  // Sıkıştırma işe yaramadıysa (çok nadir) orijinali gönder, sunucu zaten
  // boyutu son kez kontrol edecek.
  if (blob.size >= file.size) return file;

  return new File([blob], renameToJpg(file.name), { type: 'image/jpeg' });
}

function drawToBlob(bitmap, width, height, quality) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function renameToJpg(filename) {
  const base = (filename || 'foto').replace(/\.[^.]+$/, '');
  return base + '.jpg';
}

// ---------- Video süresini öğrenme (kırpma gerekip gerekmediğine karar vermek için) ----------
function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(duration) ? duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video okunamadı.'));
    };
  });
}

// ---------- Video sıkıştırma + kırpma (deneysel, en iyi çaba ile) ----------
// Modern tarayıcılarda (Chrome/Edge/Firefox) videoyu düşük çözünürlükte
// yeniden kaydeder; istenirse sadece belirli bir zaman aralığını
// (trimStart .. trimStart+trimDuration) kaydeder. Desteklenmiyorsa ya da
// bir sorun çıkarsa orijinal dosyayı olduğu gibi döndürür.
function canCompressVideo() {
  const v = document.createElement('video');
  const hasCaptureStream = !!(v.captureStream || v.mozCaptureStream);
  return hasCaptureStream && typeof MediaRecorder !== 'undefined';
}

async function compressVideo(file, maxBytes, opts = {}) {
  const { onProgress, trimStart = 0, trimDuration = null } = opts;
  const needsTrim = trimDuration !== null;

  // Kırpma gerekmiyorsa ve dosya zaten küçükse hiç uğraşma
  if (!needsTrim && file.size <= maxBytes * 0.5) return file;
  if (!canCompressVideo()) return needsTrim ? null : file;

  try {
    return await new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = false;
      video.playsInline = true;
      // ÖNEMLİ: video/canvas DOM'a eklenmezse bazı tarayıcılar bir süre sonra
      // (görünmez/arka plan elemanı olduğu için) oynatmayı/rendering'i
      // yavaşlatıp durdurabiliyor — bu da kaydın ilk birkaç saniyeden sonra
      // bozuk/donuk çıkmasına sebep oluyordu. Ekranın tamamen dışında ama
      // DOM'da gerçekten var olan, gizli elemanlar olarak ekliyoruz.
      Object.assign(video.style, {
        position: 'fixed',
        left: '-99999px',
        top: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      video.setAttribute('aria-hidden', 'true');
      document.body.appendChild(video);
      video.src = URL.createObjectURL(file);

      let canvas = null;
      let settled = false;

      const cleanupDom = () => {
        video.pause();
        video.remove();
        if (canvas) canvas.remove();
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(video.src);
        cleanupDom();
        resolve(result);
      };

      const safetyTimeout = setTimeout(() => finish(needsTrim ? null : file), 4 * 60 * 1000);

      video.onloadedmetadata = () => {
        const fullDuration = video.duration;

        if (!needsTrim && (fullDuration > 180 || !isFinite(fullDuration))) {
          clearTimeout(safetyTimeout);
          return finish(file);
        }

        const start = isFinite(fullDuration)
          ? Math.max(0, Math.min(trimStart, Math.max(0, fullDuration - 0.2)))
          : trimStart;
        const targetDuration = needsTrim
          ? Math.min(trimDuration, isFinite(fullDuration) ? fullDuration - start : trimDuration)
          : null;

        const MAX_W = 1280;
        const scale = video.videoWidth > MAX_W ? MAX_W / video.videoWidth : 1;
        canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale) || video.videoWidth;
        canvas.height = Math.round(video.videoHeight * scale) || video.videoHeight;
        Object.assign(canvas.style, {
          position: 'fixed',
          left: '-99999px',
          top: '0',
          opacity: '0',
          pointerEvents: 'none',
        });
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let stream;
        try {
          const canvasStream = canvas.captureStream(30);
          const source = video.captureStream ? video.captureStream() : video.mozCaptureStream();
          const audioTracks = source.getAudioTracks();
          stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
        } catch {
          clearTimeout(safetyTimeout);
          return finish(needsTrim ? null : file);
        }

        let recorder;
        try {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_200_000 });
        } catch {
          clearTimeout(safetyTimeout);
          return finish(needsTrim ? null : file);
        }

        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        let drawing = true;
        function drawFrame() {
          if (!drawing) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(drawFrame);
        }

        recorder.onstop = () => {
          clearTimeout(safetyTimeout);
          drawing = false;
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size === 0) {
            finish(needsTrim ? null : file);
            return;
          }
          if (!needsTrim && blob.size >= file.size) {
            finish(file);
            return;
          }
          const base = (file.name || 'video').replace(/\.[^.]+$/, '');
          finish(new File([blob], base + '.webm', { type: 'video/webm' }));
        };

        video.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };
        video.ontimeupdate = () => {
          if (onProgress) {
            const denom = needsTrim ? targetDuration : video.duration;
            const elapsed = needsTrim ? video.currentTime - start : video.currentTime;
            if (denom) onProgress(Math.min(99, Math.max(0, Math.round((elapsed / denom) * 100))));
          }
          if (needsTrim && video.currentTime >= start + targetDuration) {
            if (recorder.state !== 'inactive') recorder.stop();
          }
        };

        const startRecording = () => {
          // 1 saniyelik dilimlerle veri iste — bazı tarayıcılarda tek seferde
          // (stop() anında) tüm veriyi almaya çalışmak, uzunca kayıtlarda
          // veri kaybına/bozulmaya yol açabiliyor.
          recorder.start(1000);
          drawFrame();
          video.play().catch(() => {
            clearTimeout(safetyTimeout);
            if (recorder.state !== 'inactive') recorder.stop();
            finish(needsTrim ? null : file);
          });
        };

        if (start > 0) {
          video.onseeked = () => startRecording();
          video.currentTime = start;
        } else {
          startRecording();
        }
      };

      video.onerror = () => {
        clearTimeout(safetyTimeout);
        finish(needsTrim ? null : file);
      };
    });
  } catch {
    return needsTrim ? null : file;
  }
}
