(function () {
  function focusFirst(card) {
    var f = card.querySelector('.auth-form[data-form="' + card.dataset.tab + '"] input[type="text"]');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function initAuthCards(root) {
    (root || document).querySelectorAll('.auth-card').forEach(function (card) {
      if (card.dataset.ready) return;
      card.dataset.ready = '1';
      card.querySelectorAll('.auth-tabs button').forEach(function (b) {
        b.addEventListener('click', function () { card.dataset.tab = b.dataset.tab; focusFirst(card); });
      });
      card.querySelectorAll('[data-go]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); card.dataset.tab = a.dataset.go; focusFirst(card); });
      });
      focusFirst(card);
    });
  }
  window.initAuthCards = initAuthCards;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAuthCards(); });
  else initAuthCards();
})();
