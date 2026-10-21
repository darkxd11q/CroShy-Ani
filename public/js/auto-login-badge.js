(async function () {
  try {
    const res = await fetch('/api/session-status');
    if (!res.ok) return;
    const data = await res.json();

    if (data.justAutoLoggedIn) {
      // ÖZEL / Plus üyelere özel, daha havalı bir karşılama göstermek için rolü öğren.
      let role = null;
      let name = data.username;
      try {
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
          const me = await meRes.json();
          role = me.premiumRole || null;
          name = me.username || name;
        }
      } catch {
        // admin oturumlarında /api/me 401 döner — sorun değil
      }
      showAutoLoginBadge(role, name);
    }

    if (data.loggedIn && !data.isAdmin) checkAward();
  } catch {
    // sessizce yut, kritik değil
  }
})();

function showAutoLoginBadge(role, name) {
  const badge = document.createElement('div');
  badge.className = 'auto-login-badge' + (role ? ' premium-' + role : '');

  const check = document.createElement('span');
  check.className = 'auto-login-check';
  check.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 12.5l5 5L20 6" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const text = document.createElement('span');
  text.textContent = role
    ? (role === 'special' ? '💜 ' : '💠 ') + 'Otomatik Giriş Yapıldı, ' + name + '!'
    : 'Otomatik Giriş Yapıldı!';

  badge.append(check, text);
  document.body.appendChild(badge);
  requestAnimationFrame(() => badge.classList.add('show'));
  setTimeout(() => {
    badge.classList.remove('show');
    setTimeout(() => badge.remove(), 450);
  }, 3200);
}

// ---------- Haftalık rozet kutlama ekranı ----------
async function checkAward() {
  try {
    const res = await fetch('/api/pending-award');
    if (!res.ok) return;
    const { awards } = await res.json();
    if (!awards || awards.length === 0) return;
    showAwards(awards.slice());
  } catch {
    // sessizce yut
  }
}

function showAwards(queue) {
  const a = queue.shift();
  if (!a) {
    fetch('/api/award-seen', { method: 'POST' }).catch(() => {});
    return;
  }

  const isActive = a.badge === 'weekly_active';
  const overlay = document.createElement('div');
  overlay.className = 'award-overlay ' + (isActive ? 'award-active' : 'award-liked');

  const confetti = document.createElement('div');
  confetti.className = 'confetti';
  const colors = isActive
    ? ['#22d3ee', '#a78bfa', '#f0abfc', '#ffffff', '#5eead4']
    : ['#ec4899', '#f472b6', '#fbbf24', '#ffffff', '#a78bfa'];
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 1.6 + 's';
    s.style.animationDuration = 2.6 + Math.random() * 2.4 + 's';
    s.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    confetti.appendChild(s);
  }

  const card = document.createElement('div');
  card.className = 'award-card';

  const mk = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  const trophy = mk('div', 'award-trophy', a.icon || '🏅');
  const kicker = mk('div', 'award-kicker', 'Haftanın Ödülü');
  const title = mk('h2', 'award-title');
  const shimmer = mk('span', 'reveal-shimmer', a.label);
  title.append(shimmer, document.createTextNode(' rozetini kazandın!'));
  const sub = mk(
    'p',
    'award-sub',
    isActive
      ? 'Geçen Cumadan bu yana en çok anı paylaşan sen oldun. İnanılmaz bir hafta geçirdin!'
      : 'Geçen Cumadan bu yana paylaştığın anılar en çok beğeniyi topladı. Herkes seni sevdi!'
  );

  const stats = mk('div', 'award-stats');
  const s1 = mk('div', 'award-stat');
  s1.style.animationDelay = '1.1s';
  s1.append(mk('strong', null, String(a.submissions)), mk('span', null, 'anı paylaştın'));
  const s2 = mk('div', 'award-stat');
  s2.style.animationDelay = '1.3s';
  s2.append(mk('strong', null, String(a.likes)), mk('span', null, 'beğeni aldın'));
  stats.append(s1, s2);

  const until = new Date(a.themeExpiresAt).toLocaleDateString('tr-TR');
  const reward = mk('div', 'award-reward');
  const rw = mk('div');
  rw.innerHTML = '🎨 <strong>Ödülün:</strong> 2 özel tema — <strong>Aurora</strong> ve <strong>Kraliyet</strong>. ';
  rw.append(document.createTextNode(until + ' tarihine kadar (15 gün) profilinden kullanabilirsin.'));
  reward.append(rw);

  const actions = mk('div', 'reveal-actions');
  actions.style.animationDelay = '1.7s';
  const go = mk('a', 'btn primary', '🎨 Temaları Dene');
  go.href = '/profile';
  const next = mk('button', 'btn', queue.length ? 'Sıradaki ➜' : 'Devam Et');
  next.type = 'button';
  actions.append(go, next);

  card.append(trophy, kicker, title, sub, stats, reward, actions);
  overlay.append(confetti, card);
  document.body.appendChild(overlay);

  const finish = () => {
    overlay.style.transition = 'opacity .4s ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      showAwards(queue);
    }, 400);
  };
  next.addEventListener('click', finish);
  go.addEventListener('click', () => fetch('/api/award-seen', { method: 'POST', keepalive: true }).catch(() => {}));
}
