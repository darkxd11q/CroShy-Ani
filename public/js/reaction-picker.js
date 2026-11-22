// Emoji tepki seçici: bir tuşa basınca açılır, emoji seçilince gönderilir.
(function () {
  // Sunucudaki social.EMOJIS ile AYNI sırada olmalı (testle doğrulanır)
  const EMOJIS = ['😂', '😮', '😢', '🔥', '👏', '🎉', '😍', '🥹', '😡', '🤯', '💀', '👀', '🙌', '💯', '🤝', '🥳'];
  let pop = null;

  // Kartta gösterilen "en çok verilen 2 tepki"
  const top2 = (counts) =>
    Object.entries(counts || {})
      .filter(([, n]) => n > 0)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count || EMOJIS.indexOf(a.emoji) - EMOJIS.indexOf(b.emoji))
      .slice(0, 2);

  function onDoc(e) {
    if (pop && !pop.contains(e.target) && !e.target.closest('.react-open, #reactOpen')) close();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    if (pop) pop.remove();
    pop = null;
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey);
  }

  async function open(anchor, itemId, { onSummary } = {}) {
    close();
    pop = document.createElement('div');
    pop.className = 'react-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Tepki seç');
    const grid = document.createElement('div');
    grid.className = 'react-pop-grid';
    EMOJIS.forEach((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'react-pick';
      b.dataset.emoji = emoji;
      b.setAttribute('aria-label', emoji + ' tepkisi ver');
      b.textContent = emoji;
      grid.appendChild(b);
    });
    pop.appendChild(grid);
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    const w = 252;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = r.top > 150 ? Math.max(8, r.top - 8 - 118) + 'px' : r.bottom + 8 + 'px';

    // daha önce verdiğim tepkileri işaretle
    fetch('/api/memory/' + encodeURIComponent(itemId) + '/reactions')
      .then((res) => res.json())
      .then((s) => (s.mine || []).forEach((e) => { const b = grid.querySelector('[data-emoji="' + e + '"]'); if (b) b.classList.add('active'); }))
      .catch(() => {});

    grid.addEventListener('click', async (e) => {
      const b = e.target.closest('.react-pick');
      if (!b) return;
      b.disabled = true;
      try {
        const res = await fetch('/api/memory/' + encodeURIComponent(itemId) + '/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji: b.dataset.emoji }) });
        if (res.status === 401) {
          close();
          if (window.openAuthModal) window.openAuthModal('login');
          return;
        }
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Tepki gönderilemedi.');
        if (onSummary) onSummary(d.summary);
        close();
      } catch (err) {
        b.disabled = false;
        alert(err.message);
      }
    });
    setTimeout(() => {
      document.addEventListener('click', onDoc, true);
      document.addEventListener('keydown', onKey);
    }, 0);
  }

  window.CroshyReact = { open, close, EMOJIS, top2 };
})();
