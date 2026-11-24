// Sayfadaki betiklerin aynı oturum isteğini paylaşması için (auth-nav.js olmayan sayfalarda).
window.getSessionStatus =
  window.getSessionStatus ||
  function () {
    if (!window.__sessionStatusP) window.__sessionStatusP = fetch('/api/session-status').then((r) => r.json());
    return window.__sessionStatusP;
  };
