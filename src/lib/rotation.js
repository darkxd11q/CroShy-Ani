// "Beni hatırla" belirteci döndürme (rotation): her otomatik girişte belirteç yenilenir (çalınmaya karşı),
// ama sayfa açılışında AYNI ANDA gelen birkaç istek aynı eski belirteçle gelir. Kısa bir tolerans
// süresinde hepsi AYNI yeni belirteci alır; böylece hiçbiri "giriş yapılmamış" gibi davranmaz.
function pickRotation(map, oldHash, now, graceMs, makeRaw) {
  const hit = map.get(oldHash);
  if (hit && hit.until > now) return { raw: hit.raw, reused: true };
  const raw = makeRaw();
  map.set(oldHash, { raw, until: now + graceMs });
  return { raw, reused: false };
}

function pruneRotations(map, now) {
  for (const [k, v] of map) if (v.until <= now) map.delete(k);
}

module.exports = { pickRotation, pruneRotations };
