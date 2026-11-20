// "Günlük" haklar Türkiye saatine göre GECE YARISI sıfırlanır (Europe/Istanbul = UTC+3, yaz saati yok).
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfTodayTR(now = Date.now()) {
  return Math.floor((now + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS;
}
function nextMidnightTR(now = Date.now()) {
  return startOfTodayTR(now) + DAY_MS;
}

module.exports = { startOfTodayTR, nextMidnightTR, TR_OFFSET_MS, DAY_MS };
