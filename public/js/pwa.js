// Service worker kaydı + bildirim (web push) yardımcıları. window.CroshyPush olarak paylaşılır.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  function urlBase64ToUint8Array(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  // iPhone'da bildirim yalnızca "Ana Ekrana Ekle" ile kurulan uygulamada çalışır
  const needsInstall = () => isIOS() && !standalone() && !supported();
  const available = () => supported() || needsInstall();

  let cfgPromise = null;
  const config = () => (cfgPromise = cfgPromise || fetch('/api/push/config').then((r) => r.json()));

  async function getState() {
    const cfg = await config();
    const base = { enabled: !!cfg.enabled, needsInstall: needsInstall(), permission: 'Notification' in window ? Notification.permission : 'denied', subscribed: false };
    if (!supported()) return base;
    try {
      const reg = await navigator.serviceWorker.ready;
      base.subscribed = !!(await reg.pushManager.getSubscription());
    } catch (e) {}
    return base;
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) || {}).error || 'İşlem başarısız.');
  }

  async function enable() {
    const cfg = await config();
    if (!cfg.enabled) throw new Error('Bildirimler bu sunucuda kapalı.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Bildirim izni verilmedi.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) });
    await post('/api/push/subscribe', { subscription: sub.toJSON() });
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
  }

  window.CroshyPush = { supported, available, getState, enable, disable, urlBase64ToUint8Array };
})();
