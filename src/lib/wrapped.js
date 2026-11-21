// Kişisel yıl özeti: tüm hesaplar saf fonksiyon (Türkiye saatine göre), test edilebilir.
const TR_OFFSET = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const tr = (ms) => new Date(ms + TR_OFFSET);
const trYear = (ms) => tr(ms).getUTCFullYear();
const trMonth = (ms) => tr(ms).getUTCMonth();
// Hafta numarası (Pazartesi başlar): 1970-01-01 Perşembe olduğu için +3 kaydırılır
const weekIndex = (ms) => Math.floor((Math.floor((ms + TR_OFFSET) / DAY) + 3) / 7);

function longestRun(sortedUnique) {
  let best = 0;
  let cur = 0;
  let prev = null;
  for (const n of sortedUnique) {
    cur = prev !== null && n === prev + 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
    prev = n;
  }
  return best;
}

// items: ONAYLI anılar (herkesin), userId: özetin sahibi
function buildWrapped({ items, userId, year, awards = [], reactionsReceived = null, now = Date.now() }) {
  const inYear = items.filter((i) => trYear(i.createdAt) === year);
  const mine = inYear.filter((i) => i.userId === userId);

  const out = {
    year,
    empty: mine.length === 0,
    memories: mine.length,
    photos: mine.filter((i) => i.type !== 'video').length,
    videos: mine.filter((i) => i.type === 'video').length,
    likes: mine.reduce((s, i) => s + (i.likes || 0), 0),
    comments: mine.reduce((s, i) => s + (i.commentCount || 0), 0),
    reactions: reactionsReceived,
    topMemory: null,
    busiestMonth: null,
    months: new Array(12).fill(0),
    longestStreakWeeks: 0,
    topTags: [],
    rank: null,
    firstMemoryAt: null,
    weeklyActive: 0,
    weeklyLiked: 0,
    monthNames: MONTHS,
  };

  for (const a of awards) {
    const ts = Number(a.awarded_at || a.week_end || a.created_at || a.ts || 0);
    const okYear = ts > 0 ? trYear(ts) === year : year === trYear(now);
    if (!okYear) continue;
    if (a.badge === 'weekly_active') out.weeklyActive += 1;
    if (a.badge === 'weekly_liked') out.weeklyLiked += 1;
  }
  if (out.empty) return out;

  const top = [...mine].sort((a, b) => (b.likes || 0) - (a.likes || 0) || a.createdAt - b.createdAt)[0];
  out.topMemory = { id: top.id, url: top.url, type: top.type, caption: top.caption || '', likes: top.likes || 0 };

  for (const i of mine) out.months[trMonth(i.createdAt)] += 1;
  const maxCount = Math.max(...out.months);
  const idx = out.months.indexOf(maxCount);
  out.busiestMonth = { index: idx, name: MONTHS[idx], count: maxCount };

  out.longestStreakWeeks = longestRun([...new Set(mine.map((i) => weekIndex(i.createdAt)))].sort((a, b) => a - b));
  out.firstMemoryAt = Math.min(...mine.map((i) => i.createdAt));

  const tagCounts = new Map();
  for (const i of mine) for (const t of i.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  out.topTags = [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 3);

  // Toplulukta sıra: o yıl en az 1 anısı olan kişiler arasında (anı sayısına göre)
  const perUser = new Map();
  for (const i of inYear) if (i.userId) perUser.set(i.userId, (perUser.get(i.userId) || 0) + 1);
  const total = perUser.size;
  if (total >= 5) {
    const rank = 1 + [...perUser.values()].filter((c) => c > mine.length).length;
    out.rank = { rank, total, topPercent: Math.max(1, Math.ceil((rank / total) * 100)) };
  }
  return out;
}

module.exports = { buildWrapped, trYear, trMonth, weekIndex, longestRun, MONTHS };
