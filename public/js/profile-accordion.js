// Profil kategorileri tek tuşla açılır. Bir formu gönderince sayfa yenilense de
// o kategori açık kalır (sessionStorage) ve görünüme kaydırılır.
(function () {
  const KEY = 'croshy_profile_open';
  document.querySelectorAll('details.acc form').forEach((f) =>
    f.addEventListener('submit', () => {
      const d = f.closest('details.acc');
      if (d) {
        try {
          sessionStorage.setItem(KEY, d.id);
        } catch {}
      }
    })
  );

  let target = location.hash.startsWith('#acc-') ? location.hash.slice(1) : null;
  try {
    if (!target) target = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {}
  if (target) {
    const d = document.getElementById(target);
    if (d && d.tagName === 'DETAILS') {
      d.open = true;
      d.scrollIntoView({ block: 'start' });
    }
  }
})();
