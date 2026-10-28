// Cloudinary URL yardımcıları: görselleri sunucuda küçültüp en uygun biçimde (f_auto,q_auto) servis eder.
function cloudImg(url, width) {
  const m = '/upload/';
  const i = String(url).indexOf(m);
  if (i < 0 || !/\/image\/upload\//.test(url) || /\.gif($|\?)/i.test(url)) return url; // GIF'in hareketi bozulmasın
  return url.slice(0, i + m.length) + `f_auto,q_auto,w_${width},c_limit/` + url.slice(i + m.length);
}

// Videonun (kırpılmışsa kırpılan bölümün ilk karesinden) JPEG önizlemesi — paylaşım önizlemesi (OG) için
function videoPoster(url, width = 1200) {
  const m = '/upload/';
  const i = String(url).indexOf(m);
  if (i < 0) return null;
  let rest = url.slice(i + m.length);
  let start = 0;
  const t = rest.match(/^so_(\d+),du_\d+\//);
  if (t) {
    start = Number(t[1]);
    rest = rest.slice(t[0].length);
  }
  rest = rest.replace(/\.[a-z0-9]+$/i, '.jpg');
  return url.slice(0, i + m.length) + `so_${start},f_jpg,w_${width},c_limit/` + rest;
}

module.exports = { cloudImg, videoPoster };
