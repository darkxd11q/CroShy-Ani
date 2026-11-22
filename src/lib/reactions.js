// Bir anının en çok verilen N emojisi (beraberlikte emoji listesindeki sıra).
function topReactions(counts, n = 2, order = []) {
  return Object.entries(counts || {})
    .filter(([, c]) => c > 0)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.emoji) - order.indexOf(b.emoji))
    .slice(0, n);
}

module.exports = { topReactions };
