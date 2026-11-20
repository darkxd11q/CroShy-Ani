(function () {
  const list = document.getElementById('recoveryList');
  if (!list) return;
  const codes = [...list.querySelectorAll('code')].map((c) => c.textContent.trim());
  const text = 'CroShy Anı — kurtarma kodları\n(Her kod yalnızca bir kez çalışır. Güvenli bir yerde sakla.)\n\n' + codes.join('\n') + '\n';

  const copy = document.getElementById('copyCodes');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      copy.textContent = '✅ Kopyalandı';
    } catch {
      copy.textContent = 'Kopyalanamadı — elle seç';
    }
    setTimeout(() => (copy.textContent = '📋 Kopyala'), 2000);
  });

  document.getElementById('downloadCodes').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = 'croshy-kurtarma-kodlari.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // Kaydettim işaretlenmeden "Devam et" etkin olmaz (kodlar bir daha gösterilmeyecek)
  const check = document.getElementById('savedCheck');
  const go = document.getElementById('continueBtn');
  check.addEventListener('change', () => {
    go.style.opacity = check.checked ? '1' : '.45';
    go.style.pointerEvents = check.checked ? 'auto' : 'none';
    go.setAttribute('aria-disabled', check.checked ? 'false' : 'true');
  });
})();
