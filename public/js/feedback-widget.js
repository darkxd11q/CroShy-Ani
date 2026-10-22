// Sağ alt köşedeki geri bildirim düğmesi + küçük form.
(function () {
  if (document.getElementById('fbFab')) return;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'fbFab';
  fab.className = 'fb-fab';
  fab.innerHTML = '<span class="fb-fab-icon">💬</span><span class="fb-fab-text">Geri Bildirim</span>';

  const panel = document.createElement('div');
  panel.className = 'fb-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="fb-head"><strong>Geri Bildirim</strong><button type="button" class="fb-x" aria-label="Kapat">✕</button></div>' +
    '<p class="fb-sub">Sitenin gelişmesi için fikrini, önerini ya da karşılaştığın bir sorunu yaz.</p>' +
    '<textarea class="fb-text" maxlength="600" placeholder="Ne düşünüyorsun?"></textarea>' +
    '<div class="fb-row"><span class="fb-count">0/600</span><button type="button" class="btn primary small fb-send">Gönder</button></div>' +
    '<div class="fb-status" role="status"></div>';

  document.body.append(panel, fab);

  const text = panel.querySelector('.fb-text');
  const count = panel.querySelector('.fb-count');
  const send = panel.querySelector('.fb-send');
  const status = panel.querySelector('.fb-status');

  const setStatus = (msg, type) => {
    status.textContent = msg || '';
    status.className = 'fb-status' + (type ? ' ' + type : '');
  };
  const toggle = (open) => {
    panel.hidden = !open;
    if (open) setTimeout(() => text.focus(), 50);
  };

  fab.addEventListener('click', () => toggle(panel.hidden));
  panel.querySelector('.fb-x').addEventListener('click', () => toggle(false));
  text.addEventListener('input', () => (count.textContent = text.value.length + '/600'));

  send.addEventListener('click', async () => {
    const message = text.value.trim();
    if (message.length < 5) return setStatus('Biraz daha ayrıntı yazar mısın? (en az 5 karakter)', 'err');
    send.disabled = true;
    setStatus('Gönderiliyor…');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus('Geri bildirim göndermek için giriş yapmalısın.', 'err');
        toggle(false);
        if (window.openAuthModal) window.openAuthModal('login');
        else location.href = '/login?next=' + encodeURIComponent(location.pathname);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Gönderilemedi.');
      text.value = '';
      count.textContent = '0/600';
      setStatus('Teşekkürler! Geri bildirimin bize ulaştı 💜', 'ok');
      setTimeout(() => toggle(false), 1800);
    } catch (err) {
      setStatus(err.message, 'err');
    } finally {
      send.disabled = false;
    }
  });
})();
