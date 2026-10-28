// Cloudinary'e doğrudan yükleme için hedef adres + alanlar. Sunucu giriş/yasak/günlük
// hak kontrolü yapıp kısa ömürlü bir imza verir (imzasız preset artık gerekmiyor).
window.cloudUploadTarget = async function (kind, resourceType) {
  const res = await fetch('/api/upload-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, resourceType }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/login?next=' + encodeURIComponent(location.pathname);
    throw new Error('Giriş gerekli');
  }
  if (!res.ok) throw new Error(data.error || 'Yükleme izni alınamadı.');

  const fields = data.signed
    ? { api_key: data.apiKey, timestamp: String(data.timestamp), signature: data.signature, ...data.params }
    : { upload_preset: data.uploadPreset };
  return { url: 'https://api.cloudinary.com/v1_1/' + data.cloudName + '/' + resourceType + '/upload', fields };
};
