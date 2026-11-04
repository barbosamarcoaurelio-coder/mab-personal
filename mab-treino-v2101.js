import { repo } from './repositories.js';
const VERSION = '2.10.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWorkoutContext(){const sessions=await repo.all('workoutSessions');const current=sessions.find(s=>s.status==='in_progress');if(!current)return null;const items=(await repo.all('planItems')).filter(x=>x.cycleId===current.cycleId&&x.groupCode===current.groupCode&&x.active).sort((a,b)=>a.order-b.order);const exercises=await repo.all('exercises');const index=Math.min(current.currentIndex||0,Math.max(items.length-1,0));const item=items[index];if(!item)return{current,items,exercises,index,item:null};return{current,items,exercises,index,item};}
async function getPreviousSeries(context){const{current,item}=context;if(!item)return[];const sessions=(await repo.all('workoutSessions')).filter(s=>s.status==='completed'&&s.id!==current.id&&s.groupCode===current.groupCode).sort((a,b)=>(b.finishedAt||b.startedAt||'').localeCompare(a.finishedAt||a.startedAt||''));const sets=await repo.all('executedSets');for(const session of sessions){const match=sets.filter(s=>s.sessionId===session.id&&s.exerciseId===item.exerciseId&&s.completed).sort((a,b)=>a.setNumber-b.setNumber);if(match.length)return match;}return[];}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function insertVideoLink(context){const ex=context.exercises.find(e=>e.id===context.item.exerciseId);document.querySelector('#mabExerciseVideo')?.remove();if(!ex?.videoUrl)return;const h2=[...document.querySelectorAll('h2')].find(x=>x.textContent.trim()===ex.name);if(!h2)return;const a=document.createElement('a');a.id='mabExerciseVideo';a.href=ex.videoUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='▶ Ver execução';a.style.cssText='display:inline-flex;margin-top:8px;color:#ff851b;font-weight:700;text-decoration:none;font-size:16px;';h2.insertAdjacentElement('afterend',a);}
function ensureInfoArea(nextButton){let area=document.querySelector('#mabNextExerciseInfo');if(!area){area=document.createElement('div');area.id='mabNextExerciseInfo';area.className='mab-next-exercise';nextButton.parentElement?.insertBefore(area,nextButton);}return area;}
function ensureV293Styles(){if(document.querySelector('#mabV293Styles'))return;const style=document.createElement('style');style.id='mabV293Styles';style.textContent=`
.set-row{display:grid!important;grid-template-columns:72px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 108px;column-gap:10px;row-gap:8px;align-items:end}
.set-row>strong{grid-column:1;grid-row:1;align-self:center}
.set-row>label:nth-of-type(1){grid-column:2;grid-row:1}
.set-row>label:nth-of-type(2){grid-column:3;grid-row:1}
.set-row>label:nth-of-type(3){grid-column:4;grid-row:1}
.set-row>.done{grid-column:5;grid-row:1;align-self:end}
.mab-previous-row{grid-column:1/-1;display:grid;grid-template-columns:72px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 108px;column-gap:10px;align-items:center;padding:2px 0 8px;color:#aaa;font-size:14px}
.mab-previous-row .mab-label{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.mab-previous-row .mab-value{text-align:center;font-weight:700;color:#d0d0d0}
@media(max-width:540px){.set-row,.mab-previous-row{grid-template-columns:64px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 72px;column-gap:8px}.set-row input{width:100%;min-width:0}.set-row>.done{width:72px;min-width:72px}.mab-previous-row{font-size:13px}}
`;document.head.appendChild(style);}
async function enhanceWorkout(){if(!document.querySelector('[data-action="save-set"]'))return;ensureV293Styles();const context=await getWorkoutContext();if(!context?.item)return;const{items,exercises,index}=context;insertVideoLink(context);const previous=await getPreviousSeries(context);const savedCurrent=(await repo.all('executedSets')).filter(s=>s.sessionId===context.current.id&&s.exerciseId===context.item.exerciseId);document.querySelectorAll('.set-row').forEach((row,rowIndex)=>{const seriesNumber=rowIndex+1;const alreadySaved=savedCurrent.some(s=>s.setNumber===seriesNumber&&s.completed);const prior=previous.find(s=>s.setNumber===seriesNumber);const kg=row.querySelector('[data-set="weight"]');const reps=row.querySelector('[data-set="reps"]');const rir=row.querySelector('[data-set="rir"]');[kg,reps,rir].forEach(input=>{if(input)input.style.fontSize='16px';});row.querySelector('.mab-load-reference')?.remove();row.querySelector('.mab-previous-row')?.remove();if(prior){const ref=document.createElement('div');ref.className='mab-previous-row';ref.setAttribute('aria-label',`Execução anterior da série ${seriesNumber}`);ref.innerHTML=`<span class="mab-label">Anterior</span><span class="mab-value">${escapeHtml(prior.reps??'-')}</span><span class="mab-value">${escapeHtml(prior.weight??'-')}</span><span class="mab-value">${escapeHtml(prior.rir??'-')}</span><span></span>`;row.appendChild(ref);}if(alreadySaved)row.classList.add('mab-series-saved');else row.classList.remove('mab-series-saved');});const nextButton=document.querySelector('[data-action="next"]');if(!nextButton)return;const isLast=index>=items.length-1;const info=ensureInfoArea(nextButton);if(isLast){nextButton.hidden=true;info.hidden=true;info.innerHTML='';}else{nextButton.hidden=false;info.hidden=false;const nextItem=items[index+1];const nextExercise=exercises.find(e=>e.id===nextItem?.exerciseId);nextButton.disabled=false;nextButton.textContent='Próximo →';nextButton.removeAttribute('aria-disabled');info.innerHTML=`<span class="muted">A seguir</span><strong>${escapeHtml(nextExercise?.name||'Próximo exercício')}</strong>`;}}
function restoreViewport(){const active=document.activeElement;if(active&&typeof active.blur==='function')active.blur();document.body.style.zoom='1';document.documentElement.style.zoom='1';window.scrollTo({top:Math.max(0,window.scrollY-1),behavior:'smooth'});}
document.addEventListener('click',async event=>{const save=event.target.closest('[data-action="save-set"]');if(!save)return;await sleep(120);restoreViewport();await sleep(180);await enhanceWorkout();},true);
const observer=new MutationObserver(()=>{clearTimeout(window.__mabV293Timer);window.__mabV293Timer=setTimeout(()=>enhanceWorkout().catch(console.error),60);});observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});window.addEventListener('routechange',()=>setTimeout(()=>enhanceWorkout().catch(console.error),80));window.addEventListener('focus',()=>setTimeout(()=>enhanceWorkout().catch(console.error),80));document.documentElement.dataset.mabVersion=VERSION;setTimeout(()=>enhanceWorkout().catch(console.error),100);


const SHORT_WORKOUT_SECONDS=300;
async function deleteWorkoutSession(session){
  const sets=(await repo.all('executedSets')).filter(x=>x.sessionId===session.id);
  for(const set of sets)await repo.remove('executedSets',set.id);
  const timers=(await repo.all('restTimers')).filter(x=>x.sessionId===session.id);
  for(const timer of timers)await repo.remove('restTimers',timer.id);
  await repo.remove('workoutSessions',session.id);
}
function sessionSeconds(session){
  const start=Date.parse(session.startedAt||'');
  const end=Date.parse(session.finishedAt||new Date().toISOString());
  return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.floor((end-start)/1000)):0;
}
async function handleShortWorkoutFinish(event){
  const button=event.target.closest('[data-action="finish"]');
  if(!button)return;
  const session=(await repo.all('workoutSessions')).find(x=>x.status==='in_progress');
  if(!session||sessionSeconds(session)>=SHORT_WORKOUT_SECONDS)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  const seconds=sessionSeconds(session);
  const keep=confirm(`Este treino teve apenas ${fmtShort(seconds)}. Deseja manter o registro?\n\nOK = manter\nCancelar = apagar o treino iniciado por engano`);
  if(keep){
    session.status='completed';session.finishedAt=new Date().toISOString();
    await repo.put('workoutSessions',session);
  }else{
    await deleteWorkoutSession(session);
  }
  document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();
}
function fmtShort(total){const m=Math.floor(total/60),s=total%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
async function enhanceShortWorkoutHistory(){
  if(!document.querySelector('.dashboard-layout'))return;
  const sessions=(await repo.all('workoutSessions')).filter(x=>x.status==='completed'&&sessionSeconds(x)<SHORT_WORKOUT_SECONDS).sort((a,b)=>(b.startedAt||'').localeCompare(a.startedAt||''));
  const rows=[...document.querySelectorAll('.dashboard-layout .exercise-item')];
  for(const row of rows){
    if(row.querySelector('.mab-delete-short'))continue;
    const title=row.querySelector('strong')?.textContent||'';
    const detail=row.querySelector('.muted')?.textContent||'';
    const group=(title.match(/Treino\s+([A-D])/i)||[])[1];
    const date=(detail.match(/\d{4}-\d{2}-\d{2}/)||[])[0];
    const duration=(detail.match(/(\d{2}):(\d{2})/)||[]);
    if(!group||!date||!duration)continue;
    const seconds=Number(duration[1])*60+Number(duration[2]);
    if(seconds>=SHORT_WORKOUT_SECONDS)continue;
    const session=sessions.find(x=>x.groupCode===group.toUpperCase()&&(x.startedAt||'').slice(0,10)===date&&Math.abs(sessionSeconds(x)-seconds)<=1);
    if(!session)continue;
    row.querySelector('.orange')?.remove();
    const button=document.createElement('button');
    button.className='ghost mab-delete-short';button.textContent='Apagar';button.dataset.sessionId=session.id;
    button.setAttribute('aria-label',`Apagar Treino ${group} de ${date}`);
    row.appendChild(button);
  }
}
// v2.10.1: listener antigo desativado; finalizacao e tratada pelo resumo pos-treino
// document.addEventListener('click',handleShortWorkoutFinish,true);
document.addEventListener('click',async event=>{
  const button=event.target.closest('.mab-delete-short');if(!button)return;
  event.preventDefault();event.stopPropagation();
  const session=await repo.get('workoutSessions',button.dataset.sessionId);if(!session)return;
  if(!confirm(`Apagar definitivamente este Treino ${session.groupCode} de ${fmtShort(sessionSeconds(session))}?`))return;
  await deleteWorkoutSession(session);
  button.closest('.exercise-item')?.remove();
  window.dispatchEvent(new Event('routechange'));
},true);
const shortHistoryObserver=new MutationObserver(()=>{clearTimeout(window.__mabShortHistoryTimer);window.__mabShortHistoryTimer=setTimeout(()=>enhanceShortWorkoutHistory().catch(console.error),100);});
shortHistoryObserver.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
setTimeout(()=>enhanceShortWorkoutHistory().catch(console.error),150);

// v2.10.0 - fechamento inteligente, perfil e calorias editaveis
const MAB_V2100='2.10.1';
const PROFILE_KEY='mab-physical-profile-v2100';
const FINISH_PATCH='mab-finish-v2100';
function loadPhysicalProfile(){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')}catch{return {}}}
function savePhysicalProfile(p){localStorage.setItem(PROFILE_KEY,JSON.stringify(p))}
async function currentWeight(){const rows=(await repo.all('bodyAssessments')).filter(x=>x.weight!=null&&x.date).sort((a,b)=>b.date.localeCompare(a.date));return Number(rows[0]?.weight)||null}
function workoutMET(){return 5.0}
function estimateCalories(weight,seconds){if(!weight||!seconds)return null;return Math.round(workoutMET()*weight*(seconds/3600))}
function closeSummaryModal(){document.querySelector('#mabFinishOverlay')?.remove()}
async function saveWorkoutSummary(session){const caloriesEl=document.querySelector('#mabFinishCalories');const sourceEl=document.querySelector('#mabFinishSource');const notesEl=document.querySelector('#mabFinishNotes');const estimated=Number(document.querySelector('#mabEstimatedCalories')?.dataset.value)||null;session.estimatedCalories=estimated;session.calories=caloriesEl?.value?Number(caloriesEl.value):null;session.calorieSource=sourceEl?.value||'Estimativa MAB';session.calorieMethod='MET 5.0 x peso x duracao';session.notes=(notesEl?.value||'').trim();session.status='completed';session.finishedAt=session.finishedAt||new Date().toISOString();await repo.put('workoutSessions',session);closeSummaryModal();document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();}
async function openWorkoutSummary(session){if(document.querySelector('#mabFinishOverlay'))return;session.finishedAt=session.finishedAt||new Date().toISOString();const weight=await currentWeight();const seconds=sessionSeconds(session);const estimated=estimateCalories(weight,seconds);const overlay=document.createElement('div');overlay.id='mabFinishOverlay';overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';overlay.innerHTML=`<div style="width:min(620px,100%);max-height:90vh;overflow:auto;background:#151515;border:1px solid #3a3a3a;border-radius:22px;padding:20px;color:#fff;box-sizing:border-box"><div style="color:#ff851b;font-size:13px;font-weight:800;letter-spacing:.08em">TREINO CONCLUÍDO</div><h2 style="margin:6px 0 4px">Treino ${escapeHtml(session.groupCode||'')}</h2><div style="color:#aaa;margin-bottom:18px">Duração: ${fmtShort(seconds)}${weight?` · Peso de referência: ${weight} kg`:''}</div><div style="background:#0d0d0d;border:1px solid #333;border-radius:16px;padding:16px;margin-bottom:14px"><div style="color:#aaa;font-size:13px">Estimativa MAB</div><strong id="mabEstimatedCalories" data-value="${estimated||''}" style="display:block;font-size:28px;color:#ff851b;margin:4px 0">${estimated?`≈ ${estimated} kcal`:'Sem peso atual para estimar'}</strong><small style="color:#888">Estimativa inicial por MET, peso atual e duração. O valor abaixo pode ser substituído pelo wearable.</small></div><label style="display:block;margin:12px 0 6px;color:#bbb">Calorias registradas</label><div style="display:flex;gap:8px;align-items:center"><input id="mabFinishCalories" inputmode="numeric" type="number" min="0" max="10000" value="${estimated||''}" style="flex:1;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><span>kcal</span></div><label style="display:block;margin:14px 0 6px;color:#bbb">Fonte</label><select id="mabFinishSource" style="width:100%;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><option>Estimativa MAB</option><option>Apple Watch</option><option>Polar</option><option>Garmin</option><option>Outro</option></select><label style="display:block;margin:14px 0 6px;color:#bbb">Observações do treino</label><textarea id="mabFinishNotes" rows="4" placeholder="Opcional" style="width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"></textarea><button id="mabSaveFinish" style="width:100%;margin-top:16px;background:#ff851b;color:#080808;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800">Salvar e concluir</button></div>`;document.body.appendChild(overlay);document.querySelector('#mabSaveFinish').onclick=()=>saveWorkoutSummary(session).catch(console.error)}
async function isLastSeriesComplete(){const ctx=await getWorkoutContext();if(!ctx?.item||ctx.index!==ctx.items.length-1)return false;const sets=(await repo.all('executedSets')).filter(x=>x.sessionId===ctx.current.id&&x.exerciseId===ctx.item.exerciseId&&x.completed);return sets.length>=Number(ctx.item.sets||0)}
async function maybeFinishAfterRest(){const session=(await repo.all('workoutSessions')).find(x=>x.status==='in_progress');if(!session)return false;if(!(await isLastSeriesComplete()))return false;const running=(await repo.all('restTimers')).find(x=>x.sessionId===session.id&&x.status==='running');if(running&&remaining(running.targetEndAt)>0)return false;if(running){running.status='completed';await repo.put('restTimers',running)}await openWorkoutSummary(session);return true}
setInterval(()=>{if(document.querySelector('#mabFinishOverlay'))return;maybeFinishAfterRest().catch(()=>{})},1000);
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action="skip-rest"]');if(!b)return;setTimeout(()=>maybeFinishAfterRest().catch(()=>{}),80)},true);
// intercepta finalizar normal e preserva regra de treino curto
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-action="finish"]');if(!b||b.dataset[FINISH_PATCH])return;const session=(await repo.all('workoutSessions')).find(x=>x.status==='in_progress');if(!session)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const seconds=sessionSeconds(session);if(seconds<SHORT_WORKOUT_SECONDS){const keep=confirm(`Este treino teve apenas ${fmtShort(seconds)}. Deseja manter o registro?\n\nOK = manter\nCancelar = apagar o treino iniciado por engano`);if(!keep){await deleteWorkoutSession(session);document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();return}}await openWorkoutSummary(session)},true);
function enhanceSettingsProfile(){const modal=document.querySelector('#modalContent');if(!modal||!modal.querySelector('#exportBtn')||modal.querySelector('#mabProfileSection'))return;const p=loadPhysicalProfile();const block=document.createElement('div');block.id='mabProfileSection';block.className='stack';block.innerHTML=`<hr style="border-color:#333;width:100%"><h3>Perfil físico</h3><p class="muted">Usado como base para futuras estimativas. O peso vem da avaliação corporal mais recente.</p><label class="field">Data de nascimento<input id="mabBirthDate" type="date" value="${escapeHtml(p.birthDate||'')}"></label><label class="field">Altura (cm)<input id="mabHeight" type="number" inputmode="numeric" min="100" max="250" value="${escapeHtml(p.heightCm||'')}"></label><label class="field">Sexo para cálculo fisiológico<select id="mabSex"><option value="">Não informado</option><option value="female" ${p.sex==='female'?'selected':''}>Feminino</option><option value="male" ${p.sex==='male'?'selected':''}>Masculino</option></select></label><button class="secondary" id="mabSaveProfile">Salvar perfil</button>`;modal.querySelector('.stack')?.appendChild(block);block.querySelector('#mabSaveProfile').onclick=()=>{savePhysicalProfile({birthDate:block.querySelector('#mabBirthDate').value,heightCm:Number(block.querySelector('#mabHeight').value)||null,sex:block.querySelector('#mabSex').value});block.querySelector('#mabSaveProfile').textContent='Perfil salvo ✓';setTimeout(()=>block.querySelector('#mabSaveProfile')&&(block.querySelector('#mabSaveProfile').textContent='Salvar perfil'),1200)}}
const profileObserver=new MutationObserver(()=>setTimeout(enhanceSettingsProfile,30));profileObserver.observe(document.querySelector('#modal')||document.body,{childList:true,subtree:true});
async function enhanceDashboardCalories(){if(!document.querySelector('.dashboard-layout'))return;const sessions=(await repo.all('workoutSessions')).filter(x=>x.status==='completed'&&x.calories!=null);const rows=[...document.querySelectorAll('.dashboard-layout .exercise-item')];for(const row of rows){if(row.dataset.mabCalories==='1')continue;const title=row.querySelector('strong')?.textContent||'';if(!title.includes('Musculação'))continue;const detail=row.querySelector('.muted');if(!detail)continue;const group=(title.match(/Treino\s+([A-D])/i)||[])[1],date=(detail.textContent.match(/\d{4}-\d{2}-\d{2}/)||[])[0];const s=sessions.find(x=>x.groupCode===group&&(x.startedAt||'').slice(0,10)===date);if(s){detail.textContent+=` · ${s.calories} kcal`;row.dataset.mabCalories='1'}}}
const kcalObserver=new MutationObserver(()=>{clearTimeout(window.__mabKcalTimer);window.__mabKcalTimer=setTimeout(()=>enhanceDashboardCalories().catch(()=>{}),100)});kcalObserver.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
document.documentElement.dataset.mabVersion=MAB_V2100;
