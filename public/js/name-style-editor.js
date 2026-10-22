(function () {
  const root = document.getElementById('nameStyleEditor');
  if (!root) return;

  const name = root.dataset.name || '';
  const chars = [...name];
  let style = null;
  try {
    style = JSON.parse(root.dataset.style || 'null');
  } catch {}

  const PRESETS = {
    sunrise: 'linear-gradient(90deg,#f97316,#ec4899,#a855f7)',
    ocean: 'linear-gradient(90deg,#22d3ee,#3b82f6,#8b5cf6)',
    mint: 'linear-gradient(90deg,#34d399,#a3e635,#fde047)',
  };
  const HEX = /^#[0-9a-fA-F]{6}$/;

  let mode = style && style.type ? style.type : 'none';
  let presetId = style && style.type === 'preset' ? style.id : null;
  const colors = chars.map((_, i) =>
    style && style.type === 'letters' && HEX.test((style.colors || [])[i] || '') ? style.colors[i] : '#ffffff'
  );

  const preview = document.getElementById('namePreview');
  const lettersBox = document.getElementById('nameLetters');
  const saveBtn = document.getElementById('nameStyleSave');
  const statusEl = document.getElementById('nameStyleStatus');

  function renderPreview() {
    preview.textContent = '';
    if (mode === 'preset' && PRESETS[presetId]) {
      const sp = document.createElement('span');
      sp.className = 'name-grad';
      sp.style.backgroundImage = PRESETS[presetId];
      sp.textContent = name;
      preview.appendChild(sp);
    } else if (mode === 'letters') {
      chars.forEach((ch, i) => {
        const sp = document.createElement('span');
        sp.style.color = colors[i];
        sp.textContent = ch;
        preview.appendChild(sp);
      });
    } else {
      preview.textContent = name;
    }
    root.querySelectorAll('.name-preset').forEach((b) => {
      const id = b.dataset.preset;
      b.classList.toggle('active', (mode === 'preset' && id === presetId) || (mode === 'none' && id === 'none'));
    });
  }

  chars.forEach((ch, i) => {
    const wrap = document.createElement('label');
    wrap.className = 'name-letter';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colors[i];
    input.addEventListener('input', () => {
      colors[i] = input.value;
      mode = 'letters';
      presetId = null;
      renderPreview();
    });
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? '␣' : ch;
    wrap.append(input, span);
    lettersBox.appendChild(wrap);
  });

  root.querySelectorAll('.name-preset').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.preset === 'none') {
        mode = 'none';
        presetId = null;
      } else {
        mode = 'preset';
        presetId = b.dataset.preset;
      }
      renderPreview();
    });
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    statusEl.textContent = 'Kaydediliyor…';
    statusEl.className = 'avatar-status';
    try {
      const body = mode === 'preset' ? { type: 'preset', id: presetId } : mode === 'letters' ? { type: 'letters', colors } : { type: 'none' };
      const res = await fetch('/api/profile/name-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi.');
      statusEl.textContent = 'Kaydedildi ✨';
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'avatar-status err';
      saveBtn.disabled = false;
    }
  });

  renderPreview();
})();
