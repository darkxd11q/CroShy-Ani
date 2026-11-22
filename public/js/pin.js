// Profil > Anılarım: 📌 ile vitrin anısını seç / kaldır (profilin en üstünde görünür).
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pin]');
  if (!b) return;
  b.disabled = true;
  try {
    const pinned = b.dataset.pinned === '1';
    const res = await fetch(pinned ? '/api/profile/unpin' : '/api/profile/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: b.dataset.pin }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'İşlem başarısız.');
    location.hash = '#acc-animlar';
    location.reload();
  } catch (err) {
    alert(err.message);
    b.disabled = false;
  }
});
