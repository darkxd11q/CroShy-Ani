document.querySelectorAll('.social-dropdown').forEach((dropdown) => {
  const trigger = dropdown.querySelector('.social-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !dropdown.classList.contains('open');

    // Aynı anda başka açık menü kalmasın
    document.querySelectorAll('.social-dropdown.open').forEach((d) => {
      if (d !== dropdown) {
        d.classList.remove('open');
        d.querySelector('.social-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });

    dropdown.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });
});

// Dışarı tıklayınca tüm açık menüleri kapat
document.addEventListener('click', (e) => {
  document.querySelectorAll('.social-dropdown.open').forEach((dropdown) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      dropdown.querySelector('.social-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
});

// Esc ile kapat
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.social-dropdown.open').forEach((dropdown) => {
      dropdown.classList.remove('open');
      dropdown.querySelector('.social-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }
});
