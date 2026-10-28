// Açıklama/yorum metinleri: HTML kaçışı + #etiket ve @kullanıcı bağlantıları.
// Her zaman ÖNCE kaçış yapılır, sonra bağlantı eklenir (XSS'e karşı).
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_]{2,24})/gu;
const MENTION_RE = /(^|[\s(])@([\p{L}\p{N}_.\-]{3,10})/gu;

function unique(list, max) {
  return [...new Set(list)].slice(0, max);
}

// "#anı #komik" -> ['anı', 'komik']
function extractTags(text, max = 5) {
  const out = [];
  for (const m of String(text || '').matchAll(TAG_RE)) out.push(m[2].toLowerCase());
  return unique(out, max);
}

// "@ayse selam" -> ['ayse']  (sondaki nokta/tire kullanıcı adına dahil edilmez)
function extractMentions(text, max = 5) {
  const out = [];
  for (const m of String(text || '').matchAll(MENTION_RE)) out.push(m[2].replace(/[.\-]+$/, ''));
  return unique(out.filter((n) => n.length >= 3), max);
}

function renderRich(text) {
  return escapeHtml(text)
    .replace(TAG_RE, (all, pre, tag) => `${pre}<a class="tag-link" href="/?tag=${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`)
    .replace(MENTION_RE, (all, pre, name) => {
      const clean = name.replace(/[.\-]+$/, '');
      const tail = name.slice(clean.length);
      return `${pre}<a class="mention-link" href="/u/${encodeURIComponent(clean)}">@${clean}</a>${tail}`;
    })
    .replace(/\n/g, '<br>');
}

module.exports = { escapeHtml, extractTags, extractMentions, renderRich };
