(()=>{
  'use strict';
  const VERSION='4.3.1';
  const SOUND_KEY='mab-rest-sound-enabled';
  const soundEnabled=()=>localStorage.getItem(SOUND_KEY)!=='false';
  let audioCtx=null,lastRestEnded=false,lastRestSec=null,beepAudio=null;

  function setAudioSession(){
    if('audioSession' in navigator){
      try{
        if(navigator.audioSession.type!=='transient'){
          navigator.audioSession.type='transient';
        }
      }catch(_){
        try{navigator.audioSession.type='ambient'}catch(__){}
      }
    }
  }

  function getBeepAudio(){
    if(beepAudio)return beepAudio;
    try{
      const sampleRate=22050,totalDur=1.8,numSamples=Math.floor(sampleRate*totalDur);
      const buffer=new Int16Array(numSamples);
      const offsets=[0,0.72,1.44],beepDur=0.28,freq=1046;
      for(const off of offsets){
        const startS=Math.floor(off*sampleRate);
        const endS=Math.min(numSamples,Math.floor((off+beepDur)*sampleRate));
        for(let i=startS;i<endS;i++){
          const t=(i-startS)/sampleRate;
          const phase=(freq*t)%1;
          const tri=phase<0.5?(4*phase-1):(3-4*phase);
          let env=1;
          if(t<0.015)env=t/0.015;
          else env=Math.max(0,1-(t-0.015)/(beepDur-0.015));
          buffer[i]=Math.round(tri*env*24000);
        }
      }
      const wav=new ArrayBuffer(44+numSamples*2);
      const v=new DataView(wav);
      const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
      str(0,'RIFF');v.setUint32(4,36+numSamples*2,true);str(8,'WAVE');str(12,'fmt ');
      v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
      v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
      v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,numSamples*2,true);
      new Uint8Array(wav,44).set(new Uint8Array(buffer.buffer));
      const blob=new Blob([wav],{type:'audio/wav'});
      beepAudio=new Audio(URL.createObjectURL(blob));
      beepAudio.preload='auto';
      return beepAudio;
    }catch(_){
      return null;
    }
  }

  function ensureAudio(){
    if(!soundEnabled())return null;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return null;
      if(!audioCtx||audioCtx.state==='closed')audioCtx=new Ctx();
      if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});
      return audioCtx;
    }catch(_){
      return null;
    }
  }

  function playWebAudioBeep(){
    const ctx=ensureAudio();
    if(!ctx)return false;
    try{
      if(ctx.state!=='running')ctx.resume().catch(()=>{});
      const start=ctx.currentTime+0.03;
      [0,0.72,1.44].forEach(offset=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='triangle';
        osc.frequency.value=1046;
        gain.gain.setValueAtTime(0.0001,start+offset);
        gain.gain.exponentialRampToValueAtTime(0.85,start+offset+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start+offset);
        osc.stop(start+offset+0.30);
      });
      return true;
    }catch(_){
      return false;
    }
  }

  function softBeep(){
    if(!soundEnabled())return;
    setAudioSession();
    if(window.MABRelease)window.MABRelease.lastBeepAt=new Date().toISOString();
    if(navigator.vibrate)try{navigator.vibrate([150,80,150])}catch(_){}

    const audio=getBeepAudio();
    let played=false;
    if(audio){
      try{
        audio.currentTime=0;
        const p=audio.play();
        if(p&&typeof p.then==='function'){
          p.then(()=>{played=true}).catch(()=>{playWebAudioBeep()});
        }else{
          played=true;
        }
      }catch(_){
        playWebAudioBeep();
      }
    }else{
      playWebAudioBeep();
    }

    if(audioCtx&&audioCtx.state==='running'&&!played){
      playWebAudioBeep();
    }
  }

  function unlockAudio(){
    setAudioSession();
    const c=ensureAudio();
    if(c&&c.state!=='running')c.resume().catch(()=>{});
    const a=getBeepAudio();
    if(a&&a.paused&&a.readyState===0)a.load();
  }

  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('touchstart',unlockAudio,{passive:true});
  document.addEventListener('click',unlockAudio,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)unlockAudio()});
  setAudioSession();

  function timerSeconds(text){const m=String(text||'').trim().match(/^(\d+):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
  setInterval(()=>{
    const timer=document.querySelector('#restTimer');
    if(!timer){
      if(lastRestSec!=null&&lastRestSec<=2&&!lastRestEnded){lastRestEnded=true;softBeep()}
      lastRestSec=null;lastRestEnded=false;
      return;
    }
    setAudioSession();
    if(audioCtx&&audioCtx.state==='suspended'){audioCtx.resume().catch(()=>{})}
    const sec=timerSeconds(timer.textContent);
    if(sec===null)return;
    if(sec>0){lastRestSec=sec;lastRestEnded=false;return}
    if(sec===0&&!lastRestEnded){lastRestEnded=true;softBeep()}
  },250);
  function aboutHtml(){return `<div class="stack mab-about-panel"><div class="row"><div><div class="muted">SOBRE</div><h2>MAB Training</h2></div><button type="button" class="ghost" data-mab-about-close>✕</button></div><div class="mab-about-version"><strong>Versão ${VERSION}</strong><span>TREINO · ATIVIDADE · EVOLUÇÃO</span></div><div class="card mab-about-card"><h3>Novidades da versão ${VERSION}</h3><ul><li><strong>Rodízio inteligente do Próximo Treino:</strong> Verifica automaticamente os treinos A a G que possuem exercícios cadastrados no Plano ativo, girando em ciclo contínuo sem sugerir treinos vazios e preservando o tipo de atividade (Musculação x TRX/Pilates).</li><li><strong>Bip com fone e música (Spotify):</strong> Integração com AudioSession transient para sobrepor o som de músicas em segundo plano com redução suave (ducking) e retorno automático da música ao finalizar o descanso.</li><li><strong>Treinos A a G completos:</strong> Suporte estendido para até 7 treinos na semana com navegação rápida e sem overflow no mobile.</li></ul></div></div>`}
  function decorateSettings(){const content=document.querySelector('#modalContent');if(!content||!content.querySelector('#exportBtn')||content.querySelector('#mabSoundToggle'))return;const stack=content.querySelector('.stack'),anchor=content.querySelector('#exportBtn'),section=document.createElement('div');section.className='mab-settings-extra';section.innerHTML=`<div class="muted mab-settings-title">AVISOS DO TREINO</div><label class="mab-toggle-row"><span>Som ao terminar descanso</span><input id="mabSoundToggle" type="checkbox" ${soundEnabled()?'checked':''}></label><div class="muted" style="font-size:11px;margin:2px 0 8px">O bip sobrepõe e reduz suavemente o som do app de música (Spotify, Apple Music, etc.) e toca no fone ou alto-falante. No iPhone, deixe a chave lateral de silêncio desativada.</div><button type="button" class="ghost" id="mabTestSound">Testar som</button><button type="button" class="secondary" id="mabAboutBtn">Sobre o MAB Training · v${VERSION}</button>`;stack.insertBefore(section,anchor);section.querySelector('#mabSoundToggle').addEventListener('change',e=>{localStorage.setItem(SOUND_KEY,e.target.checked?'true':'false');if(e.target.checked)ensureAudio()});section.querySelector('#mabTestSound').addEventListener('click',softBeep);section.querySelector('#mabAboutBtn').addEventListener('click',()=>{content.innerHTML=aboutHtml();content.querySelector('[data-mab-about-close]')?.addEventListener('click',()=>document.querySelector('#modal')?.close())})}
  document.querySelector('#settingsBtn')?.addEventListener('click',()=>setTimeout(decorateSettings,25));
  const modal=document.querySelector('#modal');if(modal)new MutationObserver(()=>{if(modal.open)decorateSettings()}).observe(modal,{subtree:true,childList:true});
  window.MABRelease={version:VERSION,testRestSound:softBeep};
})();
