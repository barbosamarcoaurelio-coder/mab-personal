(()=>{
  'use strict';
  const VERSION='3.0.12';
  // Histórico: esta camada bloqueava observers e listeners de focus que mencionavam
  // enhanceWorkout, para conter a antiga v2.9 que recriava o DOM continuamente.
  // A v2.9 não é mais carregada e o bloqueio impedia a referência "Anterior" de
  // atualizar ao navegar entre exercícios — overrides removidos na 3.0.12.
  const diagnostics={version:VERSION,observerOverride:'removed-3.0.12'};

  // Reforço de usabilidade sem capturar cliques nem reconstruir a interface.
  const style=document.createElement('style');
  style.id='mabStabilityV304Styles';
  style.textContent=`
    .set-row input[data-set]{font-size:16px!important;touch-action:manipulation!important;pointer-events:auto!important;position:relative;z-index:2}
    button[data-action="finish"],button[data-action="next"],button[data-action="prev"],button[data-action="skip-rest"]{touch-action:manipulation;pointer-events:auto;position:relative;z-index:2}
  `;
  document.head.appendChild(style);

  // Evita que uma troca de tela mantenha campo invisível focado, sem interferir
  // durante a digitação. Blur ocorre apenas quando a rota realmente muda.
  window.addEventListener('routechange',()=>{
    const active=document.activeElement;
    if(active?.matches?.('input[data-set]')) active.blur();
  });

  document.documentElement.dataset.mabStability=VERSION;
  window.MABStability304=diagnostics;
})();
