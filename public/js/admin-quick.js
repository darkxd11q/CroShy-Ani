// Admin giriş sayfasında: normal hesapla giriş yapmış ve bağlı yönetici hesabı olan kişiye TEK TIKLA geçiş.
(function () {
  const form = document.querySelector('form');
  if (!form) return;
  const go = (u) => (window.CROSHY_NAVIGATE ? window.CROSHY_NAVIGATE(u) : (location.href = u));
  const status = window.getSessionStatus ? window.getSessionStatus() : fetch('/api/session-status').then((r) => r.json());
  status
    .then((s) => {
      if (!s || s.canSwitch !== 'admin') return;
      const box = document.createElement('div');
      box.className = 'admin-quick';
      const t = document.createElement('div');
      t.textContent = 'Merhaba ' + (s.username || '') + '! Yönetici hesabın bağlı — şifre yazmadan devam edebilirsin.';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.textContent = '🛡️ Tek tıkla admin paneline geç';
      b.addEventListener('click', async () => {
        b.disabled = true;
        let body = { to: 'admin' };
        try {
          for (let i = 0; i < 3; i++) {
            const res = await fetch('/api/identity/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await res.json().catch(() => ({}));
            if (res.ok) return go(d.redirect || '/admin');
            if (d.needTotp) {
              const code = prompt(d.error || 'Doğrulama kodu (2 adımlı doğrulama):');
              if (!code) break;
              body = { to: 'admin', totp: code };
              continue;
            }
            alert(d.error || 'Geçiş yapılamadı.');
            break;
          }
        } catch {}
        b.disabled = false;
      });
      box.append(t, b);
      form.before(box);
    })
    .catch(() => {});
})();
