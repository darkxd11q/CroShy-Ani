(function () {
  const page = document.querySelector('.memory-page');
  if (!page) return;
  const id = page.dataset.id;
  const canInteract = page.dataset.canInteract === '1';

  async function api(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (window.openAuthModal) window.openAuthModal('login');
      else location.href = '/login?next=' + encodeURIComponent(location.pathname);
      throw new Error('Giriş gerekli');
    }
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }

  // ---- Beğeni ----
  const likeBtn = document.getElementById('memoryLike');
  if (likeBtn) {
    likeBtn.addEventListener('click', async () => {
      likeBtn.disabled = true;
      try {
        const d = await api('/api/like/' + id);
        likeBtn.classList.toggle('liked', d.liked);
        likeBtn.setAttribute('aria-pressed', d.liked ? 'true' : 'false');
        likeBtn.querySelector('.heart').textContent = d.liked ? '❤️' : '🤍';
        document.getElementById('likeCount').textContent = d.count;
      } catch {}
      likeBtn.disabled = false;
    });
  }

  // ---- Emoji tepkileri ----
  document.querySelectorAll('.react-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const d = await api('/api/memory/' + id + '/react', { emoji: btn.dataset.emoji });
        document.querySelectorAll('.react-btn').forEach((b) => {
          const e = b.dataset.emoji;
          b.querySelector('.react-count').textContent = d.summary.counts[e] || 0;
          const on = d.summary.mine.includes(e);
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      } catch (e) {
        if (e.message !== 'Giriş gerekli') alert(e.message);
      }
      btn.disabled = false;
    });
  });

  // ---- Paylaş ----
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = shareBtn.dataset.url;
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else {
          await navigator.clipboard.writeText(url);
          shareBtn.textContent = '✅ Bağlantı kopyalandı';
          setTimeout(() => (shareBtn.textContent = '🔗 Paylaş'), 2000);
        }
      } catch {}
    });
  }

  // ---- Yorumlar ----
  const list = document.getElementById('commentList');
  const countEl = document.getElementById('commentCount');
  const setCount = (delta) => (countEl.textContent = Math.max(0, Number(countEl.textContent) + delta));

  function commentEl(c) {
    const li = document.createElement('li');
    li.className = 'comment';
    li.dataset.id = c.id;

    let avatar;
    if (c.avatarUrl) {
      avatar = document.createElement('img');
      avatar.className = 'comment-avatar';
      avatar.src = c.avatarUrl;
      avatar.alt = '';
    } else {
      avatar = document.createElement('span');
      avatar.className = 'comment-avatar fallback';
      avatar.textContent = c.username.charAt(0).toUpperCase();
    }

    const main = document.createElement('div');
    main.className = 'comment-main';
    const head = document.createElement('div');
    head.className = 'comment-head';
    const a = document.createElement('a');
    a.className = 'comment-author';
    a.href = '/u/' + encodeURIComponent(c.username);
    a.innerHTML = c.nameHtml; // sunucu tarafında kaçışlanmış
    const t = document.createElement('time');
    t.textContent = new Date(c.createdAt).toLocaleString('tr-TR');
    head.append(a, t);
    if (c.canDelete) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'comment-del';
      del.dataset.del = c.id;
      del.setAttribute('aria-label', 'Yorumu sil');
      del.textContent = '🗑️';
      head.append(del);
    }
    const body = document.createElement('div');
    body.className = 'comment-body';
    body.innerHTML = c.bodyHtml; // sunucu tarafında kaçışlanmış
    main.append(head, body);
    li.append(avatar, main);
    return li;
  }

  const form = document.getElementById('commentForm');
  if (form && canInteract) {
    const ta = document.getElementById('commentBody');
    const chars = document.getElementById('commentChars');
    const status = document.getElementById('commentStatus');
    ta.addEventListener('input', () => (chars.textContent = ta.value.length + '/300'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      form.querySelector('button[type=submit]').disabled = true;
      status.textContent = '';
      try {
        const d = await api('/api/memory/' + id + '/comments', { body });
        const none = document.getElementById('noComments');
        if (none) none.remove();
        list.appendChild(commentEl(d.comment));
        setCount(1);
        ta.value = '';
        chars.textContent = '0/300';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'fb-status err';
      }
      form.querySelector('button[type=submit]').disabled = false;
    });
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    if (!confirm('Bu yorum silinsin mi?')) return;
    try {
      await api('/api/comments/' + btn.dataset.del + '/delete');
      btn.closest('.comment').remove();
      setCount(-1);
    } catch (err) {
      alert(err.message);
    }
  });
})();
