// Anı / kişi / etiket araması ve trend etiketler (bellekteki onaylı anı önbelleği üzerinde çalışır).
const lc = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr');
const { isBannedTag } = require('./tags');

function tokensOf(q) {
  return lc(q).trim().replace(/\s+/g, ' ').slice(0, 60).split(' ').filter(Boolean).slice(0, 5);
}
const bare = (t) => t.replace(/^#/, '');

function scoreItem(item, tokens) {
  const caption = lc(item.caption);
  const who = lc(item.uploaderName);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  let total = 0;
  for (const tk of tokens) {
    const isTag = tk.startsWith('#');
    const t = bare(tk);
    if (!t) return 0;
    let s = 0;
    if (tags.includes(t)) s += 5;
    else if (tags.some((x) => x.startsWith(t))) s += 3;
    if (!isTag) {
      if (who === t) s += 6;
      else if (who.includes(t)) s += 4;
      if (caption.includes(t)) s += 2;
    }
    if (s === 0) return 0; // her kelime bir yerde eşleşmeli (VE)
    total += s;
  }
  return total;
}

function searchItems(items, q, { limit = 20, offset = 0 } = {}) {
  const tokens = tokensOf(q);
  if (!tokens.length || tokens.join('').replace(/#/g, '').length < 2) return { total: 0, items: [] };
  const scored = [];
  for (const it of items) {
    const s = scoreItem(it, tokens);
    if (s > 0) scored.push([s, it]);
  }
  scored.sort((a, b) => b[0] - a[0] || (b[1].likes || 0) - (a[1].likes || 0) || b[1].createdAt - a[1].createdAt);
  return { total: scored.length, items: scored.slice(offset, offset + limit).map((x) => x[1]) };
}

// Yalnızca en az bir ONAYLI anısı olan kişiler (zaten herkese açık) listelenir
function searchUsers(items, q, limit = 5) {
  const t = tokensOf(q)[0];
  if (!t || t.startsWith('#') || t.length < 2) return [];
  const byUser = new Map();
  for (const it of items) {
    if (!lc(it.uploaderName).includes(t)) continue;
    const e = byUser.get(it.uploaderName) || { username: it.uploaderName, avatar: null, count: 0 };
    e.count += 1;
    if (it.uploaderAvatar) e.avatar = it.uploaderAvatar;
    byUser.set(it.uploaderName, e);
  }
  return [...byUser.values()]
    .sort((a, b) => (lc(b.username) === t) - (lc(a.username) === t) || b.count - a.count || a.username.localeCompare(b.username))
    .slice(0, limit);
}

function searchTags(items, q, limit = 8) {
  const t = bare(tokensOf(q)[0] || '');
  if (!t || t.length < 2) return [];
  const counts = new Map();
  for (const it of items) for (const tag of it.tags || []) if (tag.includes(t)) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.tag.startsWith(t) - a.tag.startsWith(t)) || b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

// Son 7 günde kullanılan etiketler 3 puan, 30 gün içindekiler 1 puan; hiç yeni etiket yoksa tüm zamanlar
function trendingTags(items, now = Date.now(), { limit = 20 } = {}) {
  const DAY = 24 * 60 * 60 * 1000;
  const stats = new Map();
  for (const it of items) {
    const age = now - it.createdAt;
    for (const tag of it.tags || []) {
      if (isBannedTag(tag)) continue;
      const s = stats.get(tag) || { tag, count: 0, recent: 0, score: 0 };
      s.count += 1;
      if (age <= 30 * DAY) {
        s.recent += 1;
        s.score += age <= 7 * DAY ? 3 : 1;
      }
      stats.set(tag, s);
    }
  }
  let list = [...stats.values()];
  const recent = list.filter((s) => s.recent > 0);
  if (recent.length > 0) list = recent.sort((a, b) => b.score - a.score || b.count - a.count || a.tag.localeCompare(b.tag));
  else list.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return list.slice(0, limit).map(({ tag, count, recent: r }) => ({ tag, count, recent: r }));
}

// "Sık kullanılan etiketler": GERÇEK kullanım verisinden — en çok farklı kişinin kullandığı etiketler (croshy hariç).
// Hiç etiket kullanılmadıysa boş döner (uydurma öneri yok).
function popularTags(items, limit = 12) {
  const stats = new Map();
  for (const it of items) {
    for (const tag of it.tags || []) {
      if (isBannedTag(tag)) continue;
      const s = stats.get(tag) || { tag, users: new Set(), count: 0 };
      s.count += 1;
      s.users.add(it.userId || it.uploaderName);
      stats.set(tag, s);
    }
  }
  return [...stats.values()]
    .map((s) => ({ tag: s.tag, users: s.users.size, count: s.count }))
    .sort((a, b) => b.users - a.users || b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

module.exports = { tokensOf, scoreItem, searchItems, searchUsers, searchTags, trendingTags, popularTags };
