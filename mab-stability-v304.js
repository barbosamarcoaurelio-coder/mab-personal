(()=>{
  'use strict';
  const VERSION='3.0.4';
  const NativeMutationObserver=window.MutationObserver;
  const nativeWindowAdd=window.addEventListener.bind(window);
  const diagnostics={version:VERSION,blockedObservers:0,blockedFocusHandlers:0};

  // Protege inputs no Safari: a antiga camada v2.9 recriava o DOM do treino
  // continuamente através de um observer ligado a enhanceWorkout().
  function StableMutationObserver(callback){
    const source=Function.prototype.toString.call(callback);
    if(source.includes('enhanceWorkout')){
      diagnostics.blockedObservers++;
      return {observe(){},disconnect(){},takeRecords(){return[]}};
    }
    return new NativeMutationObserver(callback);
  }
  StableMutationObserver.prototype=NativeMutationObserver.prototype;
  window.MutationObserver=StableMutationObserver;

  // No iOS, abrir/fechar teclado pode emitir focus na janela. A camada antiga
  // usava esse evento para remontar a tela e fazia REPS/KG/RIR perderem o cursor.
  window.addEventListener=function(type,listener,options){
    const source=typeof listener==='function'?Function.prototype.toString.call(listener):'';
    if(type==='focus' && source.includes('enhanceWorkout')){
      diagnostics.blockedFocusHandlers++;
      return;
    }
    return nativeWindowAdd(type,listener,options);
  };

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
