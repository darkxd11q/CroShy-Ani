(function () {
  const page = document.querySelector('.memory-page');
  if (!page) return;
  const id = page.dataset.id;
  const canInteract = page.dataset.canInteract === '1';
  const loggedIn = page.dataset.loggedIn === '1';

  async function api(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (window.openAuthModal) window.openAuthModal('login');
      else location.href = '/login?next=' + encodeURIComponent(location.pathname);
      throw new Error('Giriş gerekli');
    }
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // Galeriden gelindiyse (#tepkiler) doğrudan tepki + yorum bölümüne kaydır; görsel yüklenince yer kaymasın diye tekrar hizala
  if (location.hash === '#tepkiler') {
    const info = document.getElementById('tepkiler');
    let userMoved = false;
    ['wheel', 'touchmove', 'keydown'].forEach((t) => window.addEventListener(t, () => (userMoved = true), { once: true, passive: true }));
    const align = () => !userMoved && info && info.scrollIntoView({ block: 'start' });
    align();
    const media = document.querySelector('.memory-media img, .memory-media video');
    if (media) {
      media.addEventListener('load', align, { once: true });
      media.addEventListener('loadedmetadata', align, { once: true });
    }
    setTimeout(align, 400);
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

  // ---- Emoji tepkileri: sayısı olanlar çip olarak görünür; "Tepki ver" ile seçici açılır ----
  const chips = document.getElementById('reactChips');
  function paintChips(summary) {
    if (!chips) return;
    chips.textContent = '';
    const order = window.CroshyReact ? window.CroshyReact.EMOJIS : [];
    Object.entries(summary.counts || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
      .forEach(([emoji, n]) => {
        const b = el('button', 'react-chip' + ((summary.mine || []).includes(emoji) ? ' active' : ''));
        b.type = 'button';
        b.dataset.emoji = emoji;
        b.setAttribute('aria-pressed', (summary.mine || []).includes(emoji) ? 'true' : 'false');
        b.append(el('span', null, emoji), el('span', 'react-count', String(n)));
        chips.appendChild(b);
      });
  }
  if (chips) {
    chips.addEventListener('click', async (e) => {
      const b = e.target.closest('.react-chip');
      if (!b) return;
      b.disabled = true;
      try {
        paintChips((await api('/api/memory/' + id + '/react', { emoji: b.dataset.emoji })).summary);
      } catch (err) {
        if (err.message !== 'Giriş gerekli') alert(err.message);
        b.disabled = false;
      }
    });
  }
  const reactOpen = document.getElementById('reactOpen');
  if (reactOpen) reactOpen.addEventListener('click', () => window.CroshyReact && window.CroshyReact.open(reactOpen, id, { onSummary: paintChips }));

  // ---- Kaydet (koleksiyon) ----
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => window.CroshySave && window.CroshySave.open(saveBtn, id, { onChange: ({ saved }) => saveBtn.classList.toggle('saved', saved) }));

  // ---- Profilimde sabitle (vitrin anısı) ----
  const pinBtn = document.getElementById('pinProfileBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', async () => {
      pinBtn.disabled = true;
      const pinned = pinBtn.dataset.pinned === '1';
      try {
        await api(pinned ? '/api/profile/unpin' : '/api/profile/pin', { itemId: id });
        pinBtn.dataset.pinned = pinned ? '0' : '1';
        pinBtn.textContent = pinned ? '📌 Profilimde sabitle' : '📌 Vitrinden kaldır';
      } catch (err) {
        if (err.message !== 'Giriş gerekli') alert(err.message);
      }
      pinBtn.disabled = false;
    });
  }

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

  // ---- Yorumlar: üst yorum + yanıt zinciri + sabitleme ----
  const list = document.getElementById('commentList');
  const countEl = document.getElementById('commentCount');
  const setCount = (delta) => (countEl.textContent = Math.max(0, Number(countEl.textContent) + delta));

  function commentEl(c, isReply) {
    const li = el('li', 'comment' + (isReply ? ' is-reply' : '') + (c.pinnedAt ? ' is-pinned' : ''));
    li.dataset.id = c.id;
    let avatar;
    if (c.avatarUrl) {
      avatar = el('img', 'comment-avatar');
      avatar.src = c.avatarUrl;
      avatar.alt = '';
    } else {
      avatar = el('span', 'comment-avatar fallback', c.username.charAt(0).toUpperCase());
    }
    const main = el('div', 'comment-main');
    if (c.pinnedAt) main.appendChild(el('div', 'comment-pinned-label', '📌 Sabitlenmiş yorum'));

    const head = el('div', 'comment-head');
    const a = el('a', 'comment-author');
    a.href = '/u/' + encodeURIComponent(c.username);
    a.innerHTML = c.nameHtml; // sunucu tarafında kaçışlanmış
    head.appendChild(a);
    if (c.byOwner) head.appendChild(el('span', 'comment-owner-tag', 'anı sahibi'));
    head.appendChild(el('time', null, new Date(c.createdAt).toLocaleString('tr-TR')));
    if (loggedIn && !c.isMine) {
      const r = el('button', 'comment-report', '🚩');
      r.type = 'button';
      r.dataset.reportComment = c.id;
      r.setAttribute('aria-label', 'Yorumu şikayet et');
      head.appendChild(r);
    }
    if (c.canDelete) {
      const del = el('button', 'comment-del', '🗑️');
      del.type = 'button';
      del.dataset.del = c.id;
      del.setAttribute('aria-label', 'Yorumu sil');
      head.appendChild(del);
    }
    const body = el('div', 'comment-body');
    body.innerHTML = c.bodyHtml; // sunucu tarafında kaçışlanmış

    const actions = el('div', 'comment-actions');
    if (canInteract) {
      const rb = el('button', 'comment-act', '↩ Yanıtla');
      rb.type = 'button';
      rb.dataset.reply = c.id;
      rb.dataset.name = c.username;
      actions.appendChild(rb);
    }
    if (c.canPin && !isReply) {
      const pb = el('button', 'comment-act', c.pinnedAt ? '📌 Sabitlemeyi kaldır' : '📌 Sabitle');
      pb.type = 'button';
      pb.dataset.pinComment = c.id;
      pb.dataset.pinned = c.pinnedAt ? '1' : '0';
      actions.appendChild(pb);
    }
    main.append(head, body, actions);
    if (!isReply) {
      const replies = el('ul', 'replies');
      replies.dataset.repliesOf = c.id;
      (c.replies || []).forEach((r) => replies.appendChild(commentEl(r, true)));
      main.appendChild(replies);
    }
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
        list.appendChild(commentEl(d.comment, false));
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

  function closeReplyForms() {
    document.querySelectorAll('.reply-form').forEach((f) => f.remove());
  }
  function openReplyForm(li, target) {
    closeReplyForms();
    const isReplyTarget = li.classList.contains('is-reply');
    const rootLi = isReplyTarget ? li.closest('.comment:not(.is-reply)') : li;
    const f = el('form', 'reply-form');
    const ta = el('textarea');
    ta.maxLength = 300;
    ta.rows = 2;
    ta.setAttribute('aria-label', 'Yanıtın');
    ta.value = isReplyTarget ? '@' + target.name + ' ' : '';
    const row = el('div', 'comment-form-row');
    const msg = el('span', 'fb-status');
    const send = el('button', 'btn primary small', 'Yanıtla');
    send.type = 'submit';
    const cancel = el('button', 'btn ghost small', 'Vazgeç');
    cancel.type = 'button';
    cancel.addEventListener('click', () => f.remove());
    row.append(msg, send, cancel);
    f.append(ta, row);
    li.querySelector('.comment-main').appendChild(f);
    ta.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        const d = await api('/api/memory/' + id + '/comments', { body, parentId: target.id });
        rootLi.querySelector('.replies').appendChild(commentEl(d.comment, true));
        setCount(1);
        f.remove();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'fb-status err';
        send.disabled = false;
      }
    });
  }

  list.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('Bu yorum silinsin mi?')) return;
      try {
        await api('/api/comments/' + del.dataset.del + '/delete');
        const li = del.closest('.comment');
        const removed = li.classList.contains('is-reply') ? 1 : 1 + li.querySelectorAll('.comment').length;
        li.remove();
        setCount(-removed);
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    const reply = e.target.closest('[data-reply]');
    if (reply) return openReplyForm(reply.closest('.comment'), { id: reply.dataset.reply, name: reply.dataset.name });
    const pin = e.target.closest('[data-pin-comment]');
    if (pin) {
      pin.disabled = true;
      try {
        await api('/api/comments/' + pin.dataset.pinComment + '/pin', { pinned: pin.dataset.pinned !== '1' });
        location.reload(); // sabit yorum en üste çıkar
      } catch (err) {
        alert(err.message);
        pin.disabled = false;
      }
    }
  });

  // ---- Şikayet et (anı ya da yorum) ----
  const reportModal = document.getElementById('reportModal');
  if (reportModal) {
    let target = null;
    const status = document.getElementById('reportStatus');
    const send = document.getElementById('reportSend');
    const open = (t) => {
      target = t;
      status.textContent = '';
      status.className = 'fb-status';
      document.getElementById('reportDetails').value = '';
      reportModal.hidden = false;
      document.getElementById('reportReason').focus();
    };
    const close = () => (reportModal.hidden = true);
    const reportBtn = document.getElementById('reportBtn');
    if (reportBtn) reportBtn.addEventListener('click', () => open({ type: 'item' }));
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-report-comment]');
      if (b) open({ type: 'comment', id: b.dataset.reportComment });
    });
    document.getElementById('reportCancel').addEventListener('click', close);
    reportModal.addEventListener('click', (e) => e.target === reportModal && close());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !reportModal.hidden && close());
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        const url = target.type === 'comment' ? '/api/comments/' + target.id + '/report' : '/api/memory/' + id + '/report';
        const d = await api(url, { reason: document.getElementById('reportReason').value, details: document.getElementById('reportDetails').value });
        status.textContent = d.duplicate ? 'Bu içeriği zaten şikayet etmiştin. Teşekkürler.' : 'Şikayetin iletildi. Teşekkürler 🙏';
        status.className = 'fb-status ok';
        setTimeout(close, 1600);
      } catch (err) {
        status.textContent = err.message;
        status.className = 'fb-status err';
      }
      send.disabled = false;
    });
  }
})();
