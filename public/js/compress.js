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

// ---------- Video sıkıştırma (deneysel, en iyi çaba ile) ----------
// Modern tarayıcılarda (Chrome/Edge/Firefox) videoyu düşük çözünürlükte
// yeniden kaydeder. Desteklenmiyorsa ya da bir sorun çıkarsa orijinal
// dosyayı olduğu gibi döndürür — sunucu tarafı boyut kontrolü son güvence.
function canCompressVideo() {
  const v = document.createElement('video');
  const hasCaptureStream = !!(v.captureStream || v.mozCaptureStream);
  return hasCaptureStream && typeof MediaRecorder !== 'undefined';
}

async function compressVideo(file, maxBytes, onProgress) {
  // Zaten limitin epey altındaysa uğraşma
  if (file.size <= maxBytes * 0.5) return file;
  if (!canCompressVideo()) return file;

  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = false;
      video.playsInline = true;
      video.src = URL.createObjectURL(file);

      const cleanupAndFallback = () => {
        URL.revokeObjectURL(video.src);
        resolve(file);
      };

      const safetyTimeout = setTimeout(cleanupAndFallback, 3 * 60 * 1000);

      video.onloadedmetadata = () => {
        // Çok uzun videoları gerçek zamanlı yeniden kodlamak pratik değil
        if (video.duration > 180 || !isFinite(video.duration)) {
          clearTimeout(safetyTimeout);
          return cleanupAndFallback();
        }

        const MAX_W = 1280;
        const scale = video.videoWidth > MAX_W ? MAX_W / video.videoWidth : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');

        let stream;
        try {
          const canvasStream = canvas.captureStream(30);
          const source = video.captureStream ? video.captureStream() : video.mozCaptureStream();
          const audioTracks = source.getAudioTracks();
          stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
        } catch {
          clearTimeout(safetyTimeout);
          return cleanupAndFallback();
        }

        let recorder;
        try {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_200_000 });
        } catch {
          clearTimeout(safetyTimeout);
          return cleanupAndFallback();
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
          URL.revokeObjectURL(video.src);
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size === 0 || blob.size >= file.size) {
            resolve(file);
          } else {
            const base = (file.name || 'video').replace(/\.[^.]+$/, '');
            resolve(new File([blob], base + '.webm', { type: 'video/webm' }));
          }
        };

        video.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };
        video.ontimeupdate = () => {
          if (onProgress && video.duration) {
            onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
          }
        };

        recorder.start();
        drawFrame();
        video.play().catch(() => {
          clearTimeout(safetyTimeout);
          if (recorder.state !== 'inactive') recorder.stop();
          cleanupAndFallback();
        });
      };

      video.onerror = () => {
        clearTimeout(safetyTimeout);
        cleanupAndFallback();
      };
    });
  } catch {
    return file;
  }
}
