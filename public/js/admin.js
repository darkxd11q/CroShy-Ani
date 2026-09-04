// Tüm admin API çağrıları buradan geçer. Oturum süresi dolmuşsa (401) sunucu
// artık HTML login sayfasına yönlendirmiyor, JSON döndürüyor — burada onu
// yakalayıp kullanıcıyı düzgünce login sayfasına gönderiyoruz. Böylece
// "Unexpected token '<' ... is not valid JSON" hatası bir daha çıkmaz.
async function adminFetch(url, options) {
  const res = await fetch(url, options);

  if (res.status === 401) {
    alert('Oturumun sona ermiş görünüyor. Tekrar giriş yapman için yönlendiriliyorsun.');
    window.location.href = '/admin/login';
    throw new Error('Oturum sona erdi');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error('Sunucudan beklenmeyen bir yanıt geldi.');
  }

  if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
  return data;
}

// Küçük önizlemelere tıklanınca medyayı büyütüp sesli/kontrollü şekilde göster
document.querySelectorAll('.thumb').forEach((thumb) => {
  thumb.addEventListener('click', () => {
    openLightbox({
      url: thumb.dataset.url,
      type: thumb.dataset.type,
      uploaderName: thumb.dataset.name,
      caption: thumb.dataset.caption,
    });
  });
});

// Onayla / Reddet / IP Yasakla butonları
document.querySelectorAll('#pending-list [data-action]').forEach((btn) => {
  btn.addEventListener('click', () => handlePendingAction(btn.dataset.id, btn.dataset.action, btn));
});

// Yasağı kaldır butonları
document.querySelectorAll('#ban-list [data-action="unban"]').forEach((btn) => {
  btn.addEventListener('click', () => handleUnban(btn.dataset.ip, btn));
});

// Boyut sınırı muafiyeti — ekleme formu
const exemptForm = document.getElementById('exempt-form');
if (exemptForm) {
  exemptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('exemptUsername');
    const statusEl = document.getElementById('exemptStatus');
    const username = input.value.trim();
    if (!username) return;

    try {
      const data = await adminFetch('/api/admin/exempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      statusEl.textContent = `"${data.username}" için dosya boyutu sınırı kaldırıldı.`;
      statusEl.className = 'status-msg show ok';
      input.value = '';
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      statusEl.textContent = 'Hata: ' + err.message;
      statusEl.className = 'status-msg show err';
    }
  });
}

// Boyut sınırı muafiyeti — geri getir butonları
document.querySelectorAll('#exempt-list [data-action="unexempt"]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await adminFetch('/api/admin/unexempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: btn.dataset.username }),
      });
      window.location.reload();
    } catch (err) {
      alert('Hata: ' + err.message);
      btn.disabled = false;
    }
  });
});

async function handlePendingAction(id, action, btn) {
  const item = btn.closest('.pending-item');
  const buttons = item.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));

  if (action === 'ban' && !confirm('Bu IP adresi yasaklansın mı? Bu IP\'den bekleyen tüm gönderiler de silinecek.')) {
    buttons.forEach((b) => (b.disabled = false));
    return;
  }

  try {
    await adminFetch(`/api/admin/${action}/${id}`, { method: 'POST' });

    if (action === 'ban') {
      // IP yasaklamak birden fazla öğeyi etkileyebilir (aynı IP'den bekleyenler),
      // en temizi listeyi yeniden yüklemek.
      window.location.reload();
      return;
    }

    item.style.transition = 'opacity 0.3s, transform 0.3s';
    item.style.opacity = '0';
    item.style.transform = 'translateX(20px)';
    setTimeout(() => {
      item.remove();
      const list = document.getElementById('pending-list');
      if (!list.querySelector('.pending-item')) {
        list.innerHTML = '<div class="empty-state">Şu an onay bekleyen anı yok 🎉</div>';
      }
    }, 300);
  } catch (e) {
    if (e.message !== 'Oturum sona erdi') alert('Hata: ' + e.message);
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function handleUnban(ip, btn) {
  const row = btn.closest('.pending-item');
  btn.disabled = true;
  try {
    await adminFetch('/api/admin/unban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
    });

    row.style.transition = 'opacity 0.3s, transform 0.3s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(20px)';
    setTimeout(() => {
      row.remove();
      const list = document.getElementById('ban-list');
      if (!list.querySelector('.pending-item')) {
        list.innerHTML = '<div class="empty-state">Şu an yasaklı IP yok</div>';
      }
    }, 300);
  } catch (e) {
    if (e.message !== 'Oturum sona erdi') alert('Hata: ' + e.message);
    btn.disabled = false;
  }
}
