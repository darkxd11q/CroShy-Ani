// Admin paneli (şikayetler, yönetici hesapları, 2FA kurulumu, işlem kaydı) ve anı sayfasındaki şikayet penceresi
// için jsdom duman testi. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 6) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const strip = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

(async () => {
  // ================= ADMIN PANELİ =================
  const base = {
    pending: [], approvedCount: 0, approvedItems: [], deletedItems: [], deleteRetentionMs: 86400000, username: 'dxrks91', adminRole: 'superadmin',
    bans: [], customLimitUsers: [], settings: { dailySubmitLimit: 2, maxImageBytes: 1, maxVideoBytes: 1, maxVideoDurationSec: 150 }, badgeUsers: [],
    weeklyLeaderboard: { topSubmitters: [], topLiked: [] }, BADGE_INFO: { special: { label: 'ÖZEL', icon: '💜', className: 'badge-special' } }, BADGE_ORDER: ['special'],
    redeemCodeList: [], feedbackList: [], bannedUsers: [],
    reportGroups: [
      { itemId: 'i1', commentId: null, count: 3, reasons: { spam: 3 }, details: [], firstAt: 1, item: { id: 'i1', url: 'https://res.cloudinary.com/c/image/upload/a.jpg', type: 'image', caption: 'x', uploaderName: 'mehmet' }, comment: null, commentGone: false },
      { itemId: 'i2', commentId: 7, count: 1, reasons: { taciz: 1 }, details: [], firstAt: 1, item: null, comment: { id: 7, body: 'kötü', username: 'ali' }, commentGone: false },
    ],
    adminList: [{ username: 'zeynep', role: 'moderator', totpEnabled: false, disabled: false, lastLoginAt: null }],
    auditList: [
      { createdAt: Date.now(), actor: 'zeynep', role: 'moderator', label: 'Anıyı onayladı', action: 'approve/x', target: '#x', details: '{}', status: 200 },
      { createdAt: Date.now(), actor: 'can', role: 'superadmin', label: 'Hesabı sildi', action: 'users/delete', target: 'ali', details: '{}', status: 200 },
    ],
    reasonLabels: { spam: 'Spam', taciz: 'Taciz' }, myAdmin: { isDb: true, totpEnabled: false, mustChange: false },
  };
  const html = ejs.render(fs.readFileSync(P + '/views/admin.ejs', 'utf8'), base, { filename: P + '/views/admin.ejs' });
  const dom = new JSDOM(strip(html), { url: 'http://localhost/admin', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const calls = []; const prompts = []; let confirmAnswer = true;
  w.confirm = () => confirmAnswer; w.alert = () => {}; w.prompt = (m, v) => (prompts.push({ m, v }), v);
  w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
  w.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (url === '/api/admin/me/2fa/setup') return resp(200, { secret: 'ABCDEFGH', otpauth: 'otpauth://x', qr: 'data:image/png;base64,AAAA' });
    if (url === '/api/admin/admins/create') return resp(200, { ok: true, username: 'yeni', role: 'moderator', tempPassword: 'Tmp-Pass-12' });
    if (url === '/api/admin/admins/reset-password') return resp(200, { ok: true, tempPassword: 'Reset-Pass-1' });
    if (url === '/api/admin/me/password') return resp(200, { ok: true });
    return resp(200, { ok: true });
  };
  // reload sayfayı yeniden yüklemeye çalışır; jsdom'da gerekmez
  w.eval(fs.readFileSync(P + '/public/js/lightbox.js', 'utf8') + '\n' + fs.readFileSync(P + '/public/js/admin.js', 'utf8'));
  await tick(4);
  const $ = (s) => w.document.querySelector(s);
  const last = () => calls[calls.length - 1];

  // 2FA kurulumu
  $('#totpSetupBtn').click(); await tick();
  check('[admin] 2FA kurulumu: QR ve anahtar gösterildi', $('#totpQr').src.startsWith('data:image/png') && $('#totpSecret').textContent === 'ABCDEFGH' && !$('#totpSetupBox').hidden && $('#totpSetupBtn').hidden);
  $('#totpEnableCode').value = '123456'; $('#totpEnableBtn').click(); await tick();
  check('[admin] 2FA etkinleştirme kodu gönderildi', calls.some((c) => c.url === '/api/admin/me/2fa/enable' && c.body.code === '123456'));

  // şifre değiştirme
  $('#pwCurrent').value = 'eski'; $('#pwNew').value = 'yeni-sifre-123'; $('#pwChangeBtn').click(); await tick();
  check('[admin] şifre değiştirme isteği doğru alanlarla gitti', calls.some((c) => c.url === '/api/admin/me/password' && c.body.currentPassword === 'eski' && c.body.newPassword === 'yeni-sifre-123'));
  check('[admin] şifre değişince başarı mesajı + alanlar temizlendi', /güncellendi/.test($('#myAdminStatus').textContent) && $('#pwCurrent').value === '' && $('#pwNew').value === '');

  // yönetici oluşturma / şifre sıfırlama
  $('#newAdminName').value = 'yeni'; $('#newAdminRole').value = 'superadmin'; $('#newAdminBtn').click(); await tick();
  check('[admin] yönetici oluşturuldu; geçici şifre YALNIZCA prompt\'ta gösterildi', calls.some((c) => c.url === '/api/admin/admins/create' && c.body.username === 'yeni' && c.body.role === 'superadmin') && prompts.some((p) => p.v === 'Tmp-Pass-12') && !w.document.body.textContent.includes('Tmp-Pass-12'));
  $('[data-admin-action="reset"]').click(); await tick();
  check('[admin] şifre sıfırlama: onay sonrası istek + geçici şifre', calls.some((c) => c.url === '/api/admin/admins/reset-password' && c.body.username === 'zeynep') && prompts.some((p) => p.v === 'Reset-Pass-1'));
  confirmAnswer = false; const n = calls.length; $('[data-admin-action="delete"]').click(); await tick();
  check('[admin] silmeyi reddedince istek GİTMEDİ', calls.length === n);
  confirmAnswer = true; $('[data-admin-action="disable"]').click(); await tick();
  check('[admin] devre dışı bırakma isteği', calls.some((c) => c.url === '/api/admin/admins/disable' && c.body.username === 'zeynep' && c.body.disabled === true));

  // şikayetler
  $('[data-report-action="dismiss"]').click(); await tick();
  check('[admin] şikayeti yoksay: doğru gövde', calls.some((c) => c.url === '/api/admin/reports/resolve' && c.body.itemId === 'i1' && c.body.commentId === null && c.body.action === 'dismiss'));
  $('[data-report-action="remove-comment"]').click(); await tick();
  check('[admin] yorumu sil: commentId ile', calls.some((c) => c.url === '/api/admin/reports/resolve' && c.body.itemId === 'i2' && c.body.commentId === '7' && c.body.action === 'remove-comment'));
  confirmAnswer = false; const n2 = calls.length; $('[data-report-action="remove-item"]').click(); await tick();
  check('[admin] anıyı kaldırmayı reddedince istek GİTMEDİ', calls.length === n2);

  // işlem kaydı filtresi
  const f = $('#auditFilter'); f.value = 'onayla'; f.dispatchEvent(new w.Event('input'));
  const rows = [...w.document.querySelectorAll('#auditTable tbody tr')];
  check('[admin] işlem kaydı filtresi yalnız eşleşeni gösteriyor', rows.filter((r) => !r.hidden).length === 1 && /onayladı/.test(rows.find((r) => !r.hidden).textContent));
  f.value = ''; f.dispatchEvent(new w.Event('input'));
  check('[admin] filtre temizlenince hepsi görünür', rows.every((r) => !r.hidden));

  // ================= ANI SAYFASI: ŞİKAYET =================
  const { renderRich } = require(P + '/src/lib/richtext'); const { cloudImg } = require(P + '/src/lib/cloud');
  const mhtml = ejs.render(fs.readFileSync(P + '/views/memory.ejs', 'utf8'), {
    item: { id: 'abc', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', caption: 'merhaba', createdAt: Date.now(), status: 'approved', userId: 'u1' },
    owner: { username: 'mehmet', avatarUrl: null, nameStyle: null }, ownerNameHtml: 'mehmet', likeTotal: 0, likedByMe: false, reactions: { counts: {}, mine: [] },
    EMOJIS: ['😂'], comments: [{ id: 1, username: 'ayse', avatarUrl: null, nameHtml: 'ayse', bodyHtml: 'selam', createdAt: Date.now(), canDelete: false, isMine: false }, { id: 2, username: 'ben', avatarUrl: null, nameHtml: 'ben', bodyHtml: 'benim', createdAt: Date.now(), canDelete: true, isMine: true }],
    loggedIn: true, isOwner: false, canInteract: true, pageUrl: 'https://x/m/abc', ogImage: '', ogTitle: 't', ogDescription: 'd', renderRich, cloudImg,
  }, { filename: P + '/views/memory.ejs' });
  const d2 = new JSDOM(strip(mhtml), { url: 'http://localhost/m/abc', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w2 = d2.window; const calls2 = []; let dup = false;
  w2.fetch = async (url, opts = {}) => { calls2.push({ url, body: opts.body ? JSON.parse(opts.body) : null }); return resp(200, { ok: true, duplicate: dup }); };
  w2.eval(fs.readFileSync(P + '/public/js/memory-page.js', 'utf8'));
  const $2 = (s) => w2.document.querySelector(s);
  check('[şikayet] anı sahibi olmayan giriş yapmış kullanıcı düğmeyi görüyor', !!$2('#reportBtn'));
  check('[şikayet] yorum şikayeti yalnız BAŞKASININ yorumunda (kendi yorumunda yok)', w2.document.querySelectorAll('[data-report-comment]').length === 1 && $2('[data-report-comment]').dataset.reportComment === '1');
  check('[şikayet] pencere başta gizli', $2('#reportModal').hidden === true);
  $2('#reportBtn').click();
  check('[şikayet] düğme pencereyi açtı', $2('#reportModal').hidden === false);
  $2('#reportReason').value = 'spam'; $2('#reportDetails').value = 'reklam yapıyor'; $2('#reportSend').click(); await tick();
  check('[şikayet] anı şikayeti doğru adrese/gövdeyle gitti', calls2.some((c) => c.url === '/api/memory/abc/report' && c.body.reason === 'spam' && c.body.details === 'reklam yapıyor'));
  check('[şikayet] teşekkür mesajı gösterildi', /iletildi/.test($2('#reportStatus').textContent));
  $2('#reportCancel').click();
  $2('[data-report-comment]').click(); $2('#reportReason').value = 'taciz'; dup = true; $2('#reportSend').click(); await tick();
  check('[şikayet] yorum şikayeti /api/comments/1/report adresine gitti', calls2.some((c) => c.url === '/api/comments/1/report' && c.body.reason === 'taciz'));
  check('[şikayet] tekrar şikayette "zaten şikayet etmiştin" mesajı', /zaten/.test($2('#reportStatus').textContent));

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'ADMIN + ŞİKAYET ARAYÜZ KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
