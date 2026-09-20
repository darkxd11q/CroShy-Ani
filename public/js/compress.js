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

// ---------- Video süresini öğrenme ----------
// Kırpma gerekip gerekmediğine karar vermek ve kırpma arayüzünü kurmak için
// kullanılır. Videonun kendisini işlemiyoruz — kırpma artık tamamen
// Cloudinary tarafında (yükleme sonrası URL üzerinden) yapılıyor; bu yüzden
// önceki sürümlerdeki tarayıcı içi (MediaRecorder) yeniden kodlama tamamen
// kaldırıldı. Sebep: bazı tarayıcılarda uzun videolar birkaç saniye sonra
// donup bozuk çıkıyordu — Cloudinary'nin sunucu taraflı kırpması bu sorunu
// tamamen ortadan kaldırıyor ve çok daha güvenilir.
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
