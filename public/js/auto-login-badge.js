(async function () {
  try {
    const res = await fetch('/api/session-status');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.justAutoLoggedIn) return;

    // ÖZEL / Plus üyelere özel, daha havalı bir karşılama göstermek için rolü öğren.
    let role = null;
    let name = data.username;
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const me = await meRes.json();
        role = me.premiumRole || null;
        name = me.username || name;
      }
    } catch {
      // admin oturumlarında /api/me 401 döner — sorun değil
    }
    showAutoLoginBadge(role, name);
  } catch {
    // sessizce yut, kritik değil
  }
})();

function showAutoLoginBadge(role, name) {
  const badge = document.createElement('div');
  badge.className = 'auto-login-badge' + (role ? ' premium-' + role : '');

  const check = document.createElement('span');
  check.className = 'auto-login-check';
  check.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 12.5l5 5L20 6" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const text = document.createElement('span');
  text.textContent = role
    ? (role === 'special' ? '💜 ' : '💠 ') + 'Otomatik Giriş Yapıldı, ' + name + '!'
    : 'Otomatik Giriş Yapıldı!';

  badge.append(check, text);
  document.body.appendChild(badge);

  requestAnimationFrame(() => badge.classList.add('show'));

  setTimeout(() => {
    badge.classList.remove('show');
    setTimeout(() => badge.remove(), 450);
  }, 3200);
}
