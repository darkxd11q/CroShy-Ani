(function () {
  const msg = document.getElementById('listMsg');
  const say = (m) => msg && (msg.textContent = m || '');
  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'İşlem başarısız.');
    return d;
  }

  const form = document.getElementById('newListForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newListName').value.trim();
      if (!name) return;
      try {
        await post('/api/collections', { name });
        location.reload();
      } catch (err) {
        say(err.message);
      }
    });
  }

  const rename = document.getElementById('renameList');
  if (rename) {
    rename.addEventListener('click', async () => {
      const name = prompt('Listenin yeni adı:', rename.dataset.name);
      if (name === null || !name.trim()) return;
      try {
        await post('/api/collections/' + rename.dataset.id + '/rename', { name: name.trim() });
        location.reload();
      } catch (err) {
        say(err.message);
      }
    });
  }
  const del = document.getElementById('deleteList');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Bu liste silinsin mi? (İçindeki anılar silinmez, sadece liste kalkar.)')) return;
      try {
        await post('/api/collections/' + del.dataset.id + '/delete');
        location.href = '/koleksiyonlar';
      } catch (err) {
        say(err.message);
      }
    });
  }
  document.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', async () => {
      const colId = document.querySelector('[data-col]').dataset.col;
      try {
        await post('/api/collections/' + colId + '/items/' + b.dataset.remove + '/remove');
        b.closest('.collection-item').remove();
      } catch (err) {
        say(err.message);
      }
    })
  );
})();
