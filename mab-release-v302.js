(()=>{
  'use strict';
  const VERSION='3.0.3';
  const SOUND_KEY='mab-rest-sound-enabled';
  const soundEnabled=()=>localStorage.getItem(SOUND_KEY)!=='false';
  let audioCtx=null;
  let lastRestEnded=false;

  function ensureAudio(){
    if(!soundEnabled()) return null;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx) return null;
      audioCtx ||= new Ctx();
      if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
      return audioCtx;
    }catch(_){ return null; }
  }

  function softBeep(){
    const ctx=ensureAudio();
    if(!ctx || !soundEnabled()) return;
    const start=ctx.currentTime+0.02;
    [0,0.72,1.44].forEach((offset)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='sine'; osc.frequency.value=740;
      gain.gain.setValueAtTime(0.0001,start+offset);
      gain.gain.exponentialRampToValueAtTime(0.055,start+offset+0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+0.24);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start+offset); osc.stop(start+offset+0.26);
    });
  }

  // iOS/Safari requires audio to be unlocked by a user gesture first.
  document.addEventListener('pointerdown',ensureAudio,{passive:true});
  document.addEventListener('click',ensureAudio,{passive:true});

  function timerSeconds(text){
    const m=String(text||'').trim().match(/^(\d+):(\d{2})$/);
    return m ? Number(m[1])*60+Number(m[2]) : null;
  }

  function observeRest(){
    const timer=document.querySelector('#restTimer');
    if(!timer){ lastRestEnded=false; return; }
    const sec=timerSeconds(timer.textContent);
    if(sec===0 && !lastRestEnded){ lastRestEnded=true; softBeep(); }
    else if(sec!==null && sec>0){ lastRestEnded=false; }
  }

  const restObserver=new MutationObserver(observeRest);
  restObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

  function aboutHtml(){
    return `<div class="stack mab-about-panel">
      <div class="row"><div><div class="muted">SOBRE</div><h2>MAB Training</h2></div><button type="button" class="ghost" data-mab-about-close>✕</button></div>
      <div class="mab-about-version"><strong>Versão ${VERSION}</strong><span>TREINO · ATIVIDADE · EVOLUÇÃO</span></div>
      <div class="card mab-about-card"><h3>Novidades desta versão</h3>
        <ul><li>Aviso sonoro suave ao finalizar o descanso.</li><li>Controle para ativar ou desativar o aviso sonoro.</li><li>Nova área Sobre com versão e principais evoluções.</li></ul>
      </div>
      <div class="card mab-about-card"><h3>Principais evoluções</h3>
        <p><strong>v3.0.1</strong><br>Identidade MAB Training, logo, ícone e splash screen.</p>
        <p><strong>v2.11.0</strong><br>Navegação flexível, exercícios pendentes/parciais/concluídos e avanço automático.</p>
        <p><strong>v2.10.x</strong><br>Resumo pós-treino, calorias, fonte, observações e edição das avaliações corporais.</p>
        <p><strong>v2.9.x</strong><br>Hoje × Anterior, próximo exercício e vídeo de execução.</p>
      </div>
    </div>`;
  }

  function decorateSettings(){
    const content=document.querySelector('#modalContent');
    if(!content || !content.querySelector('#exportBtn') || content.querySelector('#mabSoundToggle')) return;
    const stack=content.querySelector('.stack');
    const anchor=content.querySelector('#exportBtn');
    const section=document.createElement('div');
    section.className='mab-settings-extra';
    section.innerHTML=`<div class="muted mab-settings-title">AVISOS DO TREINO</div>
      <label class="mab-toggle-row"><span>Som ao terminar descanso</span><input id="mabSoundToggle" type="checkbox" ${soundEnabled()?'checked':''}></label>
      <button type="button" class="ghost" id="mabTestSound">Testar som</button>
      <button type="button" class="secondary" id="mabAboutBtn">Sobre o MAB Training · v${VERSION}</button>`;
    stack.insertBefore(section,anchor);
    section.querySelector('#mabSoundToggle').addEventListener('change',e=>{
      localStorage.setItem(SOUND_KEY,e.target.checked?'true':'false');
      if(e.target.checked) ensureAudio();
    });
    section.querySelector('#mabTestSound').addEventListener('click',()=>softBeep());
    section.querySelector('#mabAboutBtn').addEventListener('click',()=>{
      content.innerHTML=aboutHtml();
      content.querySelector('[data-mab-about-close]')?.addEventListener('click',()=>document.querySelector('#modal')?.close());
    });
  }

  document.querySelector('#settingsBtn')?.addEventListener('click',()=>setTimeout(decorateSettings,25));
  const settingsObserver=new MutationObserver(()=>{ if(document.querySelector('#modal')?.open) decorateSettings(); });
  const modal=document.querySelector('#modal');
  if(modal) settingsObserver.observe(modal,{subtree:true,childList:true});

  window.MABRelease={version:VERSION,testRestSound:softBeep};
})();
