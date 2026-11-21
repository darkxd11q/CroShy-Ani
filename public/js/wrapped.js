// Yıl özeti paylaşım kartı: tarayıcıda <canvas> ile 1080x1920 (hikaye boyutu) PNG üretir; sunucuya yük bindirmez.
(function () {
  const dataEl = document.getElementById('wrappedData');
  const btn = document.getElementById('makeCard');
  if (!dataEl || !btn) return;
  const payload = JSON.parse(dataEl.textContent);
  const data = payload.data;
  const W = 1080;
  const H = 1920;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Cloudinary CORS izni verir; olmazsa kart görselsiz çizilir
  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        clearTimeout(t);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(t);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function draw() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1a0b3b');
    bg.addColorStop(0.55, '#4c1d95');
    bg.addColorStop(1, '#0b0a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(920, 240, 330, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(140, 1680, 380, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const text = (t, x, y, size, weight, color, align) => {
      ctx.font = weight + ' ' + size + 'px ' + font;
      ctx.fillStyle = color;
      ctx.textAlign = align || 'left';
      ctx.fillText(String(t), x, y);
    };

    text('CroShy Anı', 80, 150, 54, 700, '#ffffff');
    text(payload.year, W - 80, 150, 54, 700, '#f9a8d4', 'right');
    text('Yıl özetim', 80, 290, 110, 800, '#ffffff');
    text('@' + payload.username, 80, 380, 60, 600, '#c4b5fd');

    const tiles = [
      [data.memories, 'anı paylaştı'],
      [data.likes, 'beğeni aldı'],
      [data.comments, 'yorum aldı'],
      [data.reactions != null ? data.reactions : data.longestStreakWeeks, data.reactions != null ? 'tepki aldı' : 'hafta üst üste'],
    ];
    tiles.forEach((t, i) => {
      const x = 80 + (i % 2) * 460;
      const y = 470 + Math.floor(i / 2) * 250;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, x, y, 440, 220, 36);
      ctx.fill();
      text(t[0], x + 36, y + 125, 100, 800, '#ffffff');
      text(t[1], x + 36, y + 182, 38, 500, '#ddd6fe');
    });

    const img = data.topMemory ? await loadImage(data.topMemory.imageUrl) : null;
    if (img) {
      ctx.save();
      roundRect(ctx, 80, 1010, 920, 520, 40);
      ctx.clip();
      const r = Math.max(920 / img.width, 520 / img.height);
      ctx.drawImage(img, 80 + (920 - img.width * r) / 2, 1010 + (520 - img.height * r) / 2, img.width * r, img.height * r);
      ctx.restore();
      text('🏆 En çok beğenilen anım · ❤️ ' + data.topMemory.likes, 80, 1580, 40, 600, '#ffffff');
    }

    const facts = [];
    if (data.busiestMonth) facts.push('📆 En aktif ayım: ' + data.busiestMonth.name);
    if (data.rank) facts.push('🥇 Toplulukta ilk %' + data.rank.topPercent);
    facts.slice(0, 2).forEach((f, i) => text(f, 80, 1660 + i * 66, 46, 600, '#f5f3ff'));

    text(payload.host || location.host, W / 2, 1860, 40, 600, '#a78bfa', 'center');
    return canvas;
  }

  const out = document.getElementById('cardOut');
  const preview = document.getElementById('cardPreview');
  const shareBtn = document.getElementById('shareCard');
  const dlBtn = document.getElementById('downloadCard');
  let blob = null;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Hazırlanıyor…';
    try {
      const canvas = await draw();
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      preview.src = URL.createObjectURL(blob);
      out.hidden = false;
      const file = new File([blob], 'croshy-yil-ozeti-' + payload.year + '.png', { type: 'image/png' });
      shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      shareBtn.onclick = () => navigator.share({ files: [file], title: 'CroShy Anı ' + payload.year + ' yıl özetim' }).catch(() => {});
      btn.textContent = 'Kartı yeniden oluştur';
    } catch (e) {
      btn.textContent = 'Kart oluşturulamadı — tekrar dene';
    }
    btn.disabled = false;
  });

  dlBtn.addEventListener('click', () => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'croshy-yil-ozeti-' + payload.year + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
})();
