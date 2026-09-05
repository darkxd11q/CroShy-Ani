(async function () {
  try {
    const res = await fetch('/api/session-status');
    if (!res.ok) return;
    const data = await res.json();
    if (data.justAutoLoggedIn) showAutoLoginBadge();
  } catch {
    // sessizce yut, kritik değil
  }
})();

function showAutoLoginBadge() {
  const badge = document.createElement('div');
  badge.className = 'auto-login-badge';
  badge.innerHTML = `
    <span class="auto-login-check">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12.5l5 5L20 6" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span>Otomatik Giriş Yapıldı!</span>
  `;
  document.body.appendChild(badge);

  requestAnimationFrame(() => badge.classList.add('show'));

  setTimeout(() => {
    badge.classList.remove('show');
    setTimeout(() => badge.remove(), 450);
  }, 2800);
}
