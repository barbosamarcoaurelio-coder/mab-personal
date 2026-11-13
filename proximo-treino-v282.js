/* MAB Personal v2.8.2 / v4.3.1
   Sugere o próximo treino de musculação respeitando os treinos cadastrados no Plano.
   Regra cíclica: A -> B -> C -> D -> E -> F -> G -> A ...
   Avança até encontrar o próximo treino que de fato possui exercícios no plano ativo.
   Considera apenas treinos de musculação, sem ser afetado por outras modalidades (TRX, Pilates, etc). */
(() => {
  'use strict';

  const ALL_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let applying = false;

  function getPlannedGroupsFromDB() {
    return new Promise((resolve) => {
      try {
        if (window.repo && typeof window.repo.all === 'function') {
          Promise.all([window.repo.all('cycles'), window.repo.all('planItems')]).then(([cycles, items]) => {
            const activeCycle = (cycles || []).find(c => c.status === 'active');
            if (!activeCycle) return resolve(null);
            const groups = new Set((items || []).filter(i => i.cycleId === activeCycle.id && i.active).map(i => String(i.groupCode || '').toUpperCase()));
            resolve(groups);
          }).catch(() => resolve(null));
          return;
        }
        const req = indexedDB.open('mab_personal_db', 2);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('cycles') || !db.objectStoreNames.contains('planItems')) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction(['cycles', 'planItems'], 'readonly');
          const reqCycles = tx.objectStore('cycles').getAll();
          const reqItems = tx.objectStore('planItems').getAll();
          tx.oncomplete = () => {
            const cycles = reqCycles.result || [];
            const items = reqItems.result || [];
            db.close();
            const activeCycle = cycles.find(c => c.status === 'active');
            if (!activeCycle) return resolve(null);
            const groups = new Set(items.filter(i => i.cycleId === activeCycle.id && i.active).map(i => String(i.groupCode || '').toUpperCase()));
            resolve(groups);
          };
          tx.onerror = () => { db.close(); resolve(null); };
        };
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function getLastMusculacaoGroup() {
    const rows = [...document.querySelectorAll('#app .exercise-item')];
    for (const row of rows) {
      const text = row.textContent || '';
      const match = text.match(/Muscula(?:ç|c)[aã]o\s*[·-]\s*Treino\s*([A-G])/i);
      if (match) return match[1].toUpperCase();
    }
    return null;
  }

  async function resolveNextWorkoutCode() {
    const lastGroup = getLastMusculacaoGroup();
    const plannedGroups = await getPlannedGroupsFromDB();

    if (plannedGroups && plannedGroups.size > 0) {
      if (lastGroup && ALL_GROUPS.includes(lastGroup)) {
        const idx = ALL_GROUPS.indexOf(lastGroup);
        for (let i = 1; i <= ALL_GROUPS.length; i++) {
          const candidate = ALL_GROUPS[(idx + i) % ALL_GROUPS.length];
          if (plannedGroups.has(candidate)) {
            return candidate;
          }
        }
      }
      return ALL_GROUPS.find(g => plannedGroups.has(g)) || 'A';
    }

    const NEXT = { A: 'B', B: 'C', C: 'D', D: 'E', E: 'F', F: 'G', G: 'A' };
    return lastGroup ? (NEXT[lastGroup] || 'A') : 'A';
  }

  async function applyNextWorkout() {
    if (applying) return;
    applying = true;
    try {
      const label = [...document.querySelectorAll('#app .muted')]
        .find(el => el.textContent.trim().toUpperCase() === 'PRÓXIMO TREINO');
      const card = label?.closest('.card');
      if (!card) return;

      const code = await resolveNextWorkoutCode();
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
      if (document.documentElement.dataset.mabVersion !== '4.3.1') document.documentElement.dataset.mabVersion = '4.3.1';
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
      applyNextWorkout().catch(() => {});
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
