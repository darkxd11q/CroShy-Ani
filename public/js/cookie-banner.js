(function () {
  if (document.cookie.indexOf('croshy_cookie_ok=1') !== -1) return;
  const bar = document.createElement('div');
  bar.className = 'cookie-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Çerez bildirimi');
  bar.innerHTML =
    '<p>Bu site yalnızca <strong>zorunlu çerezler</strong> kullanır (oturum, tema, giriş hatırlama). Reklam veya takip çerezi yoktur. ' +
    '<a href="/cerezler">Ayrıntılar</a> · <a href="/gizlilik">Gizlilik</a></p>' +
    '<button type="button" class="btn small primary">Anladım</button>';
  bar.querySelector('button').addEventListener('click', () => {
    document.cookie = 'croshy_cookie_ok=1; max-age=31536000; path=/; samesite=lax';
    bar.classList.remove('show');
    setTimeout(() => bar.remove(), 300);
  });
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
})();
