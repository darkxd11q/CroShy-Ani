// Galeride ekranın ÖNÜNDEKİ (aşağıdaki) medyalardan hangilerinin arka planda yükleneceğini belirler:
//  - 2. VİDEOYA kadar (aradaki fotoğraflar dahil) yüklenir, 2. videodan sonrası yüklenmez;
//  - uzun süre video gelmezse en fazla 20 fotoğraf yüklenir.
// Görünen kartlar ve hemen üstündeki 2 kart her zaman yüklü kalır.
(function (root) {
  const MAX_VIDEOS = 2;
  const MAX_PHOTOS = 20;
  const BEHIND = 2;

  // types: kartların sırayla türleri ('image' | 'video'); first/last: ekranda görünen ilk/son kart
  function compute(types, first, last) {
    const load = new Set();
    const n = types.length;
    if (n === 0) return load;
    first = Math.max(0, Math.min(first, n - 1));
    last = Math.max(first, Math.min(last, n - 1));
    for (let i = Math.max(0, first - BEHIND); i <= last; i++) load.add(i);

    let videos = 0;
    let photos = 0;
    for (let j = last + 1; j < n; j++) {
      if (types[j] === 'video') {
        load.add(j);
        if (++videos >= MAX_VIDEOS) break; // 2. videoyu geçince dur
      } else {
        if (photos >= MAX_PHOTOS) break; // video gelmiyorsa en fazla 20 fotoğraf
        load.add(j);
        photos++;
      }
    }
    return load;
  }

  const api = { compute, MAX_VIDEOS, MAX_PHOTOS, BEHIND };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CroshyMediaWindow = api;
})(typeof window !== 'undefined' ? window : globalThis);
