// Geçen yıl bugün, arama sayfası, telefon bildirimi (PWA/push) ve yıl özeti için jsdom duman testi. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 8) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const read = (f) => fs.readFileSync(path.join(P, f), 'utf8');

(async () => {
  // ================= GEÇEN YIL BUGÜN =================
  {
    const mk = (groups) => {
      const d = new JSDOM('<section id="onThisDay" hidden></section>', { url: 'http://localhost/', runScripts: 'outside-only' });
      d.window.fetch = async () => resp(200, { groups });
      d.window.eval(read('public/js/on-this-day.js'));
      return d.window;
    };
    const w = mk([
      { yearsAgo: 1, year: 2025, items: [
        { id: 'a1', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', uploaderName: 'ali', caption: '<img src=x onerror=1> merhaba', likes: 3 },
        { id: 'a2', url: 'https://res.cloudinary.com/c/video/upload/so_10,du_150/v1/b.mp4', type: 'video', uploaderName: 'ayşe', caption: '', likes: 1 } ] },
      { yearsAgo: 2, year: 2024, items: [{ id: 'b1', url: 'https://res.cloudinary.com/c/image/upload/v1/c.gif', type: 'image', uploaderName: 'can', caption: 'eski', likes: 0 }] },
    ]);
    await tick();
    const box = w.document.getElementById('onThisDay');
    check('[bugün] anı varsa şerit görünür, başlık ve yıl grupları var', !box.hidden && /Geçen yıl bugün/.test(box.textContent) && /1 yıl önce bugün \(2025\)/.test(box.textContent) && /2 yıl önce bugün \(2024\)/.test(box.textContent));
    check('[bugün] kartlar anı sayfasına gidiyor', !!box.querySelector('a.otd-card[href="/m/a1"]') && !!box.querySelector('a.otd-card[href="/m/b1"]'));
    check('[bugün] görsel küçültülüyor, GIF dokunulmuyor, video JPEG önizleme (kırpılan kareden)', box.querySelector('a[href="/m/a1"] img').src.includes('f_auto,q_auto,w_360,c_limit') && box.querySelector('a[href="/m/b1"] img').src.endsWith('/v1/c.gif') && box.querySelector('a[href="/m/a2"] img').src.includes('so_10,f_jpg,w_360') && !!box.querySelector('a[href="/m/a2"] .otd-play'));
    check('[bugün] XSS: açıklamadaki <img onerror> öğe olmadı, metin düz', !box.querySelector('img[onerror]') && box.textContent.includes('<img src=x onerror=1>'));
    const w2 = mk([]); await tick();
    check('[bugün] anı yoksa şerit HİÇ görünmez', w2.document.getElementById('onThisDay').hidden === true);
  }

  // ================= ARAMA SAYFASI =================
  {
    const html = ejs.render(read('views/search.ejs'), { q: '' }, { filename: P + '/views/search.ejs' });
    const d = new JSDOM(strip(html), { url: 'http://localhost/ara', pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = d.window; const calls = [];
    const item = (id, extra) => ({ id, url: 'https://res.cloudinary.com/c/image/upload/v1/' + id + '.jpg', type: 'image', uploaderName: 'ayşe', caption: 'gezi', tags: ['yaz'], likes: 2, commentCount: 1, ...extra });
    let reply = { items: [item('s1', { caption: '<img src=x onerror=1> yaz' }), item('s2')], users: [{ username: 'ayşe', count: 2 }], tags: [{ tag: 'yaz', count: 2 }], total: 2, nextOffset: 2, hasMore: false };
    w.fetch = async (url) => {
      calls.push(String(url));
      if (url === '/api/tags/trending') return resp(200, { tags: [{ tag: 'komik', count: 5 }, { tag: 'yaz', count: 2 }] });
      return resp(200, reply);
    };
    w.eval(read('public/js/search-page.js')); await tick();
    const $ = (s) => w.document.querySelector(s);
    check('[arama] trend etiketler yüklendi ve görünür', w.document.querySelectorAll('#trending .chip').length === 2 && !$('#trendingBox').hidden);
    const input = $('#searchInput');
    input.value = 'ayşe'; input.dispatchEvent(new w.Event('input')); await sleep(350); await tick();
    check('[arama] yazınca (bekleyip) doğru adrese istek gitti', calls.some((c) => c === '/api/search?q=' + encodeURIComponent('ayşe') + '&offset=0&limit=20'), calls[calls.length - 1]);
    check('[arama] sonuçlar: 2 kart, kişi ve etiket önerisi, trend gizlendi', w.document.querySelectorAll('#items .search-card').length === 2 && !!$('#people a[href="/u/' + encodeURIComponent('ayşe') + '"]') && $('#tagResults .chip') && $('#trendingBox').hidden);
    check('[arama] XSS: açıklamadaki <img onerror> öğe olmadı', !$('#items img[onerror]') && $('#items').textContent.includes('<img src=x onerror=1>'));
    check('[arama] durum satırı sonuç sayısını söylüyor, kartlar /m/ sayfasına gidiyor', /2 anı bulundu/.test($('#searchStatus').textContent) && !!$('#items a[href="/m/s1"]'));
    check('[arama] adres çubuğu ?q= ile güncellendi (paylaşılabilir)', w.location.search === '?q=' + encodeURIComponent('ayşe'));
    $('#tagResults .chip').click(); await sleep(50); await tick();
    check('[arama] etiket önerisine tıklayınca #yaz aranır', input.value === '#yaz' && calls.some((c) => c.startsWith('/api/search?q=' + encodeURIComponent('#yaz'))));
    reply = { items: [item('s3')], users: [], tags: [], total: 21, nextOffset: 1, hasMore: true };
    input.value = 'gezi'; input.dispatchEvent(new w.Event('input')); await sleep(350); await tick();
    check('[arama] daha fazla sonuç varken düğme görünür', $('#searchMore').hidden === false);
    reply = { items: [item('s4'), item('s5')], users: [], tags: [], total: 21, nextOffset: 3, hasMore: false };
    $('#searchMore').click(); await tick();
    check('[arama] "daha fazla": offset gönderildi, kartlar eklendi, düğme gizlendi', calls[calls.length - 1].includes('offset=1') && w.document.querySelectorAll('#items .search-card').length === 3 && $('#searchMore').hidden === true);
    const n = calls.length;
    input.value = 'a'; input.dispatchEvent(new w.Event('input')); await sleep(350); await tick();
    check('[arama] tek karakterde istek ATILMAZ, uyarı verir', calls.length === n && /En az 2 karakter/.test($('#searchStatus').textContent));
    input.value = ''; input.dispatchEvent(new w.Event('input')); await sleep(350); await tick();
    check('[arama] boşaltınca sonuçlar silinir, trend yeniden görünür', w.document.querySelectorAll('#items .search-card').length === 0 && !$('#trendingBox').hidden && w.location.search === '');
    reply = { items: [], users: [], tags: [], total: 0, nextOffset: 0, hasMore: false };
    input.value = 'yokyok'; input.dispatchEvent(new w.Event('input')); await sleep(350); await tick();
    check('[arama] sonuç yoksa "Sonuç bulunamadı"', /Sonuç bulunamadı/.test($('#searchStatus').textContent));
  }

  // ================= PWA / BİLDİRİM: pwa.js =================
  {
    const d = new JSDOM('<body></body>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const w = d.window; const calls = []; let subscribeOpts = null; let cfg = { enabled: true, publicKey: 'AQID' };
    const reg = { pushManager: { _sub: null, async getSubscription() { return this._sub; }, async subscribe(o) { subscribeOpts = o; const self = this; this._sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }), async unsubscribe() { self._sub = null; return true; } }; return this._sub; } } };
    Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: async () => ({}), ready: Promise.resolve(reg) } });
    w.PushManager = class {}; w.Notification = { permission: 'default', requestPermission: async () => 'granted' };
    w.fetch = async (url, opts = {}) => { calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null }); return url === '/api/push/config' ? resp(200, cfg) : resp(200, { ok: true }); };
    w.eval(read('public/js/pwa.js'));
    const P2 = w.CroshyPush;
    check('[bildirim] base64url anahtarı doğru bayta çevrilir', Array.from(P2.urlBase64ToUint8Array('AQID')).join(',') === '1,2,3');
    check('[bildirim] başlangıç: destekleniyor, abone değil, sunucuda açık', P2.supported() && (await P2.getState()).subscribed === false && (await P2.getState()).enabled === true);
    await P2.enable();
    check('[bildirim] açma: izin istendi, uygulama anahtarıyla abone olundu, sunucuya kaydedildi', subscribeOpts.userVisibleOnly === true && subscribeOpts.applicationServerKey.length === 3 && calls.some((c) => c.url === '/api/push/subscribe' && c.body.subscription.endpoint === 'https://push.example/abc' && c.body.subscription.keys.auth === 'A'));
    check('[bildirim] açıldıktan sonra durum "abone"', (await P2.getState()).subscribed === true);
    await P2.disable();
    check('[bildirim] kapatma: sunucudan silindi ve abonelik iptal edildi', calls.some((c) => c.url === '/api/push/unsubscribe' && c.body.endpoint === 'https://push.example/abc') && (await P2.getState()).subscribed === false);
    w.Notification.requestPermission = async () => 'denied';
    let msg = ''; try { await P2.enable(); } catch (e) { msg = e.message; }
    check('[bildirim] izin verilmezse anlaşılır hata', /izni verilmedi/.test(msg));
  }

  // ================= BİLDİRİM PANELİ: cihaz bildirimi satırı =================
  {
    const navHtml = '<header><nav class="site-nav"><div class="social-dropdown"></div></nav></header>';
    async function open(push) {
      const d = new JSDOM(navHtml, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
      const w = d.window;
      w.fetch = async (url) => {
        if (url === '/api/session-status') return resp(200, { loggedIn: true, isAdmin: false, username: 'ayse' });
        if (url === '/api/notifications/count') return resp(200, { unread: 0 });
        if (url === '/api/notifications') return resp(200, { unread: 0, items: [] });
        return resp(200, {});
      };
      if (push) w.CroshyPush = push;
      w.eval(read('public/js/auth-nav.js')); await tick(8);
      w.document.querySelector('.bell-btn').click(); await tick(10);
      return w.document.querySelector('.notif-push');
    }
    const state = { enabled: true, needsInstall: false, permission: 'default', subscribed: false }; const log = [];
    const fake = { available: () => true, getState: async () => ({ ...state }), enable: async () => { log.push('enable'); state.subscribed = true; }, disable: async () => { log.push('disable'); state.subscribed = false; } };
    let row = await open(fake);
    check('[panel] sunucuda açıksa "bu cihazda bildirimleri aç" görünür', !!row && !row.hidden && /bildirimleri aç/.test(row.textContent));
    row.querySelector('button').click(); await tick(8);
    check('[panel] tıklayınca açılır ve düğme "kapat"a döner', log[0] === 'enable' && /bildirimleri kapat/.test(row.querySelector('button').textContent));
    row.querySelector('button').click(); await tick(8);
    check('[panel] tekrar tıklayınca kapanır', log[1] === 'disable' && /bildirimleri aç/.test(row.querySelector('button').textContent));
    fake.enable = async () => { throw new Error('Bildirim izni verilmedi.'); };
    row.querySelector('button').click(); await tick(8);
    check('[panel] hata olursa nedeni satırda yazar', /izni verilmedi/.test(row.textContent));
    state.enabled = false; row = await open(fake);
    check('[panel] sunucuda (VAPID yok) kapalıysa satır GİZLİ', !row || row.hidden);
    Object.assign(state, { enabled: true, needsInstall: true }); row = await open(fake);
    check('[panel] iPhone\'da kurulmadıysa "Ana Ekrana Ekle" yönergesi, düğme yok', /Ana Ekrana Ekle/.test(row.textContent) && row.querySelector('button').hidden === true);
    Object.assign(state, { needsInstall: false, permission: 'denied' }); row = await open(fake);
    check('[panel] izin engelliyse yönerge', /engelli/.test(row.textContent));
    row = await open(null);
    check('[panel] tarayıcı desteklemiyorsa satır hiç eklenmez', row === null);
  }

  // ================= YIL ÖZETİ =================
  {
    const { buildWrapped } = require(P + '/src/lib/wrapped'); const T = Date.parse;
    const mk = (id, userId, extra) => ({ id, userId, type: 'image', likes: 0, commentCount: 0, tags: [], url: 'https://res.cloudinary.com/c/image/upload/v1/' + id + '.jpg', ...extra });
    const items = [
      mk('a', 'u1', { likes: 3, commentCount: 1, tags: ['yaz'], caption: 'ilk', createdAt: T('2026-03-02T10:00:00Z') }),
      mk('b', 'u1', { likes: 9, commentCount: 2, tags: ['yaz'], caption: '</script><b>kötü</b>', createdAt: T('2026-03-09T10:00:00Z') }),
      mk('c', 'u1', { likes: 3, createdAt: T('2026-06-20T10:00:00Z') }),
      ...['u2', 'u3', 'u4', 'u5', 'u6'].map((u, i) => mk('o' + i, u, { createdAt: T('2026-02-05T10:00:00Z') })),
    ];
    const data = buildWrapped({ items, userId: 'u1', year: 2026, reactionsReceived: 7, now: T('2026-12-01T00:00:00Z') });
    data.topMemory.imageUrl = 'https://res.cloudinary.com/c/image/upload/f_auto,q_auto,w_700,c_limit/v1/b.jpg';
    const html = ejs.render(read('views/wrapped.ejs'), { data, year: 2026, username: 'ayse', host: 'croshy.test', years: [2026, 2025] }, { filename: P + '/views/wrapped.ejs' });
    check('[özet] sayfa sayıları gösteriyor (anı, beğeni, yorum, tepki) ve ay grafiği 12 çubuk', /<span class="wrapped-num">3<\/span>/.test(html) && /<span class="wrapped-num">15<\/span>/.test(html) && /<span class="wrapped-num">7<\/span>/.test(html) && (html.match(/class="wrapped-bar"/g) || []).length === 12);
    check('[özet] yıl seçici, en aktif ay ve topluluk sırası', /href="\/yilim\?yil=2025"/.test(html) && /Mart/.test(html) && /ilk %/.test(html));
    check('[özet] verideki </script> sayfayı BOZMAZ (JSON güvenli kaçışlı)', !html.includes('</script><b>kötü') && (html.match(/<script type="application\/json"/g) || []).length === 1);
    const emptyHtml = ejs.render(read('views/wrapped.ejs'), { data: buildWrapped({ items, userId: 'u1', year: 2025 }), year: 2025, username: 'ayse', host: 'x', years: [2026, 2025] }, { filename: P + '/views/wrapped.ejs' });
    check('[özet] anısı olmayan yıl için davetkâr boş durum', /henüz onaylanmış bir anın yok/.test(emptyHtml) && !/id="makeCard"/.test(emptyHtml));

    const d = new JSDOM(strip(html), { url: 'http://localhost/yilim', pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = d.window; const fills = []; const sizes = []; const downloads = [];
    const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (k === 'createLinearGradient') return () => ({ addColorStop() {} }); return (...a) => { if (k === 'fillText') fills.push(a); }; }, set(t, k, v) { t[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { sizes.push([this.width, this.height]); return ctx; };
    w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(['png'], { type: 'image/png' })); };
    w.URL.createObjectURL = () => 'blob:kart';
    w.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
    w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
    w.eval(read('public/js/wrapped.js'));
    const $ = (s) => w.document.querySelector(s);
    check('[özet] kart başta gizli', $('#cardOut').hidden === true);
    $('#makeCard').click(); await sleep(60); await tick();
    const texts = fills.map((f) => String(f[0]));
    check('[özet] kart 1080x1920 (hikaye boyutu) çizildi', sizes.length === 1 && sizes[0][0] === 1080 && sizes[0][1] === 1920);
    check('[özet] kartta kullanıcı adı, yıl ve sayılar var', texts.includes('@ayse') && texts.includes('2026') && texts.includes('3') && texts.includes('15') && texts.includes('7') && texts.includes('croshy.test'));
    check('[özet] önizleme gösterildi, paylaşım desteklenmiyorsa Paylaş gizli', $('#cardPreview').src === 'blob:kart' && $('#cardOut').hidden === false && $('#shareCard').hidden === true);
    $('#downloadCard').click();
    check('[özet] indirme doğru dosya adıyla', downloads[0] === 'croshy-yil-ozeti-2026.png');
  }

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'YENİ ÖZELLİK ARAYÜZ KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
