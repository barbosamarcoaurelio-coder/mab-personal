(()=>{
  'use strict';
  const VERSION='4.3.0';
  const SOUND_KEY='mab-rest-sound-enabled';
  const soundEnabled=()=>localStorage.getItem(SOUND_KEY)!=='false';
  let audioCtx=null,lastRestEnded=false,lastRestSec=null;
  function ensureAudio(){if(!soundEnabled())return null;try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;if(!audioCtx||audioCtx.state==='closed')audioCtx=new Ctx();if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});return audioCtx}catch(_){return null}}
  function softBeep(){if(!soundEnabled())return;const ctx=ensureAudio();if(!ctx)return;if(window.MABRelease)window.MABRelease.lastBeepAt=new Date().toISOString();if(navigator.vibrate)try{navigator.vibrate([150,80,150])}catch(_){}
    if(ctx.state!=='running')ctx.resume().catch(()=>{});
    const start=ctx.currentTime+.05;[0,.72,1.44].forEach(offset=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.value=1046;gain.gain.setValueAtTime(.0001,start+offset);gain.gain.exponentialRampToValueAtTime(.22,start+offset+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+offset+.3);osc.connect(gain);gain.connect(ctx.destination);osc.start(start+offset);osc.stop(start+offset+.32)})}
  document.addEventListener('pointerdown',()=>{const c=ensureAudio();if(c&&c.state!=='running')c.resume().catch(()=>{})},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){const c=ensureAudio();if(c&&c.state!=='running')c.resume().catch(()=>{})}});
  if('audioSession' in navigator){try{navigator.audioSession.type='ambient'}catch(_){}}
  function timerSeconds(text){const m=String(text||'').trim().match(/^(\d+):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
  setInterval(()=>{
    const timer=document.querySelector('#restTimer');
    if(!timer){
      if(lastRestSec!=null&&lastRestSec<=2&&!lastRestEnded){lastRestEnded=true;softBeep()}
      lastRestSec=null;lastRestEnded=false;
      return
    }
    const sec=timerSeconds(timer.textContent);
    if(sec===null)return;
    if(sec>0){lastRestSec=sec;lastRestEnded=false;return}
    if(sec===0&&!lastRestEnded){lastRestEnded=true;softBeep()}
  },250);
  function aboutHtml(){return `<div class="stack mab-about-panel"><div class="row"><div><div class="muted">SOBRE</div><h2>MAB Training</h2></div><button type="button" class="ghost" data-mab-about-close>✕</button></div><div class="mab-about-version"><strong>Versão ${VERSION}</strong><span>TREINO · ATIVIDADE · EVOLUÇÃO</span></div><div class="card mab-about-card"><h3>Principais novidades da versão ${VERSION}</h3><ul><li><strong>Vídeo de execução na biblioteca:</strong> Acesso direto a vídeos do YouTube na lista de exercícios via botão elegante "▶ Execução".</li><li><strong>Grupos musculares por toque:</strong> Seleção ágil por chips tanto para o grupo principal (seleção única) quanto para os secundários (sinergistas).</li><li><strong>Cadastro de novos grupos musculares:</strong> Opção "+ Novo grupo" direto no cadastro para criar grupos personalizados como Adutores, Trapézio, Antebraço, etc.</li><li><strong>Treinos completos do Personal (A, B, C e D):</strong> Importação e exportação em JSON padronizado, preservando 100% do histórico e cargas do aluno.</li></ul></div></div>`}
  function decorateSettings(){const content=document.querySelector('#modalContent');if(!content||!content.querySelector('#exportBtn')||content.querySelector('#mabSoundToggle'))return;const stack=content.querySelector('.stack'),anchor=content.querySelector('#exportBtn'),section=document.createElement('div');section.className='mab-settings-extra';section.innerHTML=`<div class="muted mab-settings-title">AVISOS DO TREINO</div><label class="mab-toggle-row"><span>Som ao terminar descanso</span><input id="mabSoundToggle" type="checkbox" ${soundEnabled()?'checked':''}></label><div class="muted" style="font-size:11px;margin:2px 0 8px">O bip toca junto com a música, sem pausá-la. No iPhone, deixe a chave lateral de silêncio desativada para ouvi-lo.</div><button type="button" class="ghost" id="mabTestSound">Testar som</button><button type="button" class="secondary" id="mabAboutBtn">Sobre o MAB Training · v${VERSION}</button>`;stack.insertBefore(section,anchor);section.querySelector('#mabSoundToggle').addEventListener('change',e=>{localStorage.setItem(SOUND_KEY,e.target.checked?'true':'false');if(e.target.checked)ensureAudio()});section.querySelector('#mabTestSound').addEventListener('click',softBeep);section.querySelector('#mabAboutBtn').addEventListener('click',()=>{content.innerHTML=aboutHtml();content.querySelector('[data-mab-about-close]')?.addEventListener('click',()=>document.querySelector('#modal')?.close())})}
  document.querySelector('#settingsBtn')?.addEventListener('click',()=>setTimeout(decorateSettings,25));
  const modal=document.querySelector('#modal');if(modal)new MutationObserver(()=>{if(modal.open)decorateSettings()}).observe(modal,{subtree:true,childList:true});
  window.MABRelease={version:VERSION,testRestSound:softBeep};
})();
