// Hızlı giriş, profil akordeonu ve admin sekmeleri için jsdom duman testi. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 8) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const strip = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

(async () => {
  // ================= HIZLI GİRİŞ =================
  const navHtml = '<header><nav class="site-nav"><div class="social-dropdown"></div></nav></header>';
  const card = ejs.render(fs.readFileSync(P + '/views/partials/auth-card.ejs', 'utf8'), { tab: 'login', error: null, next: '/' }, { filename: P + '/views/partials/auth-card.ejs' });
  async function guest(quickOk) {
    const d = new JSDOM(navHtml, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = d.window; const calls = [];
    w.fetch = async (url, opts = {}) => {
      calls.push(String(url));
      if (url === '/api/session-status') return resp(200, { loggedIn: false });
      if (url === '/api/quick-login') return resp(200, { ok: quickOk });
      if (String(url).startsWith('/auth-card')) return resp(200, card);
      return resp(200, {});
    };
    w.eval(fs.readFileSync(P + '/public/js/auth-nav.js', 'utf8')); await tick();
    return { w, calls, doc: w.document };
  }
  let g = await guest(false);
  const loginBtn = [...g.doc.querySelectorAll('.nav-cluster button')].find((b) => /Giriş Yap/.test(b.textContent));
  loginBtn.click(); await tick(12);
  check('[hızlı giriş] "Giriş Yap" önce /api/quick-login\'i dener', g.calls.includes('/api/quick-login'));
  check('[hızlı giriş] hatırlanan oturum yoksa giriş penceresi açılır', !!g.doc.getElementById('authModal') && g.calls.some((c) => c.startsWith('/auth-card')));
  check('[hızlı giriş] düğme geri etkinleşti', !loginBtn.disabled && /Giriş Yap/.test(loginBtn.textContent));
  check('[hızlı giriş] session-status TEK kez istendi (paralel yarış yok)', g.calls.filter((c) => c === '/api/session-status').length === 1);

  g = await guest(true);
  const b2 = [...g.doc.querySelectorAll('.nav-cluster button')].find((b) => /Giriş Yap/.test(b.textContent));
  b2.click(); await tick(12);
  check('[hızlı giriş] hatırlanan oturum varsa PENCERE AÇILMAZ (doğrudan girer)', !g.doc.getElementById('authModal') && !g.calls.some((c) => c.startsWith('/auth-card')));

  // ================= PROFİL AKORDEONU =================
  const BADGE_INFO = { member: { label: 'Üye', icon: '👤', className: 'badge-member' } };
  const src = fs.readFileSync(P + '/src/core.js', 'utf8'); const ns = src.slice(src.indexOf('// <NAME-STYLE-BEGIN>'), src.indexOf('// <NAME-STYLE-END>'));
  const renderName = new Function('app', 'users', ns + '; return renderNameHtml;')({ locals: {} }, { canStyleName: () => true });
  const ph = ejs.render(fs.readFileSync(P + '/views/profile.ejs', 'utf8'), {
    username: 'ayse', bio: '', BADGE_INFO, BADGE_ORDER: ['member'], createdAt: Date.now(), totalCount: 0, approvedCount: 0, pendingCount: 0, totalLikes: 0, items: [],
    limits: { imageBytes: 1, videoBytes: 1, videoDurationSec: 150, unlimited: false, premium: false }, hasCustomLimits: false, error: null, success: null, theme: null, renderName,
    badges: ['member'], premium: false, canThemes: false, allowedThemes: [], rewardExpiry: 0, avatarUrl: null, canGif: false, nameChange: { used: 0, remaining: 2, nextAt: null }, nameStyle: null, canStyleName: false,
  }, { filename: P + '/views/profile.ejs' });
  const pd = new JSDOM(strip(ph), { url: 'http://localhost/profile', pretendToBeVisual: true, runScripts: 'outside-only' });
  const pw = pd.window; const $ = (s) => pw.document.querySelector(s);
  const accs = [...pw.document.querySelectorAll('details.acc')];
  check('[profil] 4 kategori: Sınırlarım, Anılarım, Görünüm, Hesap', accs.map((a) => a.id).join(',') === 'acc-sinirlar,acc-animlar,acc-gorunum,acc-hesap', accs.map((a) => a.id).join(','));
  check('[profil] başta yalnızca Anılarım açık (diğerleri kapalı)', accs.filter((a) => a.open).map((a) => a.id).join(',') === 'acc-animlar');
  check('[profil] Görünüm = Temalar + İsim rengi', !!$('#acc-gorunum #nameStyleEditor, #acc-gorunum .theme-teaser') && /Temalar/.test($('#acc-gorunum').textContent) && /İsim Rengi/.test($('#acc-gorunum').textContent));
  check('[profil] Hesap = Kullanıcı adı + Şifre + Verilerim(sil)', ['/profile/change-name', '/profile/change-password', '/profile/delete-account'].every((a) => $('#acc-hesap form[action="' + a + '"]')));
  check('[profil] hiçbir form/id kaybolmadı (avatar, bio, tema formları duruyor)', !!$('#avatarEditBtn') && !!$('form[action="/profile/update-bio"]') && !!$('form[action="/profile/update-theme"]'));
  pw.eval(fs.readFileSync(P + '/public/js/profile-accordion.js', 'utf8'));
  $('#acc-hesap form[action="/profile/change-password"]').dispatchEvent(new pw.Event('submit', { cancelable: true }));
  check('[profil] form gönderilince o kategori hatırlanır', pw.sessionStorage.getItem('croshy_profile_open') === 'acc-hesap');
  const pd2 = new JSDOM(strip(ph), { url: 'http://localhost/profile', pretendToBeVisual: true, runScripts: 'outside-only' });
  pd2.window.HTMLElement.prototype.scrollIntoView = function () {};
  pd2.window.sessionStorage.setItem('croshy_profile_open', 'acc-hesap');
  pd2.window.eval(fs.readFileSync(P + '/public/js/profile-accordion.js', 'utf8'));
  check('[profil] sayfa yenilenince hatırlanan kategori açılır', pd2.window.document.getElementById('acc-hesap').open === true && pd2.window.sessionStorage.getItem('croshy_profile_open') === null);

  // ================= ADMİN SEKMELERİ =================
  const baseA = {
    pending: [{ id: 'p1', url: 'https://res.cloudinary.com/c/image/upload/a.jpg', type: 'image', uploaderName: 'x', caption: 'c', createdAt: Date.now() }], approvedCount: 1, approvedItems: [], deletedItems: [], deleteRetentionMs: 86400000,
    username: 'dxrks91', bans: [], customLimitUsers: [], settings: { dailySubmitLimit: 2, maxImageBytes: 1, maxVideoBytes: 1, maxVideoDurationSec: 150 }, badgeUsers: [],
    weeklyLeaderboard: { topSubmitters: [], topLiked: [] }, BADGE_INFO: { special: { label: 'ÖZEL', icon: '💜', className: 'badge-special' } }, BADGE_ORDER: ['special'], redeemCodeList: [],
    feedbackList: [{ id: 1, username: 'a', message: 'm', status: 'pending', createdAt: 1 }], bannedUsers: [], reportGroups: [{ itemId: 'i', commentId: null, count: 2, reasons: { spam: 2 }, details: [], firstAt: 1, item: { id: 'i', url: 'u', type: 'image', caption: 'c', uploaderName: 'm' }, comment: null, commentGone: false }],
    adminList: [], auditList: [], reasonLabels: { spam: 'Spam' }, myAdmin: { isDb: true, totpEnabled: false, mustChange: false },
  };
  const load = (data, url) => {
    const h = ejs.render(fs.readFileSync(P + '/views/admin.ejs', 'utf8'), data, { filename: P + '/views/admin.ejs' });
    const d = new JSDOM(strip(h), { url, pretendToBeVisual: true, runScripts: 'outside-only' });
    d.window.HTMLMediaElement.prototype.play = () => Promise.resolve(); d.window.HTMLMediaElement.prototype.pause = () => {};
    d.window.eval(fs.readFileSync(P + '/public/js/admin-tabs.js', 'utf8'));
    return d.window;
  };
  let aw = load({ ...baseA, adminRole: 'superadmin' }, 'http://localhost/admin');
  const tabs = [...aw.document.querySelectorAll('.admin-tab')];
  check('[admin] 5 kategori sekmesi', tabs.map((t) => t.dataset.cat).join(',') === 'mod,users,badges,settings,security', tabs.map((t) => t.dataset.cat).join(','));
  const visible = () => [...new Set([...aw.document.querySelectorAll('.admin-sec')].filter((s) => !s.hidden).map((s) => s.dataset.cat))];
  check('[admin] açılışta yalnızca Moderasyon görünür', new Set(visible()).size === 1 && visible()[0] === 'mod', visible().join(','));
  const txt = (cat) => [...aw.document.querySelectorAll('.admin-sec[data-cat="' + cat + '"]')].map((s) => s.textContent).join(' ');
  check('[admin] Moderasyon: bekleyenler + şikayetler + geri bildirimler', /Şikayetler/.test(txt('mod')) && /Geri Bildirimler/.test(txt('mod')) && !!aw.document.querySelector('.admin-sec[data-cat="mod"] .pending-item[data-id]'));
  check('[admin] diğer kategorilerin içeriği AYRI: Hesap Yönetimi → Kullanıcılar, Rozet Kodları → Rozetler, Genel Ayarlar → Ayarlar, İşlem Kaydı → Güvenlik', /Hesap Yönetimi/.test(txt('users')) && /Rozet Kodları/.test(txt('badges')) && /Genel Ayarlar/.test(txt('settings')) && /İşlem Kaydı/.test(txt('security')) && /Yönetici Hesabım/.test(txt('security')));
  check('[admin] Moderasyon sekmesinde bekleyen iş sayısı rozeti (1 anı + 1 şikayet + 1 geri bildirim = 3)', tabs[0].querySelector('.tab-count') && tabs[0].querySelector('.tab-count').textContent === '3', tabs[0].textContent);
  check('[admin] "İşlem Kaydı" (büyük İ) Moderasyon\'a DEĞİL Güvenlik\'e düştü', !/İşlem Kaydı/.test(txt('mod')) && /İşlem Kaydı/.test(txt('security')));
  tabs[1].click();
  check('[admin] Kullanıcılar sekmesine tıklayınca yalnızca o kategori görünür', visible().join(',') === 'users' && tabs[1].getAttribute('aria-selected') === 'true' && tabs[0].getAttribute('aria-selected') === 'false');
  check('[admin] seçim URL\'de ve tarayıcıda hatırlanır', aw.location.hash === '#tab-users' && aw.localStorage.getItem('croshy_admin_tab') === 'users');
  aw.document.querySelector('.admin-tabs').dispatchEvent(new aw.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check('[admin] klavye (→) ile sonraki sekme', visible().join(',') === 'badges');
  check('[admin] hiçbir bölüm silinmedi (tüm öğeler DOM\'da)', !!aw.document.getElementById('report-list') && !!aw.document.getElementById('userSearch') && !!aw.document.getElementById('codegenCard') && !!aw.document.getElementById('auditTable'));
  aw = load({ ...baseA, adminRole: 'superadmin' }, 'http://localhost/admin#tab-security');
  check('[admin] #tab-security bağlantısı doğrudan o kategoriyi açar', [...aw.document.querySelectorAll('.admin-sec')].filter((s) => !s.hidden).every((s) => s.dataset.cat === 'security'));
  aw = load({ ...baseA, adminRole: 'moderator', reportGroups: [], feedbackList: [], adminList: [], auditList: [], myAdmin: { isDb: false, totpEnabled: false, mustChange: false } }, 'http://localhost/admin');
  check('[admin] moderatör yalnızca Moderasyon + Güvenlik(Hesabım) sekmelerini görür', [...aw.document.querySelectorAll('.admin-tab')].map((t) => t.dataset.cat).join(',') === 'mod,security');

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'MENÜ KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
