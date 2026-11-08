/* MAB Personal v2.8.2
   Corrige o card "Próximo treino" sem alterar o banco nem o histórico.
   Regra: A -> B -> C -> D -> A. */
(() => {
  'use strict';

  const NEXT = { A: 'B', B: 'C', C: 'D', D: 'A' };
  let applying = false;

  function nextCodeFromDashboard() {
    const rows = [...document.querySelectorAll('#app .exercise-item')];
    for (const row of rows) {
      const text = row.textContent || '';
      const match = text.match(/Muscula(?:ç|c)[aã]o\s*[·-]\s*Treino\s*([A-D])/i);
      if (match) return NEXT[match[1].toUpperCase()];
    }
    return 'A';
  }

  function applyNextWorkout() {
    if (applying) return;
    applying = true;
    try {
      const label = [...document.querySelectorAll('#app .muted')]
        .find(el => el.textContent.trim().toUpperCase() === 'PRÓXIMO TREINO');
      const card = label?.closest('.card');
      if (!card) return;

      const code = nextCodeFromDashboard();
      const heading = card.querySelector('h2');
      const start = card.querySelector('button[data-action="start"]');

      if (heading) {
        const current = heading.textContent || '';
        const suffix = current.includes('·') ? current.slice(current.indexOf('·')) : '';
        const nextText = `Treino ${code}${suffix ? ` ${suffix}` : ''}`;
        if (current !== nextText) heading.textContent = nextText;
      }
      if (start && start.dataset.group !== code) {
        start.dataset.group = code;
        start.setAttribute('aria-label', `Iniciar Treino ${code}`);
      }
      if (card.dataset.nextWorkout !== code) card.dataset.nextWorkout = code;
      if (document.documentElement.dataset.mabVersion !== '2.8.2') document.documentElement.dataset.mabVersion = '2.8.2';
    } finally {
      applying = false;
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyNextWorkout();
    });
  };

  const observer = new MutationObserver(schedule);
  const startObserver = () => {
    const app = document.querySelector('#app');
    if (!app) return;
    observer.observe(app, { childList: true, subtree: true });
    schedule();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
  window.addEventListener('routechange', schedule);
  window.addEventListener('focus', schedule);
})();
