const CACHE = 'mab-personal-v2-7';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./styles.css','./db.js','./repositories.js','./router.js','./timer-service.js','./backup-service.js','./validators.js','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
const PATCH = `
/* MAB Personal v2.7 - Integridade do historico */
async function deleteWorkoutSessionV27(sessionId){
  const sets=(await repo.all('executedSets')).filter(x=>x.sessionId===sessionId);
  const timers=(await repo.all('restTimers')).filter(x=>x.sessionId===sessionId);
  for(const x of sets) await repo.remove('executedSets',x.id);
  for(const x of timers) await repo.remove('restTimers',x.id);
  await repo.remove('workoutSessions',sessionId);
}
async function manageWorkoutSessionV27(sessionId){
  const ss=await repo.get('workoutSessions',sessionId); if(!ss)return;
  const dur=elapsed(ss.startedAt,ss.finishedAt);
  modalContent.innerHTML=\`<div class="stack"><div class="row"><h2>Treino \${ss.groupCode||''}</h2><button type="button" class="ghost" data-close>✕</button></div><div class="card"><span class="muted">\${(ss.startedAt||'').slice(0,10)}</span><div class="timer">\${fmt(dur)}</div>\${dur<60?'<p class="orange"><strong>Treino com menos de 1 minuto.</strong><br>Pode ter sido iniciado ou finalizado por engano.</p>':''}</div><button class="danger" id="deleteSessionV27">Excluir este treino do histórico</button><p class="muted">A exclusão remove esta sessão e as séries associadas. O Plano A/B/C/D e a Biblioteca de exercícios não serão alterados.</p></div>\`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick=()=>modal.close();
  modalContent.querySelector('#deleteSessionV27').onclick=async()=>{
    if(!confirm('Excluir definitivamente este treino e as séries associadas?'))return;
    await deleteWorkoutSessionV27(sessionId); modal.close(); showToast('Treino excluído do histórico'); render();
  };
}
async function decorateHistoryV27(){
  if(route()!=='dashboard')return;
  const sessions=(await repo.all('workoutSessions')).filter(x=>x.status==='completed').sort((a,b)=>(b.startedAt||'').localeCompare(a.startedAt||''));
  const heading=[...document.querySelectorAll('h3')].find(x=>x.textContent.trim()==='Atividades recentes');
  const card=heading?.closest('.card'); if(!card)return;
  const rows=[...card.querySelectorAll('.exercise-item')].filter(r=>r.querySelector('strong')?.textContent.startsWith('Musculação'));
  let si=0;
  for(const row of rows){const ss=sessions[si++]; if(!ss)continue; const dur=elapsed(ss.startedAt,ss.finishedAt); const old=row.querySelector('.orange'); if(old)old.remove(); let btn=row.querySelector('[data-action="manage-session-v27"]'); if(!btn){btn=document.createElement('button');btn.className='ghost';btn.dataset.action='manage-session-v27';row.appendChild(btn)} btn.dataset.id=ss.id;btn.textContent=dur<60?'Revisar':'Detalhes';}
}
const renderV26=render;
render=async function(){await renderV26();await decorateHistoryV27();};
document.addEventListener('click',async ev=>{
  const b=ev.target.closest('button'); if(!b)return;
  if(b.dataset.action==='manage-session-v27'){ev.preventDefault();ev.stopImmediatePropagation();await manageWorkoutSessionV27(b.dataset.id);return;}
  if(b.dataset.action==='finish'){
    const ss=(await openSessions())[0]; if(!ss)return;
    const sec=elapsed(ss.startedAt);
    if(sec<60){
      const save=confirm(\`Este treino tem apenas \${sec} segundo(s).\\n\\nOK = salvar mesmo assim\\nCancelar = revisar antes de gravar\`);
      if(save)return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const discard=confirm('O treino parece ter sido iniciado por engano.\\n\\nOK = descartar treino\\nCancelar = continuar treinando');
      if(discard){await deleteWorkoutSessionV27(ss.id);if(typeof releaseScreenWakeLock==='function')await releaseScreenWakeLock();navigate('dashboard');showToast('Treino curto descartado');}
      return;
    }
  }
},true);
await decorateHistoryV27();
`;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('/app.js')){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const net=await fetch(e.request,{cache:'no-store'});const body=await net.text();const patched=new Response(body+'\n'+PATCH,{headers:{'Content-Type':'text/javascript; charset=utf-8'}});await cache.put(e.request,patched.clone());return patched;}catch(err){return (await cache.match(e.request))||new Response('/* app.js indisponível offline */',{headers:{'Content-Type':'text/javascript'}});}
    })()); return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match('./index.html'))));
});
