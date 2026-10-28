// Ana sayfa (sayfalama, beğeni, XSS, etiket, lightbox) uçtan uca duman testi — jsdom ile. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
let html = fs.readFileSync(root + '/index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const w = dom.window;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 4) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });

// ---- sahte tarayıcı API'leri ----
const IOs = [];
w.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.targets = new Set(); IOs.push(this); } observe(t) { this.targets.add(t); } unobserve(t) { this.targets.delete(t); } disconnect() {} };
w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
w.document.fonts = { ready: Promise.resolve() };
w.HTMLElement.prototype.scrollIntoView = function () {};
let authModalCalled = 0;
w.openAuthModal = () => authModalCalled++;
w.HTMLMediaElement.prototype.play = () => Promise.resolve();
w.HTMLMediaElement.prototype.pause = () => {};

// ---- sahte sunucu ----
const all = Array.from({ length: 25 }, (_, i) => ({
  id: 'i' + (i + 1), url: 'https://res.cloudinary.com/c/' + (i % 5 === 4 ? 'video' : 'image') + '/upload/v1/x' + i + (i % 5 === 4 ? '.mp4' : '.jpg'),
  type: i % 5 === 4 ? 'video' : 'image', uploaderName: 'kisi' + i, caption: i === 2 ? '<img src=x onerror=alert(1)> #komik @ayse' : 'anı ' + i,
  likes: i, likedByMe: false, commentCount: i % 3, createdAt: 1000 + i, uploaderAvatar: i === 1 ? 'https://res.cloudinary.com/c/image/upload/a.jpg' : null,
  uploaderStyle: i === 0 ? { type: 'preset', id: 'ocean' } : null,
}));
const calls = [];
let likeStatus = 401;
w.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET' });
  const u = new URL(String(url), 'http://localhost');
  if (u.pathname === '/api/approved') {
    const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit'));
    const tag = u.searchParams.get('tag');
    const list = tag ? all.filter((i) => i.caption.includes('#' + tag)) : all;
    const page = list.slice(off, off + lim);
    return { ok: true, status: 200, json: async () => ({ items: page, total: list.length, offset: off, nextOffset: off + page.length, hasMore: off + lim < list.length, token: 'tok1' }) };
  }
  if (u.pathname.startsWith('/api/like/')) {
    return likeStatus === 401 ? { ok: false, status: 401, json: async () => ({ loginRequired: true }) } : { ok: true, status: 200, json: async () => ({ liked: true, count: 99 }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

// ---- betikleri yükle (lightbox + main aynı kapsamda) ----
w.eval(fs.readFileSync(root + '/js/lightbox.js', 'utf8') + '\n' + fs.readFileSync(root + '/js/main.js', 'utf8'));

(async () => {
  await tick(8);
  const T = w.document.getElementById('memory-timeline');
  const rows = () => T.querySelectorAll('.memory-row').length;
  check('ilk sayfa 12 anı yükledi', rows() === 12, rows() + ' satır');
  check('sayaç toplamı gösteriyor', /25 anı paylaşıldı/.test(w.document.getElementById('gallery-count').textContent), w.document.getElementById('gallery-count').textContent);
  check('ilk istek: sort/limit/offset=0, token yok', /sort=algorithm/.test(calls[0].url) && /limit=12/.test(calls[0].url) && /offset=0/.test(calls[0].url) && !/token=/.test(calls[0].url), calls[0].url);

  const sentinel = w.document.getElementById('loadSentinel');
  const sentinelIO = IOs.find((io) => io.targets.has(sentinel));
  check('sonsuz kaydırma gözlemcisi kuruldu', !!sentinelIO);
  sentinelIO.cb([{ isIntersecting: true }]); await tick(6);
  check('ikinci sayfa eklendi (24)', rows() === 24, rows() + ' satır');
  check('ikinci istek token + offset=12 gönderdi', /token=tok1/.test(calls[calls.length - 1].url) && /offset=12/.test(calls[calls.length - 1].url), calls[calls.length - 1].url);
  sentinelIO.cb([{ isIntersecting: true }]); await tick(6);
  check('son sayfa eklendi (25) ve "daha fazla" gizlendi', rows() === 25 && w.document.getElementById('loadMoreBtn').hidden === true);
  const before = calls.length; sentinelIO.cb([{ isIntersecting: true }]); await tick(4);
  check('bitince tekrar istek atılmaz', calls.length === before);

  check('XSS: açıklamadaki <img onerror> çalıştırılabilir öğe üretmedi', !T.querySelector('img[onerror]') && T.innerHTML.includes('&lt;img src=x onerror'));
  check('açıklamadaki #etiket bağlantıya dönüştü', !!T.querySelector('a.tag-link[href="/?tag=komik"]'));
  check('@bahsetme bağlantıya dönüştü', !!T.querySelector('a.mention-link[href="/u/ayse"]'));
  check('gönderen avatarı küçük .card-avatar olarak eklendi', !!T.querySelector('.memory-card img.card-avatar'));
  check('renkli isim (gradyan) uygulandı', !!T.querySelector('.name-grad'));
  check('yorum sayısı chip\'i anı sayfasına gidiyor', !!T.querySelector('a.comment-chip[href^="/m/i"]'));
  check('görseller Cloudinary ile küçültülüyor (f_auto,q_auto,w_720)', T.querySelector('img[loading="lazy"]').src.includes('f_auto,q_auto,w_720,c_limit'));

  const vid = T.querySelector('video[data-src]');
  check('video başta yüklenmiyor (src yok, data-src var)', !!vid && !vid.getAttribute('src'));
  const videoIO = IOs.find((io) => io.targets.has(vid));
  videoIO.cb([{ target: vid, isIntersecting: true, intersectionRatio: 1 }]);
  check('video ekrana girince src atanıyor', /#t=0\.1$/.test(vid.getAttribute('src') || ''), vid.getAttribute('src'));

  // beğeni: giriş yoksa giriş penceresi
  const likeBtn = T.querySelector('.like-btn');
  likeBtn.click(); await tick(5);
  check('misafir beğenmeye çalışınca giriş penceresi açıldı', authModalCalled === 1);
  likeStatus = 200; likeBtn.click(); await tick(5);
  check('girişli beğeni: sayı ve durum güncellendi', likeBtn.classList.contains('liked') && likeBtn.querySelector('.like-count').textContent === '99' && likeBtn.getAttribute('aria-pressed') === 'true');

  // lightbox
  T.querySelector('.memory-card').click(); await tick(2);
  const lb = w.document.getElementById('lightbox');
  check('karta tıklayınca lightbox açıldı', !!lb && lb.classList.contains('open'));
  check('lightbox: anı sayfası bağlantısı + rol=dialog', !!lb.querySelector('a.lightbox-link[href^="/m/i"]') && lb.getAttribute('role') === 'dialog');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); await tick(1);
  check('Esc ile lightbox kapandı', !lb.classList.contains('open'));

  // etiket filtresi
  T.querySelector('a.tag-link').click(); await tick(8);
  const last = calls[calls.length - 1].url;
  check('etikete tıklayınca tag=komik ile yeniden yüklendi', /tag=komik/.test(last) && !/token=/.test(last), last);
  check('URL güncellendi (?tag=komik)', w.location.search === '?tag=komik');
  check('etiket çipi görünür', !w.document.getElementById('tagFilter').hidden && w.document.getElementById('tagFilter').textContent.includes('#komik'));
  check('filtreli sonuç yalnızca eşleşenleri gösteriyor', rows() === 1, rows() + ' satır');

  // sıralama
  w.document.querySelector('.sort-btn[data-sort="likes"]').click(); await tick(6);
  check('sıralama değişince sort=likes ile yeniden yüklendi', /sort=likes/.test(calls[calls.length - 1].url));

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'TÜM ÖN YÜZ KONTROLLERİ GEÇTİ ✅' : 'BAZI KONTROLLER BAŞARISIZ ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
