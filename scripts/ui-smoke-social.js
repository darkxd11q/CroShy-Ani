// Anı sayfası (yorum/tepki), bildirim çanı ve giriş penceresi duman testi — jsdom ile. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const P = require('path').join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 5) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const stripScripts = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

(async () => {
  // ================= ANI SAYFASI =================
  const { renderRich } = require(P + '/src/lib/richtext'); const { cloudImg } = require(P + '/src/lib/cloud');
  const html = ejs.render(fs.readFileSync(P + '/views/memory.ejs', 'utf8'), {
    item: { id: 'abc', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', caption: 'merhaba', createdAt: Date.now(), status: 'approved', userId: 'u1' },
    owner: { username: 'mehmet', avatarUrl: null, nameStyle: null }, ownerNameHtml: 'mehmet', likeTotal: 3, likedByMe: true,
    reactions: { counts: { '😂': 2 }, mine: ['😂'] }, EMOJIS: ['😂', '😮', '😢', '🔥', '👏', '🎉'], comments: [], loggedIn: true, canInteract: true,
    pageUrl: 'https://x.com/m/abc', ogImage: 'https://img/x.jpg', ogTitle: 't', ogDescription: 'd', renderRich, cloudImg,
  }, { filename: P + '/views/memory.ejs' });
  const dom = new JSDOM(stripScripts(html), { url: 'http://localhost/m/abc', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window; const calls = []; let modal = 0; const alerts = [];
  w.openAuthModal = () => modal++; w.confirm = () => true; w.alert = (m) => alerts.push(m);
  let copied = null; Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => (copied = t) } });
  let mode = {};
  w.fetch = async (url, opts = {}) => {
    calls.push({ url, body: opts.body });
    if (mode[url]) return mode[url];
    if (url === '/api/like/abc') return resp(200, { liked: false, count: 2 });
    if (url === '/api/memory/abc/react') return resp(200, { ok: true, summary: { counts: { '🔥': 1, '😂': 2 }, mine: ['🔥'] } });
    if (url === '/api/memory/abc/comments') return resp(200, { ok: true, comment: { id: 9, username: 'ben', avatarUrl: null, nameHtml: 'ben', bodyHtml: 'merhaba &lt;script&gt;x&lt;/script&gt; <a class="tag-link" href="/?tag=x">#x</a>', createdAt: Date.now(), canDelete: true } });
    if (url === '/api/comments/9/delete') return resp(200, { ok: true });
    return resp(200, {});
  };
  w.eval(fs.readFileSync(P + '/public/js/memory-page.js', 'utf8'));
  const $ = (s) => w.document.querySelector(s);

  $('#memoryLike').click(); await tick();
  check('[anı] beğeniyi geri alınca sayı 2, kalp 🤍, aria-pressed=false', $('#likeCount').textContent === '2' && $('#memoryLike .heart').textContent === '🤍' && $('#memoryLike').getAttribute('aria-pressed') === 'false');
  $('.react-btn[data-emoji="🔥"]').click(); await tick();
  check('[anı] 🔥 tepkisi aktif, sayılar güncellendi, 😂 pasif', $('.react-btn[data-emoji="🔥"]').classList.contains('active') && $('.react-btn[data-emoji="🔥"] .react-count').textContent === '1' && !$('.react-btn[data-emoji="😂"]').classList.contains('active') && $('.react-btn[data-emoji="😂"] .react-count').textContent === '2');
  check('[anı] tepki isteği doğru emojiyi gönderdi', calls.some((c) => c.url === '/api/memory/abc/react' && JSON.parse(c.body).emoji === '🔥'));

  $('#commentBody').value = 'merhaba <script>x</script> #x';
  $('#commentForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  const li = $('#commentList .comment');
  check('[anı] yorum eklendi, sayaç 1', !!li && $('#commentCount').textContent === '1');
  check('[anı] yorum gövdesi kaçışlı: <script> öğesi YOK, #etiket bağlantısı var', !$('#commentList script') && !!$('#commentList a.tag-link') && li.textContent.includes('<script>'));
  check('[anı] gönderilen metin sunucuya ham gitti (kaçışı sunucu yapıyor)', calls.some((c) => c.url === '/api/memory/abc/comments' && JSON.parse(c.body).body.includes('<script>')));
  check('[anı] yorum kutusu temizlendi', $('#commentBody').value === '' && $('#commentChars').textContent === '0/300');
  $('[data-del="9"]').click(); await tick();
  check('[anı] yorum silindi, sayaç 0', !$('#commentList .comment') && $('#commentCount').textContent === '0');
  $('#shareBtn').click(); await tick();
  check('[anı] paylaş: bağlantı panoya kopyalandı', copied === 'https://x.com/m/abc' && /kopyalandı/.test($('#shareBtn').textContent));
  mode['/api/like/abc'] = resp(401, {}); $('#memoryLike').click(); await tick();
  check('[anı] misafir beğenince giriş penceresi', modal === 1);
  mode['/api/memory/abc/comments'] = resp(429, { error: 'Çok hızlı yorum yazıyorsun.' });
  $('#commentBody').value = 'x'; $('#commentForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  check('[anı] hız sınırı hatası kullanıcıya gösteriliyor', /Çok hızlı/.test($('#commentStatus').textContent));

  // ================= ÇAN + GİRİŞ PENCERESİ (auth-nav.js) =================
  const navHtml = '<header><nav class="site-nav"><div class="social-dropdown"></div><a href="/upload" class="btn">x</a></nav></header>';
  const mkNav = async (session, extra = {}) => {
    const d = new JSDOM(navHtml, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
    const win = d.window; const log = [];
    win.fetch = async (url, opts = {}) => {
      log.push({ url, method: opts.method || 'GET' });
      if (url === '/api/session-status') return resp(200, session);
      if (url === '/api/notifications/count') return resp(200, { unread: 3 });
      if (url === '/api/notifications') return resp(200, { unread: 3, items: [
        { id: 1, type: 'comment', text: '<img src=x onerror=1> yorum yaptı', link: '/m/1', createdAt: Date.now() - 120000, read: false },
        { id: 2, type: 'approved', text: 'Anın onaylandı 🎉', link: '/m/2', createdAt: Date.now() - 7200000, read: true } ] });
      if (url === '/api/notifications/read') return resp(200, { ok: true });
      if (String(url).startsWith('/auth-card')) return resp(200, extra.card || '');
      return resp(200, {});
    };
    win.eval(fs.readFileSync(P + '/public/js/auth-nav.js', 'utf8')); await tick(8);
    return { win, log, doc: win.document };
  };

  let n = await mkNav({ loggedIn: true, isAdmin: false, username: 'ayse' });
  const names = [...n.doc.querySelectorAll('.nav-cluster > *')].map((e) => e.textContent.trim());
  check('[menü] üye menüsü: Anı Ekle, Kod, çan, profil(ayse), Çıkış', names.length === 5 && /Anı Ekle/.test(names[0]) && /Kod/.test(names[1]) && /🔔/.test(names[2]) && /ayse/.test(names[3]) && /Çıkış/.test(names[4]), names.join(' | '));
  const badge = n.doc.querySelector('.bell-badge');
  check('[çan] okunmamış sayısı 3 görünüyor', !badge.hidden && badge.textContent === '3');
  n.doc.querySelector('.bell-btn').click(); await tick(8);
  const panel = n.doc.querySelector('.notif-panel');
  check('[çan] panel açıldı, 2 bildirim listelendi', !panel.hidden && panel.querySelectorAll('.notif-item').length === 2);
  check('[çan] bildirim metni XSS-güvenli (img öğesi yok, metin düz)', !panel.querySelector('img') && panel.textContent.includes('<img src=x onerror=1>'));
  check('[çan] okunmamış vurgulandı, bağlantı doğru', panel.querySelector('a.notif-item.unread[href="/m/1"]') && /dk önce|az önce/.test(panel.textContent) && /saat önce/.test(panel.textContent));
  check('[çan] açılınca "okundu" isteği gitti ve rozet gizlendi', n.log.some((c) => c.url === '/api/notifications/read' && c.method === 'POST') && badge.hidden);
  n.doc.body.click(); await tick(1);
  check('[çan] dışarı tıklayınca panel kapandı', panel.hidden);

  n = await mkNav({ loggedIn: true, isAdmin: true, username: 'testsuper' });
  check('[menü] admin menüsü: Admin Paneli + Çıkış (çan yok)', n.doc.querySelectorAll('.nav-cluster > *').length === 2 && !n.doc.querySelector('.bell-btn'));

  const card = ejs.render(fs.readFileSync(P + '/views/partials/auth-card.ejs', 'utf8'), { tab: 'login', error: null, next: '/' }, { filename: P + '/views/partials/auth-card.ejs' });
  n = await mkNav({ loggedIn: false }, { card });
  const guest = [...n.doc.querySelectorAll('.nav-cluster > *')].map((e) => e.textContent.trim());
  check('[menü] misafir: Giriş Yap + Anı Ekle', guest.length === 2 && /Giriş Yap/.test(guest[0]), guest.join(' | '));
  n.doc.querySelector('.nav-cluster button').click(); await tick(8);
  const m = n.doc.getElementById('authModal');
  check('[giriş] pencere /login ile AYNI kartı (partial) gösterdi', !!m && !!m.querySelector('.auth-card') && !!m.querySelector('form[action="/login"]') && !!m.querySelector('form[action="/register"]'));
  check('[giriş] "Beni hatırla (3 ay)" kutusu var', /3 ay/.test(m.textContent) && !!m.querySelector('input[name="remember"]'));
  m.querySelector('.auth-tabs button[data-tab="register"]').click();
  check('[giriş] Kayıt Ol sekmesine geçiş', m.querySelector('.auth-card').dataset.tab === 'register');
  m.querySelector('.auth-close').click(); await tick(1);
  n.win.document.getElementById('authModal') && await new Promise((r) => setTimeout(r, 300));
  check('[giriş] kapat düğmesi pencereyi kaldırdı', !n.doc.getElementById('authModal'));

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'ANI SAYFASI + ÇAN + GİRİŞ KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
