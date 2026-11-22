// Yorum zinciri: tek seviye yanıt (üst yorum -> yanıtları). Sabitlenen yorum en üstte.
function buildThread(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, replies: [] }]));
  const roots = [];
  for (const r of byId.values()) {
    if (!r.parentId) roots.push(r);
    else if (byId.has(r.parentId)) byId.get(r.parentId).replies.push(r);
    // ebeveyni silinmiş yetim yanıt gösterilmez
  }
  roots.sort((a, b) => (b.pinnedAt ? 1 : 0) - (a.pinnedAt ? 1 : 0) || a.createdAt - b.createdAt);
  roots.forEach((r) => r.replies.sort((a, b) => a.createdAt - b.createdAt));
  return roots;
}
const countThread = (roots) => roots.reduce((n, r) => n + 1 + r.replies.length, 0);

module.exports = { buildThread, countThread };
