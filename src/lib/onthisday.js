// "Geçen yıl bugün": aynı gün-ay, önceki yıllardan onaylı anılar (Türkiye saatine göre).
const TR_OFFSET = 3 * 60 * 60 * 1000;

function trDate(ms) {
  const d = new Date(ms + TR_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

function onThisDay(items, now = Date.now(), { perGroup = 12, maxYears = 10 } = {}) {
  const t = trDate(now);
  const groups = new Map();
  for (const it of items) {
    const c = trDate(it.createdAt);
    if (c.m !== t.m || c.d !== t.d || c.y >= t.y || t.y - c.y > maxYears) continue;
    const yearsAgo = t.y - c.y;
    if (!groups.has(yearsAgo)) groups.set(yearsAgo, []);
    groups.get(yearsAgo).push(it);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([yearsAgo, list]) => ({
      yearsAgo,
      year: t.y - yearsAgo,
      items: list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || a.createdAt - b.createdAt).slice(0, perGroup),
    }));
}

module.exports = { onThisDay, trDate };
