import {repo} from './repositories.js';
import {navigate,route} from './router.js';
import {elapsed,fmt} from './timer-service.js';
import {esc,number} from './validators.js';

const MUSCLE_GROUPS=['Peitoral','Costas','Ombros','Bíceps','Tríceps','Pernas','Quadríceps','Posterior','Glúteos','Panturrilhas','Core'];
const today=()=>new Date().toISOString().slice(0,10);
const optional=(value,min,max)=>{const raw=String(value??'').trim().replace(',','.');if(!raw)return null;return number(raw,min,max)};
const fmtNumber=(value,digits=1)=>value==null||value===''?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:digits});
const toast=message=>{const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)};
const dialog=()=>document.querySelector('#modal');
const modalContent=()=>document.querySelector('#modalContent');
const showModal=html=>{const content=modalContent(),modal=dialog();if(!content||!modal)return;content.innerHTML=html;modal.showModal()};
const closeModal=()=>dialog()?.close();
const parseDate=value=>String(value||'').slice(0,10);
const displayValue=(value,unit='')=>value==null||value===''?'—':`${fmtNumber(value)}${unit}`;
const parseSleepHM=value=>{const s=String(value??'').trim().replace(',','.');if(!s)return null;const m=s.match(/^(\d{1,2})[:hH](\d{1,2})$/);let h;if(m){if(Number(m[2])>59)return null;h=Number(m[1])+Number(m[2])/60}else{if(!/^\d{1,2}(\.\d{1,2})?$/.test(s))return null;h=Number(s)}return h>=0&&h<=24?Math.round(h*100)/100:null};
const fmtSleepHM=value=>{if(value==null||value===''||!Number.isFinite(Number(value)))return'—';const t=Math.round(Number(value)*60),h=Math.floor(t/60),m=t%60;return m?`${h}h${String(m).padStart(2,'0')}`:`${h}h`};
const toSleepInput=value=>{if(value==null||!Number.isFinite(Number(value)))return'';const t=Math.round(Number(value)*60),h=Math.floor(t/60),m=t%60;return `${h}:${String(m).padStart(2,'0')}`};

function addStyles(){
  if(document.querySelector('#mabV306Styles'))return;
  const style=document.createElement('style');
  style.id='mabV306Styles';
  style.textContent=`
    .chips .chip{touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .mab-v306-panel{margin-top:12px}
    .mab-v306-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .mab-v306-metric{padding:10px;border:1px solid #333;border-radius:10px;background:#101010}
    .mab-v306-metric span{display:block;color:#aaa;font-size:12px}
    .mab-v306-metric strong{display:block;margin-top:3px;font-size:17px}
    .mab-v306-table{width:100%;border-collapse:collapse;font-size:12px}
    .mab-v306-table th,.mab-v306-table td{padding:9px 5px;text-align:left;border-bottom:1px solid #333}
    .mab-v306-table th{color:#aaa;font-size:10px;font-weight:600}
    .mab-v306-table tr:last-child td{border-bottom:0}
    .mab-v306-muted{color:#aaa;font-size:11px}
    .mab-v306-controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .mab-v306-scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
    .mab-v306-scale label{display:grid;place-items:center;padding:9px 2px;border:1px solid #444;border-radius:8px;background:#101010;color:#ddd}
    .mab-v306-scale input{accent-color:#ff851b}
    .mab-v306-group-row{display:grid;grid-template-columns:minmax(90px,1fr) 1fr 1fr;gap:7px;align-items:center;padding:8px 0;border-bottom:1px solid #333;font-size:12px}
    .mab-v306-group-row:last-child{border-bottom:0}
    .mab-v306-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    @media(max-width:380px){.mab-v306-grid{grid-template-columns:1fr}.mab-v306-group-row{grid-template-columns:85px 1fr 1fr;font-size:11px}}
  `;
  document.head.appendChild(style)
}

function getCardByHeading(text){
  return [...document.querySelectorAll('#app .card')].find(card=>[...card.querySelectorAll('h2,h3')].some(h=>h.textContent.trim()===text))||null
}

async function enhanceAssessmentView(){
  const app=document.querySelector('#app');
  const composition=getCardByHeading('Composição corporal atual');
  if(!app||!composition)return;
  if(document.querySelector('#mabV306BodyMeasures'))return;
  const assessments=(await repo.all('bodyAssessments')).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const latest=assessments[0];
  composition.querySelectorAll('.metric .muted').forEach(label=>{if(label.textContent.trim()==='Gordura corporal')label.textContent='% Gordura'});
  const metricFields=[['Peso','weight',' kg'],['Massa magra','leanMass',' kg'],['Massa gorda','fatMass',' kg'],['% Gordura','bodyFat','%'],['Abdômen','abdomenCm',' cm']];
  for(const [label,key,unit] of metricFields){
    const metric= [...composition.querySelectorAll('.metric')].find(item=>item.querySelector('span.muted')?.textContent.trim()===label);
    if(!metric)continue;
    const rows=assessments.filter(item=>{const value=key==='abdomenCm'?(item.abdomenCm??item.waistCm):item[key];return value!=null&&value!==''});
    const current=rows[0],previous=rows[1],value=key==='abdomenCm'?(current?.abdomenCm??current?.waistCm):current?.[key];
    const strong=metric.querySelector('strong');if(strong)strong.textContent=displayValue(value,unit);
    const delta=metric.querySelectorAll('.muted')[1];
    if(delta)delta.textContent=current&&previous?`${Number(value)-Number(key==='abdomenCm'?(previous.abdomenCm??previous.waistCm):previous[key])>0?'+':''}${(Number(value)-Number(key==='abdomenCm'?(previous.abdomenCm??previous.waistCm):previous[key])).toFixed(1)}${key==='bodyFat'?' p.p.':unit} vs anterior`:''
  }
  const currentWeight=composition.querySelector('.metric strong');
  const dashboardWeight=[...document.querySelectorAll('.dashboard-layout .metric')].find(card=>card.querySelector('.muted')?.textContent.trim()==='Peso atual');
  const lastKnownWeight=assessments.find(item=>item.weight!=null&&item.weight!=='');
  if(currentWeight&&(!lastKnownWeight))currentWeight.textContent='-- kg';
  if(dashboardWeight?.querySelector('strong'))dashboardWeight.querySelector('strong').textContent=lastKnownWeight?`${fmtNumber(lastKnownWeight.weight)} kg`:'-- kg';
  composition.querySelectorAll('.metric .muted').forEach(label=>{if(label.textContent.trim()==='Circunferência abdominal')label.textContent='Abdômen'});
  const history=getCardByHeading('Histórico corporal');
  if(history){
    const rows=[...history.querySelectorAll('.exercise-item')];
    rows.forEach((row,index)=>{
      const assessment=assessments[index];
      if(!assessment)return;
      row.dataset.v306AssessmentId=assessment.id;
      row.querySelector('[data-mab-edit-assessment]')?.setAttribute('data-mab-edit-assessment',assessment.id);
      row.querySelector('[data-mab-delete-assessment]')?.setAttribute('data-mab-delete-assessment',assessment.id);
      const weight=row.querySelector('strong');
      if(weight)weight.textContent=assessment.weight==null?'-- kg':`${fmtNumber(assessment.weight)} kg`;
      if(row.querySelector('[data-v306-measures]'))return;
      const details=document.createElement('details');
      details.dataset.v306Measures='1';
      details.className='mab-v306-extra-measures';
      details.innerHTML=`<summary class="mab-v306-muted">Medidas dos membros e tronco</summary><div class="mab-v306-muted">Bíceps E/D: ${displayValue(assessment.bicepsLeftCm)} / ${displayValue(assessment.bicepsRightCm)} cm · Antebraço E/D: ${displayValue(assessment.forearmLeftCm)} / ${displayValue(assessment.forearmRightCm)} cm<br>Coxa E/D: ${displayValue(assessment.thighLeftCm)} / ${displayValue(assessment.thighRightCm)} cm · Panturrilha E/D: ${displayValue(assessment.calfLeftCm)} / ${displayValue(assessment.calfRightCm)} cm<br>Abdômen: ${displayValue(assessment.abdomenCm??assessment.waistCm,' cm')} · Cintura: ${displayValue(assessment.waistCircumferenceCm,' cm')} · Quadril: ${displayValue(assessment.hipCm,' cm')}</div>`;
      row.appendChild(details)
    })
  }
  const measureKeys=['bicepsLeftCm','bicepsRightCm','forearmLeftCm','forearmRightCm','thighLeftCm','thighRightCm','calfLeftCm','calfRightCm','abdomenCm','waistCm','waistCircumferenceCm','hipCm'];
  const latestWithMeasures=assessments.find(a=>measureKeys.some(k=>a[k]!=null&&a[k]!==''));
  const metrics=[['Bíceps E/D',latestWithMeasures?.bicepsLeftCm,latestWithMeasures?.bicepsRightCm],['Antebraço E/D',latestWithMeasures?.forearmLeftCm,latestWithMeasures?.forearmRightCm],['Coxa E/D',latestWithMeasures?.thighLeftCm,latestWithMeasures?.thighRightCm],['Panturrilha E/D',latestWithMeasures?.calfLeftCm,latestWithMeasures?.calfRightCm]];
  const panel=document.createElement('section');
  panel.id='mabV306BodyMeasures';
  panel.className='card mab-v306-panel';
  panel.innerHTML=`<div class="row"><div><h3>Medidas corporais</h3><div class="mab-v306-muted">Avaliação atual · ${esc(latestWithMeasures?.date||'--')}</div></div></div><div class="mab-v306-grid" style="margin-top:10px">${metrics.map(([label,left,right])=>`<div class="mab-v306-metric"><span>${label}</span><strong>${displayValue(left)} / ${displayValue(right)} cm</strong></div>`).join('')}</div><div class="mab-v306-controls"><span class="mab-v306-muted">Abdômen: ${displayValue(latestWithMeasures?.abdomenCm??latestWithMeasures?.waistCm,' cm')}</span><span class="mab-v306-muted">Cintura: ${displayValue(latestWithMeasures?.waistCircumferenceCm,' cm')}</span><span class="mab-v306-muted">Quadril: ${displayValue(latestWithMeasures?.hipCm,' cm')}</span></div>`;
  composition.insertAdjacentElement('afterend',panel);
  const select=document.querySelector('#bodyChartMetric');
  if(select){
    const bodyFatOption=select.querySelector('option[value="bodyFat"]');
    if(bodyFatOption)bodyFatOption.textContent='% Gordura';
    const abdomenOption=select.querySelector('option[value="waistCm"]');
    if(abdomenOption)abdomenOption.textContent='Abdômen';
    const chartOptions=[['waistCircumferenceCm','Cintura'],['hipCm','Quadril'],['bicepsLeftCm','Bíceps esquerdo'],['bicepsRightCm','Bíceps direito'],['forearmLeftCm','Antebraço esquerdo'],['forearmRightCm','Antebraço direito'],['thighLeftCm','Coxa esquerda'],['thighRightCm','Coxa direita'],['calfLeftCm','Panturrilha esquerda'],['calfRightCm','Panturrilha direita']];
    for(const [value,label] of chartOptions)if(!select.querySelector(`option[value="${value}"]`)){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option)}
  }
}

async function enhanceDashboardWeight(){
  const card=[...document.querySelectorAll('.dashboard-layout .metric')].find(item=>item.querySelector('.muted')?.textContent.trim()==='Peso atual');
  if(!card)return;
  const latest=(await repo.all('bodyAssessments')).filter(item=>item.weight!=null&&item.weight!=='').sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  const strong=card.querySelector('strong'),value=latest?`${fmtNumber(latest.weight)} kg`:'-- kg';
  if(strong&&strong.textContent!==value)strong.textContent=value
}

async function recoveryRows(){return (await repo.all('dailyRecovery')).sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
async function enhanceRecoveryCard(){
  if(!document.querySelector('#bodyChart')||document.querySelector('#mabV306Recovery'))return;
  const header=document.querySelector('#app .stack > .row')||document.querySelector('#app h2')?.closest('.row');
  const trainingSummary=document.querySelector('#mabV306TrainingSummary');
  const activityCard=getCardByHeading('Atividades registradas');
  if(!header&&!trainingSummary&&!activityCard)return;
  const entries=(await recoveryRows()).slice(0,7);
  const last7=entries.slice(0,7);
  const avg=key=>{const values=last7.map(x=>x[key]).filter(value=>value!=null&&value!=='').map(Number).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null};
  const card=document.createElement('section');
  card.id='mabV306Recovery';
  card.className='card mab-v306-panel';
  card.innerHTML=`<div class="row"><div><h3>Sono e recuperação</h3><div class="mab-v306-muted">Registro diário opcional</div></div><button class="primary" data-v306-recovery-add>+ Registrar</button></div><div class="mab-v306-grid" style="margin-top:12px"><div class="mab-v306-metric"><span>Sono médio · últimos 7 registros</span><strong>${avg('sleepHours')==null?'—':fmtSleepHM(avg('sleepHours'))}</strong></div><div class="mab-v306-metric"><span>Qualidade média</span><strong>${avg('sleepQuality')==null?'—':`${fmtNumber(avg('sleepQuality'))}/5`}</strong></div><div class="mab-v306-metric"><span>Recuperação média</span><strong>${avg('morningRecovery')==null?'—':`${fmtNumber(avg('morningRecovery'))}/5`}</strong></div></div><div>${entries.slice(0,3).map(row=>`<div class="exercise-item"><div><strong>${esc(row.date)}</strong><div class="muted">Sono: ${fmtSleepHM(row.sleepHours)} · Qualidade: ${displayValue(row.sleepQuality,'/5')} · Recuperação: ${displayValue(row.morningRecovery,'/5')}</div></div><button class="ghost" data-v306-recovery-edit="${esc(row.id)}">Editar</button></div>`).join('')||'<div class="empty">Sem registros de sono e recuperação.</div>'}</div>`;
  if(header){
    header.insertAdjacentElement('afterend',card)
  }else if(trainingSummary){
    trainingSummary.insertAdjacentElement('beforebegin',card)
  }else if(activityCard){
    activityCard.insertAdjacentElement('beforebegin',card)
  }
}

async function enhanceTrainingSummary(){
  if(!document.querySelector('#bodyChart')||document.querySelector('#mabV306TrainingSummary'))return;
  const recoveryCard=document.querySelector('#mabV306Recovery');
  const activityCard=getCardByHeading('Atividades registradas');
  const header=document.querySelector('#app .stack > .row')||document.querySelector('#app h2')?.closest('.row');
  if(!activityCard&&!header&&!recoveryCard)return;
  const start=new Date();start.setDate(start.getDate()-6);start.setHours(0,0,0,0);
  const sessions=(await repo.all('workoutSessions')).filter(session=>session.status==='completed'&&new Date(session.startedAt)>=start);
  const activities=(await repo.all('activityDiary')).filter(activity=>new Date(`${activity.date}T00:00:00`)>=start);
  const durations=sessions.map(formatSessionDuration);
  const durationTotal=durations.reduce((sum,value)=>sum+value,0);
  const card=document.createElement('section');card.id='mabV306TrainingSummary';card.className='card mab-v306-panel';
  const allRpes=[...sessions.map(session=>session.sessionRpe),...activities.map(activity=>activity.sessionRpe)].filter(value=>value!=null);
  card.innerHTML=`<h3>Treinos e Atividades · últimos 7 dias</h3><div class="mab-v306-grid" style="margin-top:10px"><div class="mab-v306-metric"><span>Musculações</span><strong>${sessions.length}</strong></div><div class="mab-v306-metric"><span>Outras atividades</span><strong>${activities.length}</strong></div><div class="mab-v306-metric"><span>Duração de musculação</span><strong>${fmt(durationTotal)}</strong></div><div class="mab-v306-metric"><span>Duração média</span><strong>${durations.length?fmt(Math.round(average(durations))):'—'}</strong></div><div class="mab-v306-metric"><span>Esforço médio (RPE)</span><strong>${average(allRpes)==null?'—':`${fmtNumber(average(allRpes))}/10`}</strong></div></div>`;
  if(recoveryCard){
    recoveryCard.insertAdjacentElement('afterend',card)
  }else if(activityCard){
    activityCard.insertAdjacentElement('beforebegin',card)
  }else if(header){
    header.insertAdjacentElement('afterend',card)
  }
}

async function enhanceExerciseRows(){
  const rows=[...document.querySelectorAll('#exerciseList .exercise-item[data-name]')];
  if(!rows.length)return;
  const exercises=await repo.all('exercises');
  for(const row of rows){
    if(row.querySelector('[data-v306-classify]'))continue;
    const name=row.dataset.name;
    const exercise=exercises.find(x=>(x.nameNormalized||x.name?.toLowerCase())===name);
    if(!exercise)continue;
    const controls=row.querySelector('.row')||row;
    const button=document.createElement('button');
    button.type='button';button.className='ghost';button.textContent='Grupos';button.dataset.v306Classify=exercise.id;button.setAttribute('aria-label',`Classificar grupos musculares de ${exercise.name}`);
    controls.appendChild(button);
    const main=exercise.primaryMuscleGroup||exercise.muscleGroup||'Sem classificação';
    if(!row.querySelector('.mab-v306-muscles')){const meta=document.createElement('div');meta.className='muted mab-v306-muscles';meta.textContent=`Principal: ${main}${exercise.secondaryMuscleGroups?.length?` · Secundários: ${exercise.secondaryMuscleGroups.join(', ')}`:''}`;row.firstElementChild?.appendChild(meta)}
  }
}

function showWarmup(session){
  const overlay=document.createElement('div');
  overlay.id='mabWarmupOverlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';
  const startedAt=Date.now();
  let type='Caminhada leve';
  overlay.innerHTML=`<div style="width:min(620px,100%);background:#151515;border:1px solid #3a3a3a;border-radius:22px;padding:20px;color:#fff;box-sizing:border-box"><div style="color:#ff851b;font-size:13px;font-weight:800;letter-spacing:.08em">AQUECIMENTO · OPCIONAL</div><h2 style="margin:6px 0 4px">Prepare o corpo</h2><div style="color:#aaa;font-size:13px;margin-bottom:14px">Sugestão: 5–10 minutos leves antes da musculação. O tempo de aquecimento não entra na duração da musculação.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${['Caminhada leve','Bicicleta','Mobilidade','Alongamento','Livre'].map((t,i)=>`<button type="button" data-wtype="${t}" style="padding:10px 14px;border-radius:999px;border:1px solid ${i===0?'#ff851b':'#444'};background:${i===0?'rgba(255,133,27,.15)':'#101010'};color:#fff;font-size:14px">${t}</button>`).join('')}</div><div style="text-align:center;margin:6px 0 18px"><div id="mabWarmupTimer" style="font-size:44px;font-weight:800;color:#ff851b;font-variant-numeric:tabular-nums">00:00</div><div style="color:#888;font-size:12px">tempo de aquecimento</div></div><button id="mabWarmupDone" style="width:100%;background:#ff851b;color:#080808;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800">Concluir aquecimento →</button><button id="mabWarmupSkip" style="width:100%;margin-top:10px;background:transparent;color:#bbb;border:1px solid #444;border-radius:14px;padding:13px;font-size:14px">Pular e ir direto para a musculação</button></div>`;
  document.body.appendChild(overlay);
  const timerEl=overlay.querySelector('#mabWarmupTimer');
  const tick=setInterval(()=>{const s=Math.floor((Date.now()-startedAt)/1000);timerEl.textContent=fmt(s)},1000);
  overlay.querySelectorAll('[data-wtype]').forEach(btn=>btn.onclick=()=>{type=btn.dataset.wtype;overlay.querySelectorAll('[data-wtype]').forEach(b=>{const on=b===btn;b.style.borderColor=on?'#ff851b':'#444';b.style.background=on?'rgba(255,133,27,.15)':'#101010'})});
  const finish=async skipped=>{
    clearInterval(tick);
    const seconds=Math.round((Date.now()-startedAt)/1000);
    session.warmupType=skipped?null:type;
    session.warmupSeconds=skipped?null:seconds;
    session.warmupSkipped=skipped;
    await repo.put('workoutSessions',session);
    overlay.remove();
    navigate('workout')
  };
  overlay.querySelector('#mabWarmupDone').onclick=()=>finish(false).catch(error=>toast(error.message));
  overlay.querySelector('#mabWarmupSkip').onclick=()=>finish(true).catch(error=>toast(error.message));
}
async function startSessionWithCheckin(group){
  const existing=(await repo.all('workoutSessions')).find(session=>session.status==='in_progress');
  if(existing){navigate('workout');return}
  const cycle=(await repo.all('cycles')).find(item=>item.status==='active');
  if(!cycle){toast('Crie um ciclo ativo.');return}
  const date=today();
  const recovery=(await repo.all('dailyRecovery')).find(item=>item.date===date);
  showModal(`<form id="mabV306PreWorkout" class="stack"><div class="row"><h2>Disposição e Sono</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">Preencha rapidamente ou pule. O Treino ${esc(group)} e o plano permanecem iguais.</p><label class="field">Disposição antes do treino · 1–5<input name="readinessBefore" type="number" min="1" max="5" inputmode="numeric" placeholder="Não informar"></label><label class="field">Sono na noite anterior · hh:mm<input name="sleepHoursBefore" type="text" value="${toSleepInput(recovery?.sleepHours)}" placeholder="Ex.: 7:30"><small class="muted">Horas e minutos — ex.: 7:30. Deixe vazio para não informar.</small></label><div class="row"><button type="button" class="ghost" id="mabV306SkipStart">Pular</button><button class="primary">Começar Treino ${esc(group)}</button></div></form>`);
  const form=modalContent().querySelector('#mabV306PreWorkout');
  modalContent().querySelectorAll('[data-close]').forEach(button=>button.onclick=closeModal);
  const createSession=async includeCheckin=>{
    const readinessValue=includeCheckin?form.elements.readinessBefore.value:'';
    const sleepValue=includeCheckin?form.elements.sleepHoursBefore.value:'';
    const sleepParsed=parseSleepHM(sleepValue);
    let recoveryRecord=recovery;
    if(sleepParsed!=null){
      recoveryRecord={...(recovery||{}),id:recovery?.id||repo.uuid(),date,sleepHours:sleepParsed,updatedAt:new Date().toISOString(),createdAt:recovery?.createdAt||new Date().toISOString()};
      await repo.put('dailyRecovery',recoveryRecord);
    }
    const wakeLock=navigator.wakeLock;
    if(wakeLock)try{await wakeLock.request('screen')}catch{}
    const session={id:repo.uuid(),cycleId:cycle.id,groupCode:group,status:'in_progress',startedAt:new Date().toISOString(),currentIndex:0,readinessBefore:optional(readinessValue,1,5),sleepHoursBefore:sleepParsed,dailyRecoveryId:recoveryRecord?.id||null};
    await repo.put('workoutSessions',session);
    closeModal();showWarmup(session)
  };
  modalContent().querySelector('#mabV306SkipStart').onclick=()=>createSession(false).catch(error=>toast(error.message));
  form.onsubmit=event=>{event.preventDefault();createSession(true).catch(error=>toast(error.message))}
}

async function renderAdditionalChart(metric){
  const target=document.querySelector('#bodyChart');if(!target)return;
  const config={abdomenCm:['Abdômen','cm'],waistCircumferenceCm:['Cintura','cm'],hipCm:['Quadril','cm'],bicepsLeftCm:['Bíceps esquerdo','cm'],bicepsRightCm:['Bíceps direito','cm'],forearmLeftCm:['Antebraço esquerdo','cm'],forearmRightCm:['Antebraço direito','cm'],thighLeftCm:['Coxa esquerda','cm'],thighRightCm:['Coxa direita','cm'],calfLeftCm:['Panturrilha esquerda','cm'],calfRightCm:['Panturrilha direita','cm']}[metric];
  const rows=(await repo.all('bodyAssessments')).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const points=rows.map(row=>({date:row.date,value:metric==='abdomenCm'?(row.abdomenCm??row.waistCm):row[metric]})).filter(point=>point.value!=null&&point.value!=='').map(point=>({...point,value:Number(point.value)})).filter(point=>Number.isFinite(point.value));
  if(!points.length){target.innerHTML='<div class="empty">Sem dados suficientes para este indicador.</div>';return}
  const values=points.map(point=>point.value),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  target.innerHTML=`<div class="chart">${points.map(point=>`<i class="bar" title="${esc(point.date)}: ${point.value} ${config[1]}" style="height:${25+75*((point.value-min)/range)}%"></i>`).join('')}</div><div class="row muted"><span>${esc(points[0].date)}</span><strong>${config[0]}</strong><span>${esc(points.at(-1).date)}</span></div>`
}

let isEnhancingEvolution=false;
async function enhanceEvolution(){
  if(route()!=='evolution')return;
  if(isEnhancingEvolution)return;
  const recEl=document.querySelector('#mabV306Recovery');
  const sumEl=document.querySelector('#mabV306TrainingSummary');
  const measEl=document.querySelector('#mabV306BodyMeasures');
  const header=document.querySelector('#app .stack > .row')||document.querySelector('#app h2')?.closest('.row');
  if(recEl&&sumEl&&measEl){
    if(header&&header.nextElementSibling!==recEl){
      header.insertAdjacentElement('afterend',recEl);
    }
    if(recEl.nextElementSibling!==sumEl){
      recEl.insertAdjacentElement('afterend',sumEl);
    }
    return;
  }
  isEnhancingEvolution=true;
  try{
    document.querySelector('#mabV306MuscleVolume')?.remove();
    await enhanceRecoveryCard();
    await enhanceTrainingSummary();
    await enhanceAssessmentView();
  }finally{
    isEnhancingEvolution=false;
  }
}

function renderRecoveryForm(existing=null){
  const date=existing?.date||today();
  showModal(`<form id="mabV306RecoveryForm" class="stack"><div class="row"><h2>${existing?'Editar':'Sono e recuperação'}</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">Registro diário opcional. Campos vazios não são tratados como zero.</p><label class="field">Data<input name="date" type="date" required value="${esc(date)}"></label><label class="field">Sono da noite · hh:mm<input name="sleepHours" type="text" value="${toSleepInput(existing?.sleepHours)}" placeholder="Ex.: 7:30"><small class="muted">Horas e minutos — ex.: 7:30.</small></label><label class="field">Qualidade do sono · 1–5<select name="sleepQuality"><option value="">Não informado</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(existing?.sleepQuality)===n?'selected':''}>${n}</option>`).join('')}</select></label><label class="field">Recuperação ao acordar · 1–5<select name="morningRecovery"><option value="">Não informado</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(existing?.morningRecovery)===n?'selected':''}>${n}</option>`).join('')}</select></label><div class="row"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Salvar registro</button></div></form>`);
  modalContent().querySelectorAll('[data-close]').forEach(button=>button.onclick=closeModal);
  modalContent().querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget),recordDate=form.get('date');
    const current=(await repo.all('dailyRecovery')).find(x=>x.date===recordDate);
    if(existing&&current&&current.id!==existing.id){toast('Já existe um registro de sono nesta data. Edite esse registro para evitar duplicidade.');return}
    const record={...(current||existing||{}),id:current?.id||existing?.id||repo.uuid(),date:recordDate,sleepHours:parseSleepHM(form.get('sleepHours')),sleepQuality:optional(form.get('sleepQuality'),1,5),morningRecovery:optional(form.get('morningRecovery'),1,5),updatedAt:new Date().toISOString(),createdAt:current?.createdAt||existing?.createdAt||new Date().toISOString()};
    await repo.put('dailyRecovery',record);closeModal();navigate('evolution')
  }
}

function renderMuscleClassifier(exercise){
  const primary=exercise.primaryMuscleGroup||exercise.muscleGroup||'';
  showModal(`<form id="mabV306MuscleForm" class="stack"><div class="row"><h2>Grupos musculares</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">${esc(exercise.name)} · classificação analítica; não altera o plano.</p><label class="field">Grupo principal<select name="primary" required>${MUSCLE_GROUPS.map(group=>`<option ${group===primary?'selected':''}>${group}</option>`).join('')}</select></label><fieldset class="stack"><legend>Grupos secundários · marque os aplicáveis</legend>${MUSCLE_GROUPS.map(group=>`<label class="row"><span>${group}</span><input type="checkbox" name="secondary" value="${group}" ${(exercise.secondaryMuscleGroups||[]).includes(group)?'checked':''}></label>`).join('')}</fieldset><div class="row"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Salvar classificação</button></div></form>`);
  modalContent().querySelectorAll('[data-close]').forEach(button=>button.onclick=closeModal);
  modalContent().querySelector('form').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.currentTarget),primaryMuscleGroup=form.get('primary');await repo.put('exercises',{...exercise,primaryMuscleGroup,secondaryMuscleGroups:form.getAll('secondary').filter(group=>group!==primaryMuscleGroup),updatedAt:new Date().toISOString()});closeModal();navigate('exercises')}
}

function download(content,filename,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const inRange=(date,start,end)=>Boolean(date)&&date>=start&&date<=end;
function csvCell(value){if(value==null)return '';const text=String(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function csvRow(values){return values.map(csvCell).join(',')}
function weekKey(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));const week=Math.ceil((((d-yearStart)/86400000)+1)/7);return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`}

async function getPeriodData(start,end,scope){
  const [allSessions,allSets,exercises,assessments,recoveries,activities,restTimers]=await Promise.all(['workoutSessions','executedSets','exercises','bodyAssessments','dailyRecovery','activityDiary','restTimers'].map(store=>repo.all(store)));
  const sessions=allSessions.filter(x=>x.status==='completed'&&inRange(parseDate(x.startedAt),start,end)).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
  const sessionIds=new Set(sessions.map(x=>x.id));
  const sets=allSets.filter(x=>sessionIds.has(x.sessionId));
  return {sessions,sets,exercises,assessments:assessments.filter(x=>inRange(x.date,start,end)).sort((a,b)=>a.date.localeCompare(b.date)),recoveries:recoveries.filter(x=>inRange(x.date,start,end)).sort((a,b)=>a.date.localeCompare(b.date)),activities:activities.filter(x=>inRange(x.date,start,end)).sort((a,b)=>a.date.localeCompare(b.date)),restTimers:restTimers.filter(x=>sessionIds.has(x.sessionId)),scope}
}

function formatSessionDuration(session){return Math.max(0,Math.round((Date.parse(session.finishedAt||'')-Date.parse(session.startedAt||''))/1000))||Number(session.durationSeconds)||0}
function formatRestSeconds(timer){return timer.actualDurationSeconds==null?null:Number(timer.actualDurationSeconds)}
function average(values){const valid=values.map(Number).filter(Number.isFinite);return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null}

async function generateTxt(start,end,scope){
  const data=await getPeriodData(start,end,scope),exById=new Map(data.exercises.map(x=>[x.id,x]));
  let output=`# Relatório de treinos MAB Personal\nPeríodo: ${start} a ${end}\nGerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
  const weekly=new Map();
  const weekRow=key=>{const row=weekly.get(key)||{strength:0,seconds:0,activities:0,activitySeconds:0,rpe:[],readiness:[],fatigue:[],sleep:[]};weekly.set(key,row);return row};
  for(const session of data.sessions){const row=weekRow(weekKey(parseDate(session.startedAt)));row.strength++;row.seconds+=formatSessionDuration(session);if(session.sessionRpe!=null)row.rpe.push(Number(session.sessionRpe));if(session.readinessBefore!=null)row.readiness.push(Number(session.readinessBefore));if(session.fatigueAfter!=null)row.fatigue.push(Number(session.fatigueAfter));if(session.sleepHoursBefore!=null)row.sleep.push(Number(session.sleepHoursBefore))}
  if(scope!=='strength')for(const activity of data.activities){const row=weekRow(weekKey(activity.date));row.activities++;row.activitySeconds+=Number(activity.durationMinutes||0)*60;if(activity.sessionRpe!=null)row.rpe.push(Number(activity.sessionRpe));if(activity.fatigueAfter!=null)row.fatigue.push(Number(activity.fatigueAfter))}
  if(scope!=='activities'){
    output+='## Resumo semanal\n';
    if(!weekly.size)output+='Nenhuma sessão no período.\n';
    for(const [week,row] of weekly)output+=`${week}: ${row.strength} musculações · ${fmt(row.seconds)} de musculação · ${scope==='all'?`${row.activities} outras atividades · ${fmt(row.activitySeconds)} de outras atividades · `:''}esforço médio (RPE) ${average(row.rpe)==null?'não informado':average(row.rpe).toFixed(1)} · disposição ${average(row.readiness)==null?'não informada':average(row.readiness).toFixed(1)}/5 · fadiga ${average(row.fatigue)==null?'não informada':average(row.fatigue).toFixed(1)}/5 · sono pré-treino ${average(row.sleep)==null?'não informado':fmtSleepHM(average(row.sleep))}\n`;
    output+='\n## Musculação\n';
    if(!data.sessions.length)output+='Nenhuma sessão concluída no período.\n\n';
    for(const session of data.sessions){
      output+=`### ${parseDate(session.startedAt)} - Treino ${session.groupCode||''}\nDuração total: ${fmt(formatSessionDuration(session))}\n`;
      if(session.calories!=null)output+=`Calorias: ${session.calories} kcal · Fonte: ${session.calorieSource||'não informada'}\n`;
      output+=`Disposição: ${session.readinessBefore??'não informada'}${session.readinessBefore!=null?'/5':''} · Esforço (RPE): ${session.sessionRpe??'não informado'}${session.sessionRpe!=null?'/10':''} · Fadiga: ${session.fatigueAfter??'não informada'}${session.fatigueAfter!=null?'/5':''} · Sono: ${session.sleepHoursBefore==null?'não informado':fmtSleepHM(session.sleepHoursBefore)} · Aquecimento: ${session.warmupSkipped?'pulado':session.warmupType?`${session.warmupType} (${fmt(session.warmupSeconds||0)})`:'não registrado'}\n`;
      const sessionSets=data.sets.filter(set=>set.sessionId===session.id&&set.completed===true).sort((a,b)=>String(a.exerciseId).localeCompare(String(b.exerciseId))||a.setNumber-b.setNumber);
      const exerciseIds=[...new Set(sessionSets.map(set=>set.exerciseId))];
      for(const exerciseId of exerciseIds){
        const exercise=exById.get(exerciseId);output+=`- ${exercise?.name||'Exercício'}:\n`;
        for(const set of sessionSets.filter(item=>item.exerciseId===exerciseId)){const reps=set.reps==null?'reps não informadas':`${set.reps} reps`,weight=set.weight==null?'carga não informada':`${set.weight} kg`,rir=set.rir==null?'RIR não informado':`RIR ${set.rir}`,rest=set.restSecondsBefore==null?'descanso anterior não medido':`descanso anterior ${set.restSecondsBefore} s`;output+=`  - Série ${set.setNumber}: ${reps} x ${weight}, ${rir}, ${rest}\n`}
        const rests=sessionSets.filter(set=>set.exerciseId===exerciseId&&set.restSecondsBefore!=null).map(set=>set.restSecondsBefore);if(rests.length)output+=`  - Descanso médio realizado: ${Math.round(average(rests))} s\n`;
      }
      for(const discomfort of session.discomforts||[])output+=`Desconforto: ${discomfort.region||'região não informada'} · intensidade ${discomfort.intensity??'não informada'}${discomfort.intensity!=null?'/5':''}${discomfort.notes?` · ${discomfort.notes}`:''}\n`;
      if(session.notes)output+=`Observações: ${session.notes}\n`;
      output+='\n'
    }
  }
  if(scope!=='activities'){
    output+='## Volume semanal por grupo muscular\n';
    const weeklyGroups={};
    const sessionById=new Map(data.sessions.map(session=>[session.id,session]));
    for(const set of data.sets.filter(item=>item.completed===true)){
      const session=sessionById.get(set.sessionId),exercise=exById.get(set.exerciseId);if(!session||!exercise)continue;
      const key=weekKey(parseDate(session.startedAt)),row=weeklyGroups[key]||(weeklyGroups[key]={primary:{},secondary:{}});
      const group=exercise.primaryMuscleGroup||exercise.muscleGroup||'Sem classificação';row.primary[group]=(row.primary[group]||0)+1;
      for(const extra of exercise.secondaryMuscleGroups||[])row.secondary[extra]=(row.secondary[extra]||0)+1
    }
    const volumeWeeks=Object.entries(weeklyGroups).sort(([a],[b])=>a.localeCompare(b));
    output+=volumeWeeks.length?volumeWeeks.map(([week,row])=>{const groups=[...new Set([...Object.keys(row.primary),...Object.keys(row.secondary)])].sort((a,b)=>a.localeCompare(b,'pt-BR'));return `${week}\n${groups.map(group=>`${group}: ${row.primary[group]||0} séries principais · ${row.secondary[group]||0} estímulos secundários`).join('\n')}`}).join('\n\n')+'\n\n':'Sem séries efetivas classificadas no período.\n\n';
    output+='## Avaliações corporais\n';
    output+=data.assessments.length?data.assessments.map(a=>`${a.date}: Peso ${a.weight??'não informado'}${a.weight!=null?' kg':''} · % Gordura ${a.bodyFat??'não informada'}${a.bodyFat!=null?'%':''} · Massa gorda ${a.fatMass??'não informada'}${a.fatMass!=null?' kg':''} · Massa magra ${a.leanMass??'não informada'}${a.leanMass!=null?' kg':''}\nAbdômen ${a.abdomenCm??a.waistCm??'não informado'}${a.abdomenCm!=null||a.waistCm!=null?' cm':''} · Cintura ${a.waistCircumferenceCm??'não informada'}${a.waistCircumferenceCm!=null?' cm':''} · Quadril ${a.hipCm??'não informado'}${a.hipCm!=null?' cm':''}\nBíceps E/D ${a.bicepsLeftCm??'—'}/${a.bicepsRightCm??'—'} cm · Antebraço E/D ${a.forearmLeftCm??'—'}/${a.forearmRightCm??'—'} cm · Coxa E/D ${a.thighLeftCm??'—'}/${a.thighRightCm??'—'} cm · Panturrilha E/D ${a.calfLeftCm??'—'}/${a.calfRightCm??'—'} cm`).join('\n\n')+'\n\n':'Sem avaliações no período.\n\n';
    output+='## Sono e recuperação\n';
    output+=data.recoveries.length?data.recoveries.map(row=>`${row.date}: sono ${row.sleepHours==null?'não informado':fmtSleepHM(row.sleepHours)} · qualidade ${row.sleepQuality??'não informada'}${row.sleepQuality!=null?'/5':''} · recuperação ao acordar ${row.morningRecovery??'não informada'}${row.morningRecovery!=null?'/5':''}`).join('\n')+'\n\n':'Sem registros de recuperação no período.\n\n';
  }
  if(scope==='activities'){
    const activityWeeks=new Map();
    for(const activity of data.activities){const key=weekKey(activity.date),row=activityWeeks.get(key)||{count:0,seconds:0};row.count++;row.seconds+=Number(activity.durationMinutes||0)*60;activityWeeks.set(key,row)}
    output+='## Resumo semanal de outras atividades\n';
    output+=activityWeeks.size?[...activityWeeks].sort(([a],[b])=>a.localeCompare(b)).map(([week,row])=>`${week}: ${row.count} atividades · ${fmt(row.seconds)} totais`).join('\n')+'\n\n':'Nenhuma outra atividade no período.\n\n';
  }
  if(scope!=='strength'){
    output+='## Outras atividades\n';
    output+=data.activities.length?data.activities.map(a=>`- ${a.date}: ${a.modality}, ${a.durationMinutes??'duração não informada'}${a.durationMinutes!=null?' min':''}${a.distanceKm!=null?`, ${a.distanceKm} km`:''}${a.calories!=null?`, ${a.calories} kcal`:''}, intensidade ${a.intensity||'não informada'}${a.sessionRpe!=null?`, esforço (RPE) ${a.sessionRpe}/10`:''}${a.fatigueAfter!=null?`, fadiga ${a.fatigueAfter}/5`:''}${a.notes?`. Observações: ${a.notes}`:''}`).join('\n')+'\n\n':'Nenhuma atividade registrada no período.\n\n';
  }
  output+='## Solicitação sugerida para análise\nAnalise consistência, evolução de cargas/repetições/RIR, volume muscular, descanso e relação entre treino, sono e recuperação. Não invente dados ausentes.\n';
  download(output,`mab-treinos-${start}-a-${end}.txt`,'text/plain;charset=utf-8')
}

function toCsv(data){
  const headers=['record_type','record_id','date','session_id','daily_recovery_id','group_code','exercise_id','exercise_name','set_number','completed','reps','weight_kg','rir','duration_seconds','session_rpe','readiness_before','fatigue_after','sleep_hours','sleep_quality','morning_recovery','discomfort_region','discomfort_intensity','discomfort_notes','rest_seconds_before','primary_muscle_group','secondary_muscle_groups','body_weight_kg','body_fat_percent','fat_mass_kg','lean_mass_kg','abdomen_cm','waist_cm','hip_cm','biceps_left_cm','biceps_right_cm','forearm_left_cm','forearm_right_cm','thigh_left_cm','thigh_right_cm','calf_left_cm','calf_right_cm','activity','activity_duration_minutes','distance_km','calories','calorie_source','calorie_method','notes','intensity','warmup_type','warmup_seconds','warmup_skipped'];
  const rows=[];const sessions=new Map(data.sessions.map(x=>[x.id,x]));const exercises=new Map(data.exercises.map(x=>[x.id,x]));
  if(data.scope!=='activities'){
  for(const session of data.sessions)rows.push({record_type:'session',record_id:session.id,date:parseDate(session.startedAt),session_id:session.id,daily_recovery_id:session.dailyRecoveryId,group_code:session.groupCode,duration_seconds:formatSessionDuration(session),session_rpe:session.sessionRpe,readiness_before:session.readinessBefore,fatigue_after:session.fatigueAfter,sleep_hours:session.sleepHoursBefore,calories:session.calories,calorie_source:session.calorieSource,calorie_method:session.calorieMethod,notes:session.notes,warmup_type:session.warmupSkipped?'pulado':session.warmupType??null,warmup_seconds:session.warmupSeconds??null,warmup_skipped:session.warmupSkipped===true?'sim':''});
  for(const set of data.sets){const session=sessions.get(set.sessionId);if(!session)continue;const exercise=exercises.get(set.exerciseId);rows.push({record_type:'set',record_id:set.id,date:parseDate(session.startedAt),session_id:session.id,daily_recovery_id:session.dailyRecoveryId,group_code:session.groupCode,exercise_id:set.exerciseId,exercise_name:exercise?.name,set_number:set.setNumber,completed:set.completed===true,reps:set.reps,weight_kg:set.weight,rir:set.rir,rest_seconds_before:set.restSecondsBefore,primary_muscle_group:exercise?.primaryMuscleGroup||exercise?.muscleGroup,secondary_muscle_groups:(exercise?.secondaryMuscleGroups||[]).join('|')})}
  for(const assessment of data.assessments)rows.push({record_type:'body_assessment',record_id:assessment.id,date:assessment.date,body_weight_kg:assessment.weight,body_fat_percent:assessment.bodyFat,fat_mass_kg:assessment.fatMass,lean_mass_kg:assessment.leanMass,abdomen_cm:assessment.abdomenCm??assessment.waistCm,waist_cm:assessment.waistCircumferenceCm,hip_cm:assessment.hipCm,biceps_left_cm:assessment.bicepsLeftCm,biceps_right_cm:assessment.bicepsRightCm,forearm_left_cm:assessment.forearmLeftCm,forearm_right_cm:assessment.forearmRightCm,thigh_left_cm:assessment.thighLeftCm,thigh_right_cm:assessment.thighRightCm,calf_left_cm:assessment.calfLeftCm,calf_right_cm:assessment.calfRightCm});
  for(const recovery of data.recoveries)rows.push({record_type:'recovery',record_id:recovery.id,date:recovery.date,sleep_hours:recovery.sleepHours,sleep_quality:recovery.sleepQuality,morning_recovery:recovery.morningRecovery});
  for(const session of data.sessions)for(const discomfort of session.discomforts||[])rows.push({record_type:'discomfort',record_id:`${session.id}:${discomfort.region||''}`,date:parseDate(session.startedAt),session_id:session.id,group_code:session.groupCode,discomfort_region:discomfort.region,discomfort_intensity:discomfort.intensity,discomfort_notes:discomfort.notes});
  for(const timer of data.restTimers){const session=sessions.get(timer.sessionId);if(!session)continue;const exercise=exercises.get(timer.exerciseId);rows.push({record_type:'rest',record_id:timer.id,date:parseDate(session.startedAt),session_id:session.id,group_code:session.groupCode,exercise_id:timer.exerciseId,exercise_name:exercise?.name,rest_seconds:formatRestSeconds(timer)})}
  }
  if(data.scope!=='strength')for(const activity of data.activities)rows.push({record_type:'activity',record_id:activity.id,date:activity.date,activity:activity.modality,activity_duration_minutes:activity.durationMinutes,distance_km:activity.distanceKm,calories:activity.calories,intensity:activity.intensity,session_rpe:activity.sessionRpe,fatigue_after:activity.fatigueAfter,notes:activity.notes});
  return '\uFEFF'+[headers,...rows.map(row=>headers.map(header=>csvCell(row[header]??'')))].map(row=>row.join(',')).join('\r\n')+'\r\n'
}

async function exportCsv(start,end,scope){const data=await getPeriodData(start,end,scope);download(toCsv(data),`mab-dados-${start}-a-${end}.csv`,'text/csv;charset=utf-8')}

function enhanceExportForm(){
  const form=document.querySelector('#periodForm');if(!form||form.dataset.v306==='1')return;form.dataset.v306='1';
  const csvButton=document.createElement('button');csvButton.type='button';csvButton.id='mabV306ExportCsv';csvButton.className='secondary';csvButton.textContent='Exportar CSV';form.appendChild(csvButton);
  csvButton.onclick=()=>{const f=new FormData(form);const start=f.get('startDate'),end=f.get('endDate');if(end<start){toast('A data final deve ser igual ou posterior à inicial.');return}exportCsv(start,end,f.get('scope')).catch(error=>toast(error.message))};
  form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();const f=new FormData(form),start=f.get('startDate'),end=f.get('endDate');if(end<start){toast('A data final deve ser igual ou posterior à inicial.');return}generateTxt(start,end,f.get('scope')).catch(error=>toast(error.message));closeModal();toast('Relatório TXT exportado')},true)
}

function openRecoveryFromButton(button){const id=button.dataset.v306RecoveryEdit;repo.get('dailyRecovery',id).then(record=>renderRecoveryForm(record)).catch(error=>toast(error.message))}
function handleClick(event){
  const element=event.target instanceof Element?event.target:null;if(!element)return;
  const startButton=element.closest('button[data-action="start"]');
  if(startButton){event.preventDefault();event.stopImmediatePropagation();startSessionWithCheckin(startButton.dataset.group).catch(error=>toast(error.message));return}
  const add=element.closest('[data-v306-recovery-add]');if(add){event.preventDefault();event.stopImmediatePropagation();renderRecoveryForm();return}
  const editRecovery=element.closest('[data-v306-recovery-edit]');if(editRecovery){event.preventDefault();event.stopImmediatePropagation();openRecoveryFromButton(editRecovery);return}
  const classify=element.closest('[data-v306-classify]');if(classify){event.preventDefault();event.stopImmediatePropagation();repo.get('exercises',classify.dataset.v306Classify).then(exercise=>exercise&&renderMuscleClassifier(exercise)).catch(error=>toast(error.message));return}
}

function handleBodyChartChange(event){
  const select=event.target;
  if(!(select instanceof HTMLSelectElement))return;
  if(select.id!=='bodyChartMetric')return;
  const metric=select.value==='waistCm'?'abdomenCm':select.value;
  if(!['abdomenCm','waistCircumferenceCm','hipCm','bicepsLeftCm','bicepsRightCm','forearmLeftCm','forearmRightCm','thighLeftCm','thighRightCm','calfLeftCm','calfRightCm'].includes(metric))return;
  event.stopImmediatePropagation();renderAdditionalChart(metric).catch(error=>toast(error.message))
}

function observeUi(){
  addStyles();
  const app=document.querySelector('#app'),modal=document.querySelector('#modalContent');
  if(app)new MutationObserver(()=>{
    if(route()==='evolution'){
      if(document.querySelector('#mabV306TrainingSummary')&&document.querySelector('#mabV306BodyMeasures')&&document.querySelector('#mabV306Recovery'))return;
      clearTimeout(window.__mabV306UiTimer);
      window.__mabV306UiTimer=setTimeout(()=>{enhanceEvolution().catch(error=>console.error(error))},80);
      return;
    }
    clearTimeout(window.__mabV306UiTimer);
    window.__mabV306UiTimer=setTimeout(()=>{
      enhanceExerciseRows().catch(error=>console.error(error));
      enhanceDashboardWeight().catch(error=>console.error(error))
    },80);
  }).observe(app,{childList:true,subtree:true});
  if(modal)new MutationObserver(()=>{enhanceExportForm()}).observe(modal,{childList:true,subtree:true});
  document.addEventListener('click',handleClick,true);
  document.addEventListener('change',handleBodyChartChange,true);
  window.addEventListener('routechange',()=>setTimeout(()=>{enhanceEvolution().catch(error=>console.error(error));enhanceExerciseRows().catch(error=>console.error(error));enhanceDashboardWeight().catch(error=>console.error(error))},140));
  enhanceExportForm();
  enhanceEvolution().catch(error=>console.error(error));
  enhanceExerciseRows().catch(error=>console.error(error));
  enhanceDashboardWeight().catch(error=>console.error(error))
}

observeUi();
window.MAB306={version:'4.2.4',versionName:'Performance & Recovery',toCsv,generateCsv:exportCsv};
export {toCsv};