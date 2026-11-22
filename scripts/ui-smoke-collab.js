// Etiket girişi, kaydet menüsü, emoji seçici, kart entegrasyonu, taslaklar, vitrin/yorum sabitleme, yanıt zinciri ve
// koleksiyon sayfaları için jsdom duman testi. Çalıştır: npm run test:ui
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); };
const tick = (n = 8) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const read = (f) => fs.readFileSync(path.join(P, f), 'utf8');
const strip = (h) => h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const win = (html, url) => new JSDOM(html, { url: url || 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' }).window;
const key = (w, el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

(async () => {
  // ================= ETİKET GİRİŞİ =================
  {
    let w = win('<body><div id="tagInput"></div></body>', 'http://localhost/upload');
    w.fetch = async () => resp(200, { tags: [] });
    w.eval(read('public/js/tag-input.js')); await tick();
    check('[etiket] kimse etiket kullanmadıysa "sık kullanılanlar" satırı HİÇ görünmez', w.document.querySelector('.tag-suggest').hidden === true);

    w = win('<body><div id="tagInput"></div></body>', 'http://localhost/upload');
    w.fetch = async () => resp(200, { tags: [{ tag: 'yaz', users: 3, count: 5 }, { tag: 'croshy', users: 9, count: 9 }, { tag: 'deniz', users: 1, count: 1 }] });
    w.eval(read('public/js/tag-input.js')); await tick();
    const sug = () => [...w.document.querySelectorAll('.tag-suggest .chip')].map((c) => c.dataset.tag);
    const input = () => w.document.querySelector('.tag-input input');
    const type = (v, k) => { input().value = v; key(w, input(), k || 'Enter'); };
    const msg = () => w.document.querySelector('.tag-msg').textContent;
    check('[etiket] öneriler gerçek veriden gelir; croshy önerilmez; kişi sayısı yazar', JSON.stringify(sug()) === '["yaz","deniz"]' && /3 kişi/.test(w.document.querySelector('.tag-suggest .chip').textContent));
    w.document.querySelector('.tag-suggest .chip[data-tag="yaz"]').click();
    check('[etiket] öneriye tıklayınca eklenir ve öneriden kalkar', JSON.stringify(w.uploadTags.getTags()) === '["yaz"]' && JSON.stringify(sug()) === '["deniz"]');
    type('#Komik');
    check('[etiket] Enter ile eklenir; # ve büyük harf temizlenir', JSON.stringify(w.uploadTags.getTags()) === '["yaz","komik"]' && input().value === '');
    type('mavi', ','); // tarayıcıda virgül tuşu değere eklenmeden önce yakalanır
    check('[etiket] virgül ile de eklenir', w.uploadTags.getTags().includes('mavi'));
    const before = w.uploadTags.getTags().length;
    type('CroShy'); const m1 = msg(); type('cro_shy'); type('a');
    check('[etiket] "croshy" (ve cro_shy) reddedilir, tek harf geçersiz', /croshy etiketi kullanılamaz/.test(m1) && w.uploadTags.getTags().length === before && /harf\/rakam/.test(msg()));
    type('beş'); type('altı'); type('yedi');
    check('[etiket] en fazla 5 etiket', w.uploadTags.getTags().length === 5 && /En fazla 5/.test(msg()), w.uploadTags.getTags().join(','));
    input().value = ''; key(w, input(), 'Backspace');
    check('[etiket] Backspace son etiketi siler', w.uploadTags.getTags().length === 4);
    w.document.querySelector('.tag-chip button').click();
    check('[etiket] ✕ ile etiket kaldırılır', w.uploadTags.getTags().length === 3 && !w.uploadTags.getTags().includes('yaz'));
    w.uploadTags.setTags(['x']);
    check('[etiket] setTags geçersizleri (tek harf) eler', w.uploadTags.getTags().length === 0);
  }

  // ================= KAYDET MENÜSÜ =================
  {
    const w = win('<body><button id="a">kaydet</button></body>');
    const calls = []; let authCalled = 0; let nextStatus = 200;
    w.openAuthModal = () => authCalled++; w.alert = () => {};
    const lists = [{ id: 1, name: 'Favoriler', count: 3, hasItem: false }, { id: 2, name: 'Komik', count: 0, hasItem: true }];
    w.fetch = async (url, o = {}) => {
      calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (nextStatus === 401) return resp(401, {});
      if (nextStatus === 409) return resp(409, { error: 'Bu adda bir listen zaten var.' });
      if (url.startsWith('/api/collections?item=')) return resp(200, { collections: lists });
      if (url.endsWith('/toggle')) return resp(200, { ok: true, saved: true });
      return resp(200, { ok: true, collection: { id: 3, name: 'Yaz' } });
    };
    w.eval(read('public/js/save-menu.js'));
    const changes = [];
    w.CroshySave.open(w.document.getElementById('a'), 'i1', { onChange: (c) => changes.push(c.saved) }); await tick();
    const rows = () => [...w.document.querySelectorAll('.save-row')];
    check('[kaydet] kullanıcının listeleri gösterilir, anının olduğu liste işaretli', rows().length === 2 && rows()[1].classList.contains('on') && !rows()[0].classList.contains('on') && changes[0] === true);
    rows()[0].click(); await tick();
    check('[kaydet] listeye tıklayınca toggle isteği gider, işaret ve sayı güncellenir', calls.some((c) => c.url === '/api/collections/1/toggle' && c.body.itemId === 'i1') && rows()[0].classList.contains('on') && /4/.test(rows()[0].textContent));
    const input = w.document.querySelector('.save-create input'); input.value = 'Yaz'; w.document.querySelector('.save-create').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    check('[kaydet] yeni liste oluşturulur ve anı içine eklenir', calls.some((c) => c.url === '/api/collections' && c.body.name === 'Yaz' && c.body.itemId === 'i1') && rows().length === 3 && rows()[2].classList.contains('on'));
    nextStatus = 409; input.value = 'Yaz'; w.document.querySelector('.save-create').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    check('[kaydet] hata (aynı ad) kullanıcıya gösterilir', /zaten var/.test(w.document.querySelector('.save-msg').textContent));
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    check('[kaydet] Esc ile kapanır', !w.document.querySelector('.save-pop'));
    nextStatus = 401; w.CroshySave.open(w.document.getElementById('a'), 'i1'); await tick();
    check('[kaydet] misafir: giriş penceresi açılır, menü kapanır', authCalled === 1 && !w.document.querySelector('.save-pop'));
  }

  // ================= EMOJİ SEÇİCİ =================
  {
    const w = win('<body><button id="a">😊</button></body>');
    const calls = []; let status = 200; let authCalled = 0;
    w.openAuthModal = () => authCalled++; w.alert = () => {};
    w.fetch = async (url, o = {}) => {
      calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (url.endsWith('/reactions')) return resp(200, { counts: { '😂': 2 }, mine: ['😂'] });
      if (status === 401) return resp(401, {});
      return resp(200, { ok: true, summary: { counts: { '🔥': 3, '😂': 2, '👏': 1 }, mine: ['🔥'] } });
    };
    w.eval(read('public/js/reaction-picker.js'));
    let got = null;
    w.CroshyReact.open(w.document.getElementById('a'), 'abc', { onSummary: (s) => (got = s) }); await tick();
    check('[seçici] tuşa basınca 16 emojilik seçici açılır; verdiğim tepki işaretli', w.document.querySelectorAll('.react-pick').length === 16 && !!w.document.querySelector('.react-pick[data-emoji="😂"].active'));
    w.document.querySelector('.react-pick[data-emoji="🔥"]').click(); await tick();
    check('[seçici] emojiye tıklayınca gönderilir, sonuç iletilir, seçici kapanır', calls.some((c) => c.url === '/api/memory/abc/react' && c.body.emoji === '🔥') && got && got.counts['🔥'] === 3 && !w.document.querySelector('.react-pop'));
    check('[seçici] en çok verilen 2 emoji hesaplanır', JSON.stringify(w.CroshyReact.top2(got.counts).map((t) => t.emoji)) === '["🔥","😂"]');
    status = 401; w.CroshyReact.open(w.document.getElementById('a'), 'abc'); await tick();
    w.document.querySelector('.react-pick').click(); await tick();
    check('[seçici] misafir: giriş penceresi açılır', authCalled === 1 && !w.document.querySelector('.react-pop'));
  }

  // ================= GALERİ KARTI: en çok verilen 2 emoji + tepki/kaydet tuşları =================
  {
    const w = win(strip(read('public/index.html')), 'http://localhost/');
    const IOs = []; const reactCalls = []; const saveCalls = [];
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.targets = new Set(); IOs.push(this); } observe(t) { this.targets.add(t); } unobserve(t) { this.targets.delete(t); } disconnect() {} };
    w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
    w.document.fonts = { ready: Promise.resolve() }; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    const mk = (id, extra) => ({ id, url: 'https://res.cloudinary.com/c/image/upload/v1/' + id + '.jpg', type: 'image', uploaderName: 'ali', caption: 'x', likes: 1, likedByMe: false, commentCount: 0, createdAt: 1, ...extra });
    w.fetch = async () => resp(200, { items: [mk('a1', { topReactions: [{ emoji: '😂', count: 12 }, { emoji: '🔥', count: 5 }], savedByMe: true }), mk('a2', {})], total: 2, nextOffset: 2, hasMore: false, token: 't' });
    let react = null; let save = null;
    w.CroshyReact = { open: (a, id, o) => { reactCalls.push(id); react = o; }, top2: (c) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([emoji, count]) => ({ emoji, count })) };
    w.CroshySave = { open: (a, id, o) => { saveCalls.push(id); save = o; } };
    w.eval(read('public/js/lightbox.js') + '\n' + read('public/js/main.js')); await tick(10);
    const cards = w.document.querySelectorAll('.memory-card');
    const tops = (c) => [...c.querySelectorAll('.top-reactions span')].map((s) => s.textContent.replace(/\s+/g, ''));
    check('[kart] köşede en çok verilen 2 emoji küçük gösterilir (sayısıyla); tepkisiz kartta yok', tops(cards[0]).join('|') === '😂12|🔥5' && !cards[1].querySelector('.top-reactions'));
    check('[kart] her kartta tepki ve kaydet tuşu; kaydedilmiş kartta 🔖 dolu', cards[0].querySelector('.react-open') && cards[0].querySelector('.save-open.saved') && !cards[1].querySelector('.save-open.saved'));
    cards[1].querySelector('.react-open').click();
    check('[kart] tepki tuşu seçiciyi bu anı için açar (lightbox açılmaz)', reactCalls[0] === 'a2' && !w.document.getElementById('lightbox'));
    react.onSummary({ counts: { '🎉': 7, '😍': 2, '👏': 1 }, mine: [] });
    check('[kart] seçimden sonra kartın köşesi güncellenir', tops(cards[1]).join('|') === '🎉7|😍2');
    cards[1].querySelector('.save-open').click(); save.onChange({ saved: true });
    check('[kart] kaydet tuşu menüyü açar; kaydedilince işaretlenir', saveCalls[0] === 'a2' && cards[1].querySelector('.save-open').classList.contains('saved'));
    save.onChange({ saved: false });
    check('[kart] listelerden çıkarılınca işaret kalkar', !cards[1].querySelector('.save-open').classList.contains('saved'));
  }

  // ================= TASLAKLAR =================
  {
    const w = win('<body><span id="draftCount"></span><div id="draftList"></div></body>', 'http://localhost/profile');
    const calls = []; w.confirm = () => true; w.alert = () => {};
    const now = Date.now();
    const drafts = [
      { id: 'd1', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', caption: 'selam', tags: ['yaz'], createdAt: now, expiresAt: now + 5 * 86400000 },
      { id: 'd2', url: 'https://res.cloudinary.com/c/video/upload/so_3,du_20/v1/b.mp4', type: 'video', caption: '', tags: [], createdAt: now, expiresAt: now + 30 * 86400000 },
    ];
    w.fetch = async (url, o = {}) => {
      calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (url === '/api/drafts') return resp(200, { drafts, max: 10, days: 30 });
      if (url === '/api/drafts/d2/publish') return resp(429, { error: 'Bugün için gönderme hakkını doldurdun.' });
      if (url.startsWith('/api/popular') || url === '/api/tags/popular') return resp(200, { tags: [] });
      return resp(200, { ok: true });
    };
    w.eval(read('public/js/tag-input.js') + '\n' + read('public/js/drafts.js')); await tick(10);
    const cards = () => [...w.document.querySelectorAll('.draft-card')];
    check('[taslak] taslaklar listelenir, sayaç (2); video önizlemesi JPEG', cards().length === 2 && w.document.getElementById('draftCount').textContent === '(2)' && cards()[1].querySelector('img').src.includes('so_3,f_jpg'));
    check('[taslak] açıklama, etiketler ve kalan gün gösterilir', cards()[0].querySelector('textarea').value === 'selam' && cards()[0].querySelector('.tag-chip').textContent.includes('#yaz') && /5 gün sonra/.test(cards()[0].textContent));
    cards()[0].querySelector('textarea').value = 'yeni açıklama'; cards()[0].querySelector('.btn.small').click(); await tick();
    check('[taslak] 💾 Kaydet: açıklama ve etiketler güncelleme isteğiyle gider', calls.some((c) => c.url === '/api/drafts/d1/update' && c.body.caption === 'yeni açıklama' && JSON.stringify(c.body.tags) === '["yaz"]') && /Kaydedildi/.test(cards()[0].querySelector('.draft-msg').textContent));
    cards()[1].querySelector('.btn.primary').click(); await tick();
    check('[taslak] hak dolu: paylaşım reddedilir, nedeni yazar, taslak KALIR', /doldurdun/.test(cards()[1].querySelector('.draft-msg').textContent) && cards().length === 2);
    cards()[0].querySelector('.btn.primary').click(); await tick(10);
    check('[taslak] 🚀 Paylaş: taslak listeden kalkar, sayaç (1), onay mesajı', calls.some((c) => c.url === '/api/drafts/d1/publish' && c.body.caption === 'yeni açıklama') && cards().length === 1 && w.document.getElementById('draftCount').textContent === '(1)' && /onaya gönderildi/.test(w.document.getElementById('draftList').textContent));
    cards()[0].querySelector('.btn.danger').click(); await tick(10);
    check('[taslak] 🗑️ Sil: onaydan sonra silinir; hiç taslak kalmayınca boş durum', calls.some((c) => c.url === '/api/drafts/d2/delete') && cards().length === 0 && !!w.document.querySelector('.draft-empty') && w.document.getElementById('draftCount').textContent === '');
  }

  // ================= VİTRİN ANISI (profil) =================
  {
    const w = win('<body><button data-pin="a" data-pinned="0">📌</button><button data-pin="b" data-pinned="1">📌</button></body>', 'http://localhost/profile');
    const calls = []; w.alert = () => {};
    w.fetch = async (url, o = {}) => { calls.push({ url, body: JSON.parse(o.body) }); return resp(200, { ok: true }); };
    w.eval(read('public/js/pin.js'));
    const [a, b] = w.document.querySelectorAll('[data-pin]');
    a.click(); await tick(); b.click(); await tick();
    check('[vitrin] sabitli değilse /pin, sabitliyse /unpin çağrılır', calls[0].url === '/api/profile/pin' && calls[0].body.itemId === 'a' && calls[1].url === '/api/profile/unpin');
  }

  // ================= ANI SAYFASI: yanıt zinciri + sabitleme =================
  {
    const { renderRich } = require(P + '/src/lib/richtext'); const { cloudImg } = require(P + '/src/lib/cloud');
    const c = (id, name, extra) => ({ id, userId: 'u' + id, username: name, avatarUrl: null, nameHtml: name, bodyHtml: 'yorum ' + id, createdAt: 1000 + id, parentId: null, pinnedAt: null, byOwner: false, isMine: false, canDelete: false, canPin: false, replies: [], ...extra });
    const thread = (owner) => [
      c(1, 'ayse', { pinnedAt: 5, byOwner: true, canDelete: owner, canPin: owner, replies: [c(2, 'ali', { parentId: 1, canDelete: owner })] }),
      c(3, 'can', { canDelete: owner, canPin: owner }),
    ];
    const render = (owner) => ejs.render(read('views/memory.ejs'), {
      item: { id: 'abc', url: 'https://res.cloudinary.com/c/image/upload/v1/a.jpg', type: 'image', caption: 'merhaba', createdAt: Date.now(), status: 'approved', userId: 'u1' },
      owner: { username: 'ayse', avatarUrl: null, nameStyle: null }, ownerNameHtml: 'ayse', likeTotal: 0, likedByMe: false, reactions: { counts: { '😂': 3, '🔥': 1 }, mine: [] },
      EMOJIS: [], comments: thread(owner), commentTotal: 3, tags: ['yaz', 'deniz'], loggedIn: true, isOwner: owner, isPinnedOnProfile: false, canInteract: true,
      pageUrl: 'https://x/m/abc', ogImage: '', ogTitle: 't', ogDescription: 'd', renderRich, cloudImg,
    }, { filename: P + '/views/memory.ejs' });

    const ownerHtml = render(true); const visitorHtml = render(false);
    const w = win(strip(ownerHtml), 'http://localhost/m/abc');
    const $ = (s) => w.document.querySelector(s); const $$ = (s) => [...w.document.querySelectorAll(s)];
    check('[zincir] sabit yorum en üstte, "Sabitlenmiş yorum" ve "anı sahibi" etiketli', $('#commentList > .comment').dataset.id === '1' && $('#commentList > .comment').classList.contains('is-pinned') && /Sabitlenmiş yorum/.test($('.comment-pinned-label').textContent) && /anı sahibi/.test($('.comment-owner-tag').textContent));
    check('[zincir] yanıt, üst yorumun altındaki listede (iç içe), sayaç toplamı 3', !!$('ul.replies[data-replies-of="1"] > .comment.is-reply[data-id="2"]') && $('#commentCount').textContent === '3');
    check('[sayfa] etiketler gösteriliyor, tepki çipleri sayıya göre (😂3, 🔥1), "Tepki ver" tuşu var', $$('.memory-tags .chip').map((x) => x.textContent).join(',') === '#yaz,#deniz' && $$('#reactChips .react-chip').map((x) => x.dataset.emoji).join('') === '😂🔥' && !!$('#reactOpen') && !!$('#saveBtn'));
    check('[zincir] anı sahibi yalnızca ÜST yorumlarda sabitle düğmesini görür (yanıtta yok); sabit olan "kaldır" der', $$('[data-pin-comment]').length === 2 && /kaldır/.test($('[data-pin-comment="1"]').textContent) && !$('.is-reply [data-pin-comment]'));
    const vw = win(strip(visitorHtml), 'http://localhost/m/abc');
    check('[zincir] ziyaretçi sabitleyemez; vitrin düğmesi de yok', vw.document.querySelectorAll('[data-pin-comment]').length === 0 && !vw.document.getElementById('pinProfileBtn'));
    check('[vitrin] anı sahibi anı sayfasında "Profilimde sabitle" düğmesini görür', !!$('#pinProfileBtn') && /Profilimde sabitle/.test($('#pinProfileBtn').textContent));

    const calls = []; w.confirm = () => true; w.alert = () => {};
    let n = 50;
    w.fetch = async (url, o = {}) => {
      calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (url === '/api/memory/abc/comments') return resp(200, { ok: true, comment: c(++n, 'ben', { parentId: calls[calls.length - 1].body.parentId ? Number(calls[calls.length - 1].body.parentId) : null, isMine: true, canDelete: true }) });
      return resp(200, { ok: true });
    };
    w.eval(read('public/js/memory-page.js'));
    $('[data-reply="3"]').click();
    check('[zincir] "Yanıtla" yorumun altında yanıt kutusu açar', !!$('.comment[data-id="3"] .reply-form') && $('.reply-form textarea').value === '');
    $('[data-reply="2"]').click();
    check('[zincir] bir yanıta yanıt: tek kutu kalır, @ad ile başlar', $$('.reply-form').length === 1 && !!$('.comment[data-id="2"] .reply-form') && $('.reply-form textarea').value === '@ali ');
    $('.reply-form textarea').value = '@ali merhaba'; $('.reply-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    const posted = calls.find((x) => x.url === '/api/memory/abc/comments');
    check('[zincir] yanıt parentId ile gönderilir ve ÜST yorumun altına eklenir (yanıtın altına değil)', posted && posted.body.parentId === '2' && posted.body.body === '@ali merhaba' && !!$('ul.replies[data-replies-of="1"] > .comment.is-reply[data-id="51"]') && $$('.reply-form').length === 0);
    check('[zincir] sayaç 4 oldu', $('#commentCount').textContent === '4');
    $('[data-reply="3"]').click(); $('.reply-form textarea').value = 'üste yanıt'; $('.reply-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    check('[zincir] ana yoruma yanıt kendi listesine girer', !!$('ul.replies[data-replies-of="3"] > .comment.is-reply[data-id="52"]') && $('#commentCount').textContent === '5');
    $('[data-pin-comment="3"]').click(); await tick();
    check('[sabit] sabitle: pinned=true gönderilir', calls.some((x) => x.url === '/api/comments/3/pin' && x.body.pinned === true));
    $('[data-pin-comment="1"]').click(); await tick();
    check('[sabit] sabitlemeyi kaldır: pinned=false gönderilir', calls.some((x) => x.url === '/api/comments/1/pin' && x.body.pinned === false));
    $('[data-del="1"]').click(); await tick();
    check('[zincir] üst yorum silinince yanıtlarıyla kalkar, sayaç 1 (3 yorum düştü)', !$('.comment[data-id="1"]') && !$('.comment[data-id="2"]') && $('#commentCount').textContent === '2', $('#commentCount').textContent);
    $('#pinProfileBtn').click(); await tick();
    check('[vitrin] "Profilimde sabitle" → /api/profile/pin; düğme "Vitrinden kaldır" olur', calls.some((x) => x.url === '/api/profile/pin' && x.body.itemId === 'abc') && /Vitrinden kaldır/.test($('#pinProfileBtn').textContent));
    $('#pinProfileBtn').click(); await tick();
    check('[vitrin] tekrar basınca /unpin', calls.some((x) => x.url === '/api/profile/unpin') && /Profilimde sabitle/.test($('#pinProfileBtn').textContent));
  }

  // ================= KOLEKSİYON SAYFALARI =================
  {
    const locals = { cloudImg: (u) => u, videoPoster: (u) => u };
    const ph = ejs.render(read('views/collections.ejs'), { ...locals, max: 20, cards: [{ id: 1, name: 'Favoriler', count: 2, previews: [{ url: 'https://res.cloudinary.com/c/image/upload/a.jpg', type: 'image' }] }] }, { filename: P + '/views/collections.ejs' });
    let w = win(strip(ph), 'http://localhost/koleksiyonlar'); let calls = [];
    w.fetch = async (url, o = {}) => { calls.push({ url, body: JSON.parse(o.body) }); return resp(200, { ok: true }); };
    w.eval(read('public/js/collections-page.js'));
    check('[liste] liste kartı: ad, anı sayısı, 4 gözlü önizleme', /Favoriler/.test(w.document.body.textContent) && /2 anı/.test(w.document.body.textContent) && w.document.querySelectorAll('.collection-mosaic > *').length === 4 && w.document.querySelector('.collection-card').getAttribute('href') === '/koleksiyonlar/1');
    w.document.getElementById('newListName').value = 'Komik Anlar'; w.document.getElementById('newListForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    check('[liste] yeni liste oluşturma isteği', calls[0].url === '/api/collections' && calls[0].body.name === 'Komik Anlar');

    const dh = ejs.render(read('views/collection.ejs'), { ...locals, col: { id: 7, name: 'Yaz Tatili' }, items: [{ id: 'i1', url: 'https://res.cloudinary.com/c/image/upload/a.jpg', type: 'image', uploaderName: 'ali', caption: 'deniz', likes: 1 }] }, { filename: P + '/views/collection.ejs' });
    w = win(strip(dh), 'http://localhost/koleksiyonlar/7'); calls = []; w.confirm = () => true; w.prompt = () => 'Yeni ad';
    w.fetch = async (url, o = {}) => { calls.push({ url, body: JSON.parse(o.body) }); return resp(200, { ok: true }); };
    w.eval(read('public/js/collections-page.js'));
    w.document.getElementById('renameList').click(); await tick();
    w.document.querySelector('[data-remove="i1"]').click(); await tick();
    w.document.getElementById('deleteList').click(); await tick();
    check('[liste] ad değiştir / listeden çıkar / listeyi sil istekleri', calls.some((c) => c.url === '/api/collections/7/rename' && c.body.name === 'Yeni ad') && calls.some((c) => c.url === '/api/collections/7/items/i1/remove') && calls.some((c) => c.url === '/api/collections/7/delete'));
    check('[liste] çıkarılan anı kartı sayfadan kalkar', !w.document.querySelector('.collection-item'));
  }

  const ok = results.every(Boolean);
  console.log('\n' + (ok ? 'KOLEKSİYON / TASLAK / ZİNCİR ARAYÜZ KONTROLLERİ GEÇTİ ✅' : 'BAŞARISIZ KONTROLLER VAR ❌') + ` (${results.filter(Boolean).length}/${results.length})`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('HATA', e); process.exit(2); });
