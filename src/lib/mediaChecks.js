// Anı gönderme ve taslak kaydetme için ORTAK medya doğrulaması (boyut / süre / kaynak).
// İhlalde yüklenen dosya Cloudinary'den de silinir. İhlal yoksa null döner.
async function checkMedia({ body, limits, cloudinary, formatDuration, ceilingBytes, safeUrl }) {
  const { url, publicId, type, bytes, durationSec, trimmed } = body;
  if (!url || !publicId || !type) return { status: 400, error: 'Eksik veri gönderildi.' };
  if (type !== 'image' && type !== 'video') return { status: 400, error: 'Geçersiz medya türü.' };
  if (!safeUrl.test(url)) return { status: 400, error: 'Geçersiz medya kaynağı.' };

  const kill = async (why) => {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: type });
    } catch (e) {
      console.error(`Cloudinary silme hatası (${why}):`, e.message);
    }
  };

  // Kırpılmış videoda "bytes" ORİJİNAL dosyanın boyutudur: normal sınır yerine makul bir üst tavan uygulanır
  if (!limits.unlimited && type === 'video' && trimmed && typeof bytes === 'number' && bytes > ceilingBytes) {
    await kill('üst tavan aşımı');
    return { status: 413, error: `Video çok büyük (${(bytes / (1024 * 1024)).toFixed(1)}MB). Lütfen daha küçük bir video seç.` };
  }

  const sizeLimit = type === 'video' ? limits.videoBytes : limits.imageBytes;
  const skipByteCheck = type === 'video' && !!trimmed;
  if (!skipByteCheck && typeof bytes === 'number' && bytes > sizeLimit) {
    await kill('boyut aşımı');
    return { status: 413, error: `Dosya çok büyük. ${type === 'video' ? 'Videolar' : 'Fotoğraflar'} en fazla ${(sizeLimit / (1024 * 1024)).toFixed(1)}MB olabilir.` };
  }

  if (type === 'video' && typeof durationSec === 'number' && durationSec > limits.videoDurationSec + 2) {
    await kill('süre aşımı');
    return { status: 413, error: `Video çok uzun (${Math.round(durationSec)} sn). Videolar en fazla ${formatDuration(limits.videoDurationSec)} olabilir.` };
  }
  return null;
}

module.exports = { checkMedia };
