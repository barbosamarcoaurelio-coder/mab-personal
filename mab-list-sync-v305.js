import {repo} from './repositories.js';

const RETRIES=[0,80,180,320,520];
let generation=0;
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

async function getProgress(){
  const sessions=(await repo.all('workoutSessions')).filter(s=>s.status==='in_progress');
  const session=sessions[0];
  if(!session)return null;
  const [items,sets,exercises]=await Promise.all([
    repo.all('planItems'),repo.all('executedSets'),repo.all('exercises')
  ]);
  const plan=items.filter(item=>item.cycleId===session.cycleId&&item.groupCode===session.groupCode&&item.active).sort((a,b)=>a.order-b.order);
  if(!plan.length)return null;
  const currentIndex=Math.max(0,Math.min(Number(session.currentIndex||0),plan.length-1));
  return {session,currentIndex,rows:plan.map((item,index)=>{
    const planned=Number(item.sets||0);
    const done=sets.filter(set=>set.sessionId===session.id&&set.exerciseId===item.exerciseId&&set.completed).length;
    return {index,planned,done,complete:planned>0&&done>=planned,partial:done>0&&done<planned,exercise:exercises.find(ex=>ex.id===item.exerciseId)};
  })};
}

async function renderList(token){
  if(token!==generation)return false;
  const saveButton=document.querySelector('[data-action="save-set"]');
  if(!saveButton)return false;
  const card=saveButton.closest('.card');
  if(!card)return false;
  const data=await getProgress();
  if(!data||token!==generation)return false;

  let heading=card.querySelector('[data-mab-list-sync-heading]')||card.querySelector('[data-mab-nav-heading]');
  if(!heading){
    heading=document.createElement('div');
    heading.dataset.mabListSyncHeading='1';
    heading.innerHTML='<div class="muted" style="margin-top:14px">EXERCÍCIOS DO TREINO</div>';
    card.appendChild(heading);
  }
  let nav=card.querySelector('#mabExerciseNavigator');
  if(!nav){nav=document.createElement('div');nav.id='mabExerciseNavigator';card.appendChild(nav)}
  nav.innerHTML=data.rows.map(row=>{
    const state=row.index===data.currentIndex?'Atual':row.complete?'Concluído':row.partial?'Parcial':'Pendente';
    const icon=row.index===data.currentIndex?'▶':row.complete?'✓':row.partial?'◐':'○';
    const css=row.index===data.currentIndex?'current':row.complete?'completed':row.partial?'partial':'';
    return `<button type="button" class="mab-exercise-nav-item ${css}" data-mab-exercise-index="${row.index}"><span>${icon}</span><strong>${esc(row.exercise?.name||'Exercício')}</strong><span class="state">${state} · ${row.done}/${row.planned}</span></button>`;
  }).join('');
  nav.dataset.mabSyncedVersion='3.0.5';
  return true;
}

function syncImmediately(){
  const token=++generation;
  RETRIES.forEach(delay=>setTimeout(()=>renderList(token).catch(console.error),delay));
}

// routechange é disparado pelo app após Próximo/Anterior e pelo controlador após avanço automático.
window.addEventListener('routechange',syncImmediately);
// Salvar série pode iniciar a troca automática alguns milissegundos depois; esta chamada cobre ambos os lados da troca.
document.addEventListener('click',event=>{
  if(event.target.closest('[data-action="save-set"],[data-action="next"],[data-action="prev"],[data-mab-exercise-index]')) syncImmediately();
},false);

syncImmediately();
window.MABListSync305={version:'3.0.5',retries:[...RETRIES],sync:syncImmediately};
