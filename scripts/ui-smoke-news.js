// Güncelleme duyurusu (aura/animasyon), şifresiz geçiş düğmeleri, medya ön yükleme penceresi ve #tepkiler kaydırması.
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..');
const { LATEST } = require(P + '/src/releases');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 8) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const read = (f) => fs.readFileSync(path.join(P, f), 'utf8');
const strip = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const win = (html, url) => new JSDOM(html, { url: url || 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' }).window;

(async () => {
  // ================= GÜNCELLEME DUYURUSU =================
  async function news(opts = {}) {
    const w = win('<body></body>', opts.url || 'http://localhost/');
    const calls = [];
    w.matchMedia = () => ({ matches: !!opts.reduced });
    w.fetch = async (url, o = {}) => { calls.push({ url: String(url), body: o.body ? JSON.parse(o.body) : null }); return resp(200, opts.reply || { release: LATEST, latestId: LATEST.id }); };
    if (opts.seen) w.localStorage.setItem('croshy_seen_release', opts.seen);
    w.eval(read('public/js/whats-new.js'));
    await sleep(opts.wait || 800);
    return { w, calls, $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)] };
  }
  let n = await news();
  const parts = () => n.$$('.wn-p').map((p) => p.textContent);
  check('[duyuru] ilk girişte açılır: 5 menü sekmesi, "YENİ" rozeti, 1/5', !!n.$('.wn-overlay') && n.$$('.wn-tab').length === 5 && n.$('.wn-badge').textContent === 'YENİ' && n.$('.wn-count').textContent === '1 / 5');
  check('[duyuru] 1. özellik: kendi aurası (bookmark), başlık ve parçacıklar kendi emojileri', n.$('.wn-card').dataset.aura === 'bookmark' && /KOLEKSİYON/.test(n.$('.wn-title').textContent) && parts().length === 14 && parts().every((p) => LATEST.slides[0].particles.includes(p)));
  check('[duyuru] ilk slaytta "Geri" kapalı, alttaki düğme "Sonraki →"', n.$('.wn-back').disabled && /Sonraki/.test(n.$('.wn-next').textContent));
  n.$('.wn-next').click();
  check('[duyuru] Sonraki → 2. özellik: aura değişir (chat), parçacıklar değişir, sekme seçilir', n.$('.wn-card').dataset.aura === 'chat' && n.$('.wn-count').textContent === '2 / 5' && n.$$('.wn-tab')[1].getAttribute('aria-selected') === 'true' && parts().every((p) => LATEST.slides[1].particles.includes(p)));
  n.$$('.wn-tab')[3].click();
  check('[duyuru] menüden 4. özelliğe atlanır (search aurası)', n.$('.wn-card').dataset.aura === 'search' && n.$('.wn-count').textContent === '4 / 5');
  n.w.document.dispatchEvent(new n.w.KeyboardEvent('keydown', { key: 'ArrowRight' })); n.w.document.dispatchEvent(new n.w.KeyboardEvent('keydown', { key: 'ArrowLeft' })); n.w.document.dispatchEvent(new n.w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  check('[duyuru] klavye okları ile gezilir; son slaytta düğme "Hadi başlayalım"', n.$('.wn-count').textContent === '5 / 5' && n.$('.wn-card').dataset.aura === 'bell' && /Hadi başlayalım/.test(n.$('.wn-next').textContent));
  n.$('.wn-next').click(); await sleep(350);
  check('[duyuru] bitirince kapanır; görüldü olarak kaydedilir (tarayıcı + sunucu)', !n.$('.wn-overlay') && n.w.localStorage.getItem('croshy_seen_release') === LATEST.id && n.calls.some((c) => c.url === '/api/whats-new/seen' && c.body.id === LATEST.id) && !n.w.document.body.classList.contains('wn-lock'));
  n = await news(); n.w.document.dispatchEvent(new n.w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(350);
  check('[duyuru] Esc ile de kapanır ve görüldü sayılır', !n.$('.wn-overlay') && n.w.localStorage.getItem('croshy_seen_release') === LATEST.id);
  n = await news(); n.$('.wn-skip').click(); await sleep(350);
  check('[duyuru] "Atla" çalışır', !n.$('.wn-overlay'));
  n = await news({ reduced: true });
  check('[duyuru] "hareketi azalt" ayarında parçacık animasyonu YOK, içerik var', !!n.$('.wn-overlay') && n.$$('.wn-p').length === 0);
  n = await news({ url: 'http://localhost/admin' });
  check('[duyuru] admin/giriş/yükleme sayfalarında hiç istek atılmaz, açılmaz', n.calls.length === 0 && !n.$('.wn-overlay'));
  n = await news({ reply: { release: null, latestId: LATEST.id, firstVisit: true } });
  check('[duyuru] siteyi ilk kez gören misafire gösterilmez, sürüm işaretlenir', !n.$('.wn-overlay') && n.w.localStorage.getItem('croshy_seen_release') === LATEST.id);
  n = await news({ url: 'http://localhost/?whatsnew=1', seen: LATEST.id });
  check('[duyuru] ?whatsnew=1 önizleme isteği force ile gider', /force=1/.test(n.calls[0].url) && !!n.$('.wn-overlay'));

  // ================= ŞİFRESİZ GEÇİŞ DÜĞMELERİ (üst menü) =================
  async function nav(session, replies) {
    const w = win('<header><nav class="site-nav"><div class="social-dropdown"></div></nav></header>');
    const calls = []; const navs = []; let r = 0;
    w.CROSHY_NAVIGATE = (u) => navs.push(u); w.alert = () => {}; w.prompt = () => '123456';
    w.fetch = async (url, o = {}) => {
      calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (url === '/api/session-status') return resp(200, session);
      if (url === '/api/identity/switch') return replies[Math.min(r++, replies.length - 1)];
      if (url === '/api/notifications/count') return resp(200, { unread: 0 });
      return resp(200, {});
    };
    w.eval(read('public/js/auth-nav.js')); await tick(10);
    return { w, calls, navs, $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)] };
  }
  let g = await nav({ loggedIn: true, isAdmin: false, username: 'ayse', canSwitch: 'admin' }, [resp(401, { needTotp: true, error: 'Kod gerekli' }), resp(200, { ok: true, redirect: '/admin' })]);
  g.$('.nav-menu-btn').click();
  const item = g.$$('.nav-menu-item').find((e) => /Admin paneline geç/.test(e.textContent));
  check('[geçiş] bağlı yönetici hesabı olan kişinin menüsünde "🛡️ Admin paneline geç" var', !!item);
  item.click(); await tick(12);
  const sw = g.calls.filter((c) => c.url === '/api/identity/switch');
  check('[geçiş] 2FA açıksa kod sorulur, kodla yeniden denenir, sonra /admin\'e gidilir', sw.length === 2 && sw[0].body.to === 'admin' && !sw[0].body.totp && sw[1].body.totp === '123456' && g.navs[0] === '/admin');
  g = await nav({ loggedIn: true, isAdmin: false, username: 'ali', canSwitch: null }, [resp(200, {})]);
  g.$('.nav-menu-btn').click();
  check('[geçiş] bağı olmayan normal kullanıcıda bu seçenek HİÇ görünmez', !g.$$('.nav-menu-item').some((e) => /Admin paneline/.test(e.textContent)));
  g = await nav({ loggedIn: true, isAdmin: true, username: 'zeynep', canSwitch: 'user' }, [resp(200, { ok: true, redirect: '/' })]);
  const toUser = g.$$('.nav-cluster button').find((b) => /Normal hesabım/.test(b.textContent));
  check('[geçiş] admin oturumunda "👤 Normal hesabım" düğmesi var', !!toUser);
  toUser.click(); await tick(10);
  check('[geçiş] tıklayınca şifresiz geçilir (to=user) ve ana sayfaya gidilir', g.calls.some((c) => c.url === '/api/identity/switch' && c.body.to === 'user') && g.navs[0] === '/');

  // ================= MEDYA ÖN YÜKLEME PENCERESİ (galeri) =================
  {
    const w = win(strip(read('public/index.html')), 'http://localhost/');
    const IOs = [];
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.targets = new Set(); IOs.push(this); } observe(t) { this.targets.add(t); } unobserve(t) { this.targets.delete(t); } disconnect() {} };
    w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
    w.document.fonts = { ready: Promise.resolve() }; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {}; w.HTMLMediaElement.prototype.load = () => {};
    Object.defineProperty(w, 'innerHeight', { value: 800 });
    let scrollY = 0;
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      if (!this.classList || !this.classList.contains('memory-card')) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
      const i = Number(this.dataset.index); const top = i * 400 - scrollY;
      return { top, bottom: top + 380, left: 0, right: 300, width: 300, height: 380 };
    };
    const all = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, url: 'https://res.cloudinary.com/c/' + (i === 6 || i === 8 ? 'video' : 'image') + '/upload/v1/x' + i + (i === 6 || i === 8 ? '.mp4' : '.jpg'), type: i === 6 || i === 8 ? 'video' : 'image', uploaderName: 'k', caption: '', likes: 0, likedByMe: false, commentCount: 0, createdAt: i }));
    w.fetch = async () => resp(200, { items: all, total: 30, nextOffset: 30, hasMore: false, token: 't' });
    w.eval(read('public/js/media-window.js') + '\n' + read('public/js/main.js')); await sleep(400);
    const card = (i) => w.document.querySelectorAll('.memory-card')[i];
    const loaded = (i) => { const m = card(i).querySelector('img, video'); return !!m.getAttribute('src'); };
    const idxs = (f) => Array.from({ length: 30 }, (_, i) => i).filter(f);
    check('[pencere] başlangıç: görünen 2 kart + 2. videoya kadar (0-8) yüklü, 9+ yüklenmedi', idxs(loaded).join(',') === '0,1,2,3,4,5,6,7,8', idxs(loaded).join(','));
    check('[pencere] hazırlanan videolar yalnızca "metadata" olarak yüklenir (oynatılmaz)', card(6).querySelector('video').preload === 'metadata' && /#t=0\.1$/.test(card(6).querySelector('video').getAttribute('src')));
    scrollY = 4000; w.dispatchEvent(new w.Event('scroll')); await sleep(300);
    const l2 = idxs(loaded);
    check('[pencere] aşağı inince: eski videolar bellekten bırakılır (6), hemen üstteki 2 kart (8) kalır', !loaded(6) && loaded(8) && l2.includes(10) && l2.includes(29), l2.join(','));
    check('[pencere] video yoksa ileriye yalnızca ≤20 fotoğraf yüklenir (burada kalan hepsi 18)', l2.filter((i) => i > 11).length === 18);
  }

  // ================= ANI SAYFASI: #tepkiler kaydırması =================
  {
    const { renderRich } = require(P + '/src/lib/richtext'); const { cloudImg } = require(P + '/src/lib/cloud');
    const html = ejs.render(read('views/memory.ejs'), {
      item: { id: 'abc', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', caption: 'x', createdAt: Date.now(), status: 'approved', userId: 'u1' },
      owner: { username: 'a', avatarUrl: null, nameStyle: null }, ownerNameHtml: 'a', likeTotal: 0, likedByMe: false, reactions: { counts: {}, mine: [] }, EMOJIS: [], comments: [], commentTotal: 0,
      tags: [], loggedIn: false, isOwner: false, canInteract: false, pageUrl: 'x', ogImage: '', ogTitle: 't', ogDescription: 'd', renderRich, cloudImg,
    }, { filename: P + '/views/memory.ejs' });
    const mk = (hash) => { const w = win(strip(html), 'http://localhost/m/abc' + hash); w.scrollCalls = 0; w.Element.prototype.scrollIntoView = function () { if (this.id === 'tepkiler') w.scrollCalls++; }; w.fetch = async () => resp(200, {}); return w; };
    let w = mk('#tepkiler'); w.eval(read('public/js/memory-page.js'));
    check('[sayfa] galeriden gelince (#tepkiler) tepki + yorum bölümüne anında kaydırılır', !!w.document.getElementById('tepkiler') && w.scrollCalls === 1);
    w.document.querySelector('.memory-media img').dispatchEvent(new w.Event('load'));
    check('[sayfa] görsel yüklenince yer kayarsa yeniden hizalanır', w.scrollCalls === 2);
    w = mk('#tepkiler'); w.eval(read('public/js/memory-page.js')); w.dispatchEvent(new w.Event('wheel')); w.document.querySelector('.memory-media img').dispatchEvent(new w.Event('load'));
    check('[sayfa] kullanıcı kendisi kaydırdıysa zorla geri çekilmez', w.scrollCalls === 1);
    w = mk(''); w.eval(read('public/js/memory-page.js'));
    check('[sayfa] doğrudan bağlantıyla açılınca kaydırma yok', w.scrollCalls === 0);
  }

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'DUYURU / GEÇİŞ / ÖN YÜKLEME KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
