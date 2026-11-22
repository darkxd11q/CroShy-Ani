// Etiket kuralları: her anıda EN AZ 1, en fazla 5 etiket; "croshy" etiketi kullanılamaz.
const lc = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr');
const BANNED = ['croshy'];
const MAX_TAGS = 5;
const TAG_RE = /^[\p{L}\p{N}_]{2,24}$/u;
const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}_]{2,24})/gu;

const normalizeTag = (t) => lc(t).trim().replace(/^#+/, '');
// "Cro_Shy", "CROSHY" gibi varyasyonlar da yasak
const isBannedTag = (t) => BANNED.includes(normalizeTag(t).replace(/_/g, ''));

function parseHashtags(text) {
  const out = [];
  for (const m of String(text || '').matchAll(HASHTAG_RE)) out.push(m[2].toLowerCase());
  return [...new Set(out)];
}

// tagsInput: dizi ya da "a,b" metni; açıklamadaki #etiketler de birleştirilir.
function collectTags({ tagsInput, caption, required = true }) {
  const raw = Array.isArray(tagsInput) ? tagsInput : typeof tagsInput === 'string' && tagsInput ? tagsInput.split(',') : [];
  const out = [];
  for (const r of raw.slice(0, 20)) {
    const t = normalizeTag(r);
    if (!t) continue;
    if (isBannedTag(t)) return { error: '#croshy etiketi kullanılamaz.' };
    if (!TAG_RE.test(t)) return { error: `"${String(r).slice(0, 24)}" geçerli bir etiket değil (2-24 harf/rakam).` };
    if (!out.includes(t)) out.push(t);
  }
  for (const h of parseHashtags(caption)) {
    if (isBannedTag(h)) return { error: '#croshy etiketi kullanılamaz.' };
    if (!out.includes(h)) out.push(h);
  }
  if (out.length > MAX_TAGS) return { error: `En fazla ${MAX_TAGS} etiket kullanabilirsin.` };
  if (required && out.length < 1) return { error: 'En az 1 etiket seçmelisin.' };
  return { tags: out };
}

module.exports = { collectTags, normalizeTag, isBannedTag, parseHashtags, MAX_TAGS, BANNED };
