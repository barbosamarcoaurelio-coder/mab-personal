import {
  repo,
  seed
} from './repositories.js';
import {
  navigate,
  route
} from './router.js';
import {
  elapsed,
  remaining,
  fmt
} from './timer-service.js';
import {
  esc,
  number
} from './validators.js';
import {
  exportBackup,
  downloadBackup,
  importBackup
} from './backup-service.js';

const app = document.querySelector('#app'),
  modal = document.querySelector('#modal'),
  modalContent = document.querySelector('#modalContent'),
  toast = document.querySelector('#toast');
let tick;
let screenWakeLock = null;
async function requestScreenWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    if (screenWakeLock && !screenWakeLock.released) return true;
    screenWakeLock = await navigator.wakeLock.request('screen');
    return true
  } catch (e) {
    return false
  }
}
async function releaseScreenWakeLock() {
  try {
    if (screenWakeLock && !screenWakeLock.released) await screenWakeLock.release()
  } catch (e) {}
  screenWakeLock = null
}

const showToast = m => {
  toast.textContent = m;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800)
};
const activeCycle = async () => (await repo.all('cycles')).find(x => x.status === 'active');
const openSessions = async () => (await repo.all('workoutSessions')).filter(x => x.status === 'in_progress');
const activeRest = async () => (await repo.all('restTimers')).find(x => x.status === 'running');

function setNav() {
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.route === route()))
}

async function dashboard() {
  const assessments = (await repo.all('bodyAssessments')).sort((a, b) => b.date.localeCompare(a.date));
  const sessions = (await repo.all('workoutSessions')).filter(s => s.status === 'completed');
  const activities = await repo.all('activityDiary');
  const month = new Date().toISOString().slice(0, 7);
  const monthly = sessions.filter(s => (s.startedAt || '').startsWith(month));
  const monthlyActivities = activities.filter(a => (a.date || '').startsWith(month));
  const total = monthly.reduce((n, s) => n + elapsed(s.startedAt, s.finishedAt), 0);
  const activityMinutes = monthlyActivities.reduce((n, a) => n + Number(a.durationMinutes || 0), 0);
  const cycle = await activeCycle();
  const recent = [...sessions.map(x => ({
    type: 'strength',
    id: x.id,
    date: (x.startedAt || '').slice(0, 10),
    sortDate: x.startedAt || '',
    title: `Musculação · Treino ${x.groupCode||''}`,
    detail: `${fmt(elapsed(x.startedAt,x.finishedAt))}`
  })), ...activities.map(x => ({
    type: 'activity',
    id: x.id,
    date: x.date || '',
    sortDate: x.date || '',
    title: x.modality,
    detail: `${x.durationMinutes||0} min${x.distanceKm!=null?` · ${x.distanceKm} km`:''}`
  }))].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).slice(0, 10);
  return `<section class="grid dashboard-layout"><div class="stack"><div class="card"><div class="muted">PRÓXIMO TREINO</div><h2>Treino A · Superiores</h2><p class="muted">${cycle?esc(cycle.name):'Nenhum ciclo ativo'}</p><div class="stack"><button class="primary" data-action="start" data-group="A">▶ Iniciar musculação</button><button class="secondary" data-action="new-activity">+ Registrar outra atividade</button></div></div><div class="grid two"><div class="card metric"><span class="muted">Peso atual</span><strong>${assessments[0]?.weight??'--'} kg</strong></div><div class="card metric"><span class="muted">Musculações no mês</span><strong>${monthly.length}</strong></div><div class="card metric"><span class="muted">Outras atividades</span><strong>${monthlyActivities.length}</strong></div><div class="card metric"><span class="muted">Tempo ativo</span><strong>${fmt(total+activityMinutes*60)}</strong></div></div></div><div class="card"><h3>Atividades recentes</h3><div class="recent-activities-list">${recent.map(a=>`<div class="exercise-item" data-detail-kind="${a.type}" data-detail-id="${a.id||''}" style="cursor:pointer"><div><strong>${esc(a.title)}</strong><div class="muted">${esc(a.date)} · ${esc(a.detail)}</div></div>${a.type==='activity'?`<button class="ghost" data-action="edit-activity" data-id="${a.id}">Editar</button>`:'<span class="orange">Concluído</span>'}</div>`).join('')||'<div class="empty">Nenhuma atividade concluída ainda.</div>'}</div><div class="stack" style="margin-top:12px"><button class="ghost" data-route="plan">Editar plano A/B/C/D</button><button class="ghost" data-route="exercises">Biblioteca de exercícios</button><button class="ghost" data-route="evolution">Evolução e histórico</button></div></div></section>`
}

async function workout() {
  const sessions = await openSessions();
  const s = sessions[0];
  if (!s) return `<div class="card"><h2>Executar treino</h2><p class="muted">Selecione o grupo para começar.</p><div class="chips">${['A','B','C','D'].map(g=>`<button class="chip" data-action="start" data-group="${g}">Treino ${g}</button>`).join('')}</div></div>`;
  const items = (await repo.all('planItems')).filter(x => x.cycleId === s.cycleId && x.groupCode === s.groupCode && x.active).sort((a, b) => a.order - b.order);
  const exercises = await repo.all('exercises');
  const sets = await repo.all('executedSets');
  const rest = await activeRest();
  const current = items[Math.min(s.currentIndex || 0, items.length - 1)];
  if (!current) return `<div class="card">Nenhum exercício ativo neste grupo.</div>`;
  const ex = exercises.find(e => e.id === current.exerciseId);
  const exSets = sets.filter(x => x.sessionId === s.id && x.exerciseId === ex.id);
  const rows = Array.from({
    length: Math.max(current.sets, exSets.length)
  }, (_, i) => {
    const saved = exSets.find(x => x.setNumber === i + 1) || {};
    return `<div class="set-row"><strong>${i+1}</strong><label>REPS<input inputmode="numeric" data-set="reps" data-n="${i+1}" value="${saved.reps??''}"></label><label>KG<input inputmode="decimal" data-set="weight" data-n="${i+1}" value="${saved.weight??''}"></label><label>RIR<input inputmode="numeric" data-set="rir" data-n="${i+1}" value="${saved.rir??''}"></label><button class="done" data-action="save-set" data-n="${i+1}">${saved.completed?'✓':'○'}</button></div>`
  }).join('');
  return `<div class="stack"><div class="card row"><div><span class="muted">TREINO ${s.groupCode}</span><div class="muted" id="wakeStatus">${'wakeLock' in navigator?'Tela ativa durante o treino':'Bloqueio de tela controlado pelo sistema'}</div><div id="workoutTimer" class="timer">${fmt(elapsed(s.startedAt))}</div></div><button class="danger" data-action="finish">Finalizar</button></div>${rest?`<div class="card"><span class="orange">DESCANSO</span><div id="restTimer" class="timer">${fmt(remaining(rest.targetEndAt))}</div><div class="chips"><button class="chip" data-action="rest" data-sec="60">60 s</button><button class="chip" data-action="rest" data-sec="90">90 s</button><button class="chip" data-action="rest" data-sec="120">120 s</button><button class="chip" data-action="skip-rest">Pular</button></div></div>`:''}<div class="card"><div class="row"><div><span class="muted">${(s.currentIndex||0)+1}/${items.length}</span><h2>${esc(ex.name)}</h2></div><span class="orange">${current.minReps}-${current.maxReps} reps · RIR ${current.rirTarget}</span></div><div class="stack">${rows}</div><p class="muted">Descanso padrão: ${current.restSeconds}s</p><div class="row"><button class="ghost" data-action="prev">← Anterior</button><button class="primary" data-action="next">Próximo →</button></div></div></div>`
}

async function plan() {
  const cycle = await activeCycle();
  const items = await repo.all('planItems'),
    exercises = await repo.all('exercises');
  const group = localStorage.getItem('mab-plan-group') || 'A';
  const list = items.filter(x => x.cycleId === cycle?.id && x.groupCode === group && x.active).sort((a, b) => a.order - b.order);
  return `<div class="stack"><div class="card"><div class="row"><div><span class="muted">CICLO ATUAL</span><h2>${esc(cycle?.name||'Sem ciclo')}</h2></div><button class="primary" data-action="add-plan-item">+ Adicionar ao treino</button></div><div class="chips">${['A','B','C','D'].map(g=>`<button class="chip ${g===group?'active':''}" data-action="plan-group" data-group="${g}">Treino ${g}</button>`).join('')}</div></div><div class="card"><h3>Treino ${group}</h3>${list.map(i=>{const e=exercises.find(x=>x.id===i.exerciseId);return `<div class="exercise-item"><div><strong>${esc(e?.name)}</strong><div class="muted">${i.sets} séries · ${i.minReps}-${i.maxReps} reps · ${i.restSeconds}s</div></div><div class="row"><button class="ghost" data-action="move-plan-up" data-id="${i.id}" aria-label="Mover ${esc(e?.name)} para cima">↑</button><button class="ghost" data-action="move-plan-down" data-id="${i.id}" aria-label="Mover ${esc(e?.name)} para baixo">↓</button><button class="ghost" data-action="edit-plan-item" data-id="${i.id}">Editar</button><button class="chip active" data-action="toggle-plan" data-id="${i.id}">Inativar</button></div></div>`}).join('')||'<div class="empty">Nenhum exercício.</div>'}</div></div>`
}

async function exercises() {
  const list = (await repo.all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {
    sensitivity: 'base'
  }));
  return `<div class="stack"><div class="row"><h2>Exercícios</h2><button class="primary" data-action="new-exercise">+ Cadastrar</button></div><div class="card"><input id="exerciseSearch" aria-label="Pesquisar exercícios" placeholder="Pesquisar" style="width:100%;padding:12px;border-radius:10px;border:1px solid #383838;background:#0e0e0e;color:#fff"><div id="exerciseList">${list.map(e=>exerciseRow(e)).join('')}</div></div></div>`
}

function exerciseRow(e) {
  return `<div class="exercise-item" data-name="${esc(e.name.toLowerCase())}"><div><strong>${esc(e.name)}</strong><div class="muted">${esc(e.muscleGroup)} · ${esc(e.equipment)}</div></div><button class="ghost" data-action="edit-exercise" data-id="${e.id}">Editar</button></div>`
}

async function evolution() {
  const list = (await repo.all('bodyAssessments')).sort((a, b) => a.date.localeCompare(b.date));
  const activities = (await repo.all('activityDiary')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latest = list.at(-1);
  const previous = list.length > 1 ? list.at(-2) : null;
  const max = Math.max(...list.map(x => x.weight || 0), 1),
    min = Math.min(...list.map(x => x.weight || 0), max);
  const fmtMetric = (v, u = '') => v == null || v === '' ? '--' : `${v}${u}`;
  const delta = (key, u = '') => {
    if (!latest || !previous || latest[key] == null || previous[key] == null) return '';
    const d = Number(latest[key]) - Number(previous[key]);
    return `<div class="muted">${d>0?'+':''}${d.toFixed(1)}${u} vs anterior</div>`
  };
  return `<div class="stack"><div class="row"><h2>Evolução</h2><button class="primary" data-action="new-assessment">+ Avaliação</button></div><div class="card"><h3>Composição corporal atual</h3><div class="grid two"><div class="metric"><span class="muted">Peso</span><strong>${fmtMetric(latest?.weight,' kg')}</strong>${delta('weight',' kg')}</div><div class="metric"><span class="muted">Massa magra</span><strong>${fmtMetric(latest?.leanMass,' kg')}</strong>${delta('leanMass',' kg')}</div><div class="metric"><span class="muted">Massa gorda</span><strong>${fmtMetric(latest?.fatMass,' kg')}</strong>${delta('fatMass',' kg')}</div><div class="metric"><span class="muted">Gordura corporal</span><strong>${fmtMetric(latest?.bodyFat,'%')}</strong>${delta('bodyFat',' p.p.')}</div><div class="metric"><span class="muted">Circunferência abdominal</span><strong>${fmtMetric(latest?.waistCm,' cm')}</strong>${delta('waistCm',' cm')}</div><div class="metric"><span class="muted">Data da avaliação</span><strong>${latest?.date||'--'}</strong></div></div></div><div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3>Evolução corporal</h3><select id="bodyChartMetric" aria-label="Indicador do gráfico" style="background:#0e0e0e;color:#fff;border:1px solid #383838;border-radius:10px;padding:10px;max-width:100%;min-width:0"><option value="weight">Peso</option><option value="leanMass">Massa magra</option><option value="fatMass">Massa gorda</option><option value="bodyFat">% gordura</option><option value="waistCm">Circunferência</option></select></div><div id="bodyChart"></div></div><div class="card"><h3>Histórico corporal</h3>${[...list].reverse().map(x=>`<div class="exercise-item"><div><strong>${x.weight!=null?`${x.weight} kg`:'— kg'}</strong><div class="muted">${esc(x.date)}</div><div class="muted">Magra: ${fmtMetric(x.leanMass,' kg')} · Gorda: ${fmtMetric(x.fatMass,' kg')} · Abdômen: ${fmtMetric(x.waistCm,' cm')}</div></div><span>${fmtMetric(x.bodyFat,'% gordura')}</span></div>`).join('')||'<div class="empty">Sem avaliações.</div>'}</div><div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3>Atividades registradas</h3><select id="activityChartMetric" aria-label="Indicador do gráfico de atividades" style="background:#0e0e0e;color:#fff;border:1px solid #383838;border-radius:10px;padding:10px;max-width:100%;min-width:0;width:100%"><option value="duration">Tempo ativo (minutos)</option><option value="calories">Calorias (kcal)</option><option value="distance">Distância (km)</option><option value="frequency">Frequência de Atividades e Exercícios</option><option value="frequency_modalities">Frequência por modalidade</option><option value="frequency_exercises">Frequência por exercício</option></select></div><div id="activityChart"></div></div><div class="card"><h3>Exportar para análise</h3><p class="muted">Gere um arquivo de texto com exercícios, séries, cargas e atividades por intervalo de datas.</p><button class="secondary" data-action="export-period">Exportar treinos por período</button></div></div>`
}

function renderBodyChart(metric = 'weight') {
  const target = document.querySelector('#bodyChart');
  if (!target) return;
  repo.all('bodyAssessments').then(rows => {
    const list = rows.sort((a, b) => a.date.localeCompare(b.date));
    const meta = {
      weight: ['Peso', 'kg'],
      leanMass: ['Massa magra', 'kg'],
      fatMass: ['Massa gorda', 'kg'],
      bodyFat: ['% Gordura', '%'],
      waistCm: ['Abdômen', 'cm']
    } [metric];
    const points = list.filter(x => x[metric] != null && x[metric] !== '').map(x => ({
      date: x.date,
      value: Number(x[metric])
    }));
    if (!points.length) {
      target.innerHTML = '<div class="empty">Sem dados suficientes para este indicador.</div>';
      return
    }
    const values = points.map(x => x.value),
      max = Math.max(...values),
      min = Math.min(...values),
      range = max - min || 1;
    target.innerHTML = `<div class="chart">${points.map(x=>`<i class="bar" title="${x.date}: ${x.value} ${meta[1]}" style="height:${25+75*((x.value-min)/range)}%"></i>`).join('')}</div><div class="row muted"><span>${esc(points[0].date)}</span><strong>${meta[0]}</strong><span>${esc(points.at(-1).date)}</span></div>`
  }).catch(() => {
    target.innerHTML = '<div class="empty">Não foi possível carregar o gráfico.</div>'
  })
}

let actChartPeriod = '7d';
let actChartSubView = 'all';

function isDateInPeriod(dateStr, period = '7d') {
  if (!dateStr) return false;
  const now = new Date();
  if (period === 'month') {
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    return String(dateStr).slice(0, 7) === `${curYear}-${curMonth}`;
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  const startStr = `${y}-${m}-${d}`;
  return String(dateStr).slice(0, 10) >= startStr;
}

async function renderActivityChart(metric = 'duration') {
  const target = document.querySelector('#activityChart');
  if (!target) return;
  try {
    const sessions = (await repo.all('workoutSessions')).filter(s => s.status === 'completed');
    const activities = await repo.all('activityDiary');

    if (metric.startsWith('frequency')) {
      const allSets = await repo.all('executedSets');
      const exercises = await repo.all('exercises');
      const exMap = new Map(exercises.map(e => [e.id, e]));

      // 1. Frequência geral por modalidade no período
      const periodSessions = sessions.filter(s => isDateInPeriod((s.startedAt || '').slice(0, 10), actChartPeriod));
      const periodActivities = activities.filter(a => isDateInPeriod(a.date, actChartPeriod));

      const modalityCounts = {};
      if (periodSessions.length > 0) {
        modalityCounts['Musculação'] = periodSessions.length;
      }
      for (const a of periodActivities) {
        const mod = (a.modality || 'Outra').trim();
        modalityCounts[mod] = (modalityCounts[mod] || 0) + 1;
      }

      const sortedModalities = Object.entries(modalityCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
      const totalActivities = Object.values(modalityCounts).reduce((s, c) => s + c, 0);

      // 2. Frequência por exercício no período
      const periodSessionIds = new Set(periodSessions.map(s => s.id));
      const periodSets = allSets.filter(s => s.completed === true && periodSessionIds.has(s.sessionId));

      const exerciseCounts = {};
      for (const set of periodSets) {
        const ex = exMap.get(set.exerciseId);
        const name = ex?.name || 'Exercício ' + (set.exerciseId ? set.exerciseId.slice(0, 6) : '');
        exerciseCounts[name] = (exerciseCounts[name] || 0) + 1;
      }

      const sortedExercises = Object.entries(exerciseCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
      const totalSets = periodSets.length;

      const periodLabel = actChartPeriod === 'month' ? 'neste mês' : 'nos últimos 7 dias';

      // 3. Visualização em barras limpas com contagem e percentual
      let modalitiesHtml = '';
      if (!sortedModalities.length) {
        modalitiesHtml = `<div class="empty" style="padding:16px">Nenhuma atividade registrada ${periodLabel}.</div>`;
      } else {
        modalitiesHtml = `<div class="stack" style="gap:10px">
          ${sortedModalities.map(([mod, cnt]) => {
            const pct = Math.round((cnt / totalActivities) * 100);
            return `<div>
              <div class="row" style="margin-bottom:4px;font-size:13px">
                <strong>${esc(mod)}</strong>
                <span class="muted">${cnt} ${cnt === 1 ? 'sessão' : 'sessões'} (${pct}%)</span>
              </div>
              <div class="progress" style="height:9px"><i style="width:${pct}%"></i></div>
            </div>`;
          }).join('')}
        </div>
        <div class="row muted" style="margin-top:10px;font-size:12px">
          <span>${sortedModalities.length} ${sortedModalities.length === 1 ? 'modalidade' : 'modalidades'}</span>
          <strong>Total: ${totalActivities} ${totalActivities === 1 ? 'atividade' : 'atividades'}</strong>
        </div>`;
      }

      let exercisesHtml = '';
      if (!sortedExercises.length) {
        const emptyMsg = periodSessions.length === 0
          ? `Nenhum treino de musculação ${periodLabel}.`
          : `Nenhuma série de musculação concluída ${periodLabel}.`;
        exercisesHtml = `<div class="empty" style="padding:16px">${emptyMsg}</div>`;
      } else {
        exercisesHtml = `<div class="stack" style="gap:10px">
          ${sortedExercises.map(([exName, cnt]) => {
            const pct = Math.round((cnt / totalSets) * 100);
            return `<div>
              <div class="row" style="margin-bottom:4px;font-size:13px">
                <strong>${esc(exName)}</strong>
                <span class="muted">${cnt} ${cnt === 1 ? 'série executada' : 'séries executadas'} (${pct}%)</span>
              </div>
              <div class="progress" style="height:9px"><i style="width:${pct}%"></i></div>
            </div>`;
          }).join('')}
        </div>
        <div class="row muted" style="margin-top:10px;font-size:12px">
          <span>${sortedExercises.length} ${sortedExercises.length === 1 ? 'exercício' : 'exercícios'}</span>
          <strong>Total: ${totalSets} ${totalSets === 1 ? 'série' : 'séries'}</strong>
        </div>`;
      }

      let contentHtml = '';
      if (actChartSubView === 'modalities') {
        contentHtml = modalitiesHtml;
      } else if (actChartSubView === 'exercises') {
        contentHtml = exercisesHtml;
      } else {
        contentHtml = `
          <div>
            <div class="row" style="margin-bottom:8px;font-size:12px;color:#ff851b;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
              <span>Modalidades no período</span>
            </div>
            ${modalitiesHtml}
          </div>
          <div style="margin-top:18px;border-top:1px solid #2a2a2a;padding-top:14px">
            <div class="row" style="margin-bottom:8px;font-size:12px;color:#ff851b;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
              <span>Exercícios de musculação</span>
            </div>
            ${exercisesHtml}
          </div>
        `;
      }

      target.innerHTML = `
        <div class="chips" style="margin:10px 0 8px;min-width:0;max-width:100%">
          <button type="button" class="chip ${actChartPeriod==='7d'?'active':''}" data-act-period="7d">Últimos 7 dias</button>
          <button type="button" class="chip ${actChartPeriod==='month'?'active':''}" data-act-period="month">Mês atual</button>
        </div>
        <div class="chips" style="margin-bottom:14px;min-width:0;max-width:100%">
          <button type="button" class="chip ${actChartSubView==='all'?'active':''}" data-act-subview="all">Visão geral</button>
          <button type="button" class="chip ${actChartSubView==='modalities'?'active':''}" data-act-subview="modalities">Por modalidade</button>
          <button type="button" class="chip ${actChartSubView==='exercises'?'active':''}" data-act-subview="exercises">Por exercício</button>
        </div>
        ${contentHtml}
      `;
      return;
    }

    const strengthItems = sessions.map(s => {
      const durSec = elapsed(s.startedAt, s.finishedAt);
      const minutes = Math.round((durSec > 0 ? durSec : (Number(s.durationSeconds) || 0)) / 60);
      return {
        date: (s.startedAt || '').slice(0, 10),
        modality: 'Musculação',
        durationMinutes: minutes,
        calories: s.calories != null ? Number(s.calories) : null,
        distanceKm: null
      };
    });

    const otherItems = activities.map(a => ({
      date: a.date || '',
      modality: a.modality || 'Outra',
      durationMinutes: Number(a.durationMinutes || 0),
      calories: a.calories != null ? Number(a.calories) : null,
      distanceKm: a.distanceKm != null ? Number(a.distanceKm) : null
    }));

    const all = [...strengthItems, ...otherItems].filter(x => x.date);

    if (!all.length) {
      target.innerHTML = '<div class="empty">Nenhuma atividade registrada ainda.</div>';
      return;
    }

    const byDate = new Map();
    for (const item of all) {
      const d = item.date;
      if (!byDate.has(d)) {
        byDate.set(d, { duration: 0, calories: 0, distance: 0, hasCalories: false, hasDistance: false });
      }
      const rec = byDate.get(d);
      rec.duration += item.durationMinutes;
      if (item.calories != null) {
        rec.calories += item.calories;
        rec.hasCalories = true;
      }
      if (item.distanceKm != null) {
        rec.distance += item.distanceKm;
        rec.hasDistance = true;
      }
    }

    const sortedDates = [...byDate.keys()].sort();
    const meta = {
      duration: ['Tempo ativo', 'min', v => `${Math.round(v)} min`],
      calories: ['Calorias', 'kcal', v => `${Math.round(v)} kcal`],
      distance: ['Distância', 'km', v => `${Number(v.toFixed(1))} km`]
    }[metric];

    let points = [];
    if (metric === 'duration') {
      points = sortedDates.map(d => ({ date: d, value: byDate.get(d).duration })).filter(p => p.value > 0);
    } else if (metric === 'calories') {
      points = sortedDates.map(d => ({ date: d, value: byDate.get(d).calories, has: byDate.get(d).hasCalories })).filter(p => p.has && p.value > 0);
    } else if (metric === 'distance') {
      points = sortedDates.map(d => ({ date: d, value: byDate.get(d).distance, has: byDate.get(d).hasDistance })).filter(p => p.has && p.value > 0);
    }

    if (!points.length) {
      target.innerHTML = `<div class="empty">Sem dados suficientes para ${meta[0].toLowerCase()}.</div>`;
      return;
    }

    const displayPoints = points.length > 20 ? points.slice(-20) : points;
    const values = displayPoints.map(p => p.value);
    const max = Math.max(...values);
    const totalVal = points.map(p => p.value).reduce((s, v) => s + v, 0);
    const fmtD = d => d.slice(8, 10) + '/' + d.slice(5, 7);

    target.innerHTML = `<div class="chart">${displayPoints.map(p => {
      const h = max > 0 ? Math.max(8, Math.round(100 * (p.value / max))) : 20;
      return `<i class="bar" title="${fmtD(p.date)}: ${meta[2](p.value)}" style="height:${h}%"></i>`;
    }).join('')}</div>
    <div class="row muted" style="margin-top:6px;font-size:12px">
      <span>${fmtD(displayPoints[0].date)}</span>
      <strong>${meta[0]}: ${meta[2](totalVal)}</strong>
      <span>${fmtD(displayPoints.at(-1).date)}</span>
    </div>`;
  } catch (err) {
    target.innerHTML = '<div class="empty">Não foi possível carregar o gráfico.</div>';
  }
}

async function render() {
  clearInterval(tick);
  setNav();
  const views = {
    dashboard,
    workout,
    plan,
    exercises,
    evolution
  };
  app.innerHTML = await views[route()]();
  if (route() === 'workout') tick = setInterval(async () => {
    const wt = document.querySelector('#workoutTimer'),
      rt = document.querySelector('#restTimer'),
      s = (await openSessions())[0],
      r = await activeRest();
    if (wt && s) wt.textContent = fmt(elapsed(s.startedAt));
    if (rt && r) {
      const rem = remaining(r.targetEndAt);
      rt.textContent = fmt(rem);
      if (rem <= 0) {
        r.status = 'completed';
        r.endedAt = new Date().toISOString();
        r.actualDurationSeconds = Math.max(0, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000));
        r.endReason = 'timer';
        await repo.put('restTimers', r);
        showToast('Pronto para a próxima série');
        render()
      }
    }
  }, 1000);
  bindDynamic();
  if (route() === 'evolution') {
    renderBodyChart('weight');
    document.querySelector('#bodyChartMetric')?.addEventListener('change', e => renderBodyChart(e.target.value));
    renderActivityChart(document.querySelector('#activityChartMetric')?.value || 'duration');
    document.querySelector('#activityChartMetric')?.addEventListener('change', e => {
      const val = e.target.value;
      if (val === 'frequency_modalities') {
        actChartSubView = 'modalities';
        renderActivityChart('frequency');
      } else if (val === 'frequency_exercises') {
        actChartSubView = 'exercises';
        renderActivityChart('frequency');
      } else if (val === 'frequency') {
        actChartSubView = 'all';
        renderActivityChart('frequency');
      } else {
        renderActivityChart(val);
      }
    });
  }
}

function bindDynamic() {
  document.querySelector('#exerciseSearch')?.addEventListener('input', e => document.querySelectorAll('#exerciseList [data-name]').forEach(n => n.hidden = !n.dataset.name.includes(e.target.value.toLowerCase())))
}
async function start(group) {
  const existing = (await openSessions())[0];
  if (existing) {
    navigate('workout');
    return
  }
  const cycle = await activeCycle();
  if (!cycle) return showToast('Crie um ciclo ativo.');
  const date = new Date().toISOString().slice(0, 10);
  const recovery = (await repo.all('dailyRecovery')).find(x => x.date === date);
  const sleepHM = v => { const s = String(v ?? '').trim().replace(',', '.'); if (!s) return null; const m = s.match(/^(\d{1,2})[:hH](\d{1,2})$/); let h; if (m) { if (Number(m[2]) > 59) return null; h = Number(m[1]) + Number(m[2]) / 60 } else { if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null; h = Number(s) } return h >= 0 && h <= 24 ? Math.round(h * 100) / 100 : null };
  const sleepHMInput = v => { if (v == null || !Number.isFinite(Number(v))) return ''; const t = Math.round(Number(v) * 60), h = Math.floor(t / 60), m = t % 60; return `${h}:${String(m).padStart(2, '0')}` };
  modalContent.innerHTML = `<form id="preWorkoutForm" class="stack"><div class="row"><h2>Disposição e Sono</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">Preencha rapidamente ou pule. O Treino ${group} e o plano permanecem iguais.</p><label class="field">Disposição antes do treino · 1–5<input name="readinessBefore" type="number" min="1" max="5" inputmode="numeric" placeholder="Não informar"></label><label class="field">Sono na noite anterior · hh:mm<input name="sleepHoursBefore" type="text" value="${sleepHMInput(recovery?.sleepHours)}" placeholder="Ex.: 7:30"><small class="muted">Horas e minutos — ex.: 7:30. Deixe vazio para não informar.</small></label><div class="row"><button type="button" class="ghost" id="skipPreWorkout">Pular</button><button class="primary">Começar Treino ${group}</button></div></form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  const createSession = async (includeCheckin) => {
    const form = modalContent.querySelector('#preWorkoutForm');
    const readinessValue = includeCheckin ? form.elements.readinessBefore.value.trim() : '';
    const sleepValue = includeCheckin ? form.elements.sleepHoursBefore.value.trim() : '';
    const sleepParsed = sleepHM(sleepValue);
    let recoveryRecord = recovery;
    if (sleepParsed != null) {
      recoveryRecord = { ...(recovery || {}), id: recovery?.id || repo.uuid(), date, sleepHours: sleepParsed, updatedAt: new Date().toISOString(), createdAt: recovery?.createdAt || new Date().toISOString() };
      await repo.put('dailyRecovery', recoveryRecord);
    }
    await requestScreenWakeLock();
    await repo.put('workoutSessions', {
      id: repo.uuid(),
      cycleId: cycle.id,
      groupCode: group,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      currentIndex: 0,
      readinessBefore: readinessValue ? number(readinessValue, 1, 5) : null,
      sleepHoursBefore: sleepParsed,
      dailyRecoveryId: recoveryRecord?.id || null
    });
    modal.close();
    navigate('workout')
  };
  modalContent.querySelector('#skipPreWorkout').onclick = () => createSession(false).catch(e => showToast(e.message));
  modalContent.querySelector('#preWorkoutForm').onsubmit = e => {
    e.preventDefault();
    createSession(true).catch(error => showToast(error.message))
  }
}
async function saveSet(n) {
  const s = (await openSessions())[0],
    items = (await repo.all('planItems')).filter(x => x.cycleId === s.cycleId && x.groupCode === s.groupCode && x.active).sort((a, b) => a.order - b.order),
    item = items[s.currentIndex || 0];
  const repsValue = document.querySelector(`[data-set=reps][data-n="${n}"]`)?.value.trim();
  if (!repsValue) {
    showToast('Informe as repetições para concluir a série.');
    return
  }
  const optionalNumber = (selector, max) => {
    const value = document.querySelector(selector)?.value.trim();
    return value ? number(value, 0, max) : null
  };
  const reps = number(repsValue, 1, 100),
    weight = optionalNumber(`[data-set=weight][data-n="${n}"]`, 1000),
    rir = optionalNumber(`[data-set=rir][data-n="${n}"]`, 20);
  const sets = await repo.all('executedSets');
  const old = sets.find(x => x.sessionId === s.id && x.exerciseId === item.exerciseId && x.setNumber === n);
  const previousSet = sets.filter(x => x.sessionId === s.id && x.exerciseId === item.exerciseId && x.completed === true && x.setNumber < n).sort((a, b) => b.setNumber - a.setNumber)[0];
  const completedAt = new Date().toISOString();
  const previousCompletedAt = Date.parse(previousSet?.completedAt || '');
  const restSecondsBefore = Number.isFinite(previousCompletedAt) ? Math.max(0, Math.round((Date.parse(completedAt) - previousCompletedAt) / 1000)) : null;
  await repo.put('executedSets', {
    id: old?.id || repo.uuid(),
    sessionId: s.id,
    exerciseId: item.exerciseId,
    setNumber: n,
    reps,
    weight,
    rir,
    completed: true,
    completedAt,
    restSecondsBefore
  });
  await beginRest(item.restSeconds || 90, s, item);
  showToast('Série salva');
  render()
}
async function beginRest(sec, s, item) {
  const started = new Date();
  for (const r of (await repo.all('restTimers')).filter(x => x.status === 'running')) {
    r.status = 'cancelled';
    r.endedAt = started.toISOString();
    r.actualDurationSeconds = Math.max(0, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000));
    r.endReason = 'restarted';
    await repo.put('restTimers', r)
  }
  await repo.put('restTimers', {
    id: repo.uuid(),
    sessionId: s.id,
    exerciseId: item.exerciseId,
    startedAt: started.toISOString(),
    durationSeconds: sec,
    targetEndAt: new Date(started.getTime() + sec * 1000).toISOString(),
    status: 'running',
    endedAt: null,
    actualDurationSeconds: null,
    endReason: null
  })
}

function exerciseForm(e = {}, addToCurrentPlan = false) {
  modalContent.innerHTML = `<form id="exerciseForm" class="stack"><div class="row"><h2>${e.id?'Editar':'Novo'} exercício</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Nome<input name="name" required value="${esc(e.name)}"></label><label class="field">Grupo muscular<input name="muscleGroup" required value="${esc(e.muscleGroup)}"></label><label class="field">Equipamento<input name="equipment" required value="${esc(e.equipment)}"></label><label class="field">Vídeo/link<input name="videoUrl" value="${esc(e.videoUrl)}"></label><label class="field">Observações<textarea name="notes">${esc(e.notes)}</textarea></label><button class="primary">Salvar exercício</button></form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target),
      name = fd.get('name').trim(),
      now = new Date().toISOString();
    const saved = {
      ...e,
      id: e.id || repo.uuid(),
      name,
      name,
      nameNormalized: name.toLowerCase(),
      muscleGroup: fd.get('muscleGroup'),
      equipment: fd.get('equipment'),
      videoUrl: fd.get('videoUrl'),
      notes: fd.get('notes'),
      active: e.active ?? true,
      createdAt: e.createdAt || now,
      updatedAt: now
    };
    await repo.put('exercises', saved);
    modal.close();
    if (addToCurrentPlan) {
      const cycle = await activeCycle();
      const group = localStorage.getItem('mab-plan-group') || 'A';
      const items = await repo.all('planItems');
      const same = items.filter(x => x.cycleId === cycle.id && x.groupCode === group);
      await repo.put('planItems', {
        id: repo.uuid(),
        cycleId: cycle.id,
        groupCode: group,
        exerciseId: saved.id,
        order: Math.max(0, ...same.map(x => x.order || 0)) + 1,
        sets: 3,
        minReps: 8,
        maxReps: 12,
        rirTarget: 2,
        restSeconds: 90,
        active: true,
        createdAt: now,
        updatedAt: now
      });
      showToast('Exercício criado e adicionado ao Treino ' + group)
    } else showToast('Exercício salvo');
    render()
  }
}

function planItemForm(existing = null) {
  Promise.all([activeCycle(), repo.all('exercises'), repo.all('planItems')]).then(([cycle, exercises, items]) => {
    const group = localStorage.getItem('mab-plan-group') || 'A';
    if (!cycle) {
      showToast('Crie ou ative um ciclo antes de montar o plano.');
      return
    }
    const used = new Set(items.filter(x => x.cycleId === cycle.id && x.groupCode === group && x.id !== existing?.id).map(x => x.exerciseId));
    const available = exercises.filter(x => x.active !== false && (!used.has(x.id) || x.id === existing?.exerciseId));
    if (!available.length && !existing) {
      showToast('Todos os exercícios já estão no Treino ' + group + '.');
      return
    }
    const selectedId = existing?.exerciseId || available[0]?.id || '';
    const options = available.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(x => `<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)}</option>`).join('');
    modalContent.innerHTML = `<form id="planItemForm" class="stack"><div class="row"><h2>${existing?'Editar':'Adicionar ao'} Treino ${group}</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Exercício<select name="exerciseId" required>${options}</select></label><div class="grid two"><label class="field">Séries<input name="sets" type="number" inputmode="numeric" min="1" max="20" required value="${existing?.sets??3}"></label><label class="field">RIR alvo<input name="rirTarget" type="number" inputmode="numeric" min="0" max="10" required value="${existing?.rirTarget??2}"></label><label class="field">Reps mínimas<input name="minReps" type="number" inputmode="numeric" min="1" max="100" required value="${existing?.minReps??8}"></label><label class="field">Reps máximas<input name="maxReps" type="number" inputmode="numeric" min="1" max="100" required value="${existing?.maxReps??12}"></label></div><label class="field">Descanso padrão (segundos)<input name="restSeconds" type="number" inputmode="numeric" min="15" max="600" step="15" required value="${existing?.restSeconds??90}"></label><label class="field">Status<select name="active"><option value="true" ${(existing?.active??true)?'selected':''}>Ativo</option><option value="false" ${existing?.active===false?'selected':''}>Inativo</option></select></label><button class="primary">${existing?'Salvar alterações':'Adicionar ao Treino '+group}</button><button type="button" class="ghost" id="createAndAdd">Cadastrar novo exercício</button>${existing?'<button type="button" class="danger" id="removePlanItem">Remover somente deste plano</button>':''}</form>`;
    modal.showModal();
    modalContent.querySelector('[data-close]').onclick = () => modal.close();
    modalContent.querySelector('#createAndAdd').onclick = () => {
      modal.close();
      exerciseForm({}, true)
    };
    modalContent.querySelector('#removePlanItem')?.addEventListener('click', async () => {
      if (!confirm('Remover este exercício do Treino ' + group + '? O histórico será preservado.')) return;
      await repo.remove('planItems', existing.id);
      modal.close();
      showToast('Exercício removido do plano');
      render()
    });
    modalContent.querySelector('form').onsubmit = async ev => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const minReps = number(f.get('minReps'), 1, 100),
        maxReps = number(f.get('maxReps'), 1, 100);
      if (maxReps < minReps) {
        showToast('Repetições máximas devem ser maiores ou iguais às mínimas.');
        return
      }
      const same = items.filter(x => x.cycleId === cycle.id && x.groupCode === group);
      const now = new Date().toISOString();
      await repo.put('planItems', {
        id: existing?.id || repo.uuid(),
        cycleId: cycle.id,
        groupCode: group,
        exerciseId: f.get('exerciseId'),
        order: existing?.order ?? (Math.max(0, ...same.map(x => x.order || 0)) + 1),
        sets: number(f.get('sets'), 1, 20),
        minReps,
        maxReps,
        rirTarget: number(f.get('rirTarget'), 0, 10),
        restSeconds: number(f.get('restSeconds'), 15, 600),
        active: f.get('active') === 'true',
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
      modal.close();
      showToast('Treino ' + group + ' atualizado');
      render()
    }
  }).catch(e => showToast(e.message))
}

function assessmentChoiceDialog() {
  modalContent.innerHTML = `<div class="stack">
    <div class="row"><h2>Nova avaliação</h2><button type="button" class="ghost" data-close>✕</button></div>
    <p class="muted">Escolha o formato da avaliação corporal:</p>
    <div class="stack" style="gap:10px;margin-top:6px">
      <button class="secondary" id="btnWeightOnly" type="button" style="text-align:left;display:flex;flex-direction:column;gap:4px;padding:14px 16px">
        <strong>⚖ Apenas Peso</strong>
        <span class="muted" style="font-size:12px">Formulário enxuto contendo apenas data e peso corporal (kg).</span>
      </button>
      <button class="primary" id="btnFullAssessment" type="button" style="text-align:left;display:flex;flex-direction:column;gap:4px;padding:14px 16px">
        <strong>📊 Bioimpedância Completa</strong>
        <span style="font-size:12px;opacity:.9">Formulário completo com peso, composição corporal e circunferências.</span>
      </button>
    </div>
  </div>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('#btnWeightOnly').onclick = () => weightOnlyForm();
  modalContent.querySelector('#btnFullAssessment').onclick = () => assessmentForm();
}

function weightOnlyForm() {
  modalContent.innerHTML = `<form id="weightOnlyForm" class="stack">
    <div class="row"><h2>Registrar peso</h2><button type="button" class="ghost" data-close>✕</button></div>
    <label class="field">Data<input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label>
    <label class="field">Peso corporal (kg)<input name="weight" type="number" min="0" max="1000" step="0.1" inputmode="decimal" placeholder="Ex.: 75.5" required autofocus></label>
    <button class="primary">Salvar peso</button>
  </form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const raw = String(f.get('weight') ?? '').trim().replace(',', '.');
    const weightVal = raw === '' ? null : number(raw, 0, 1000);
    await repo.put('bodyAssessments', {
      id: repo.uuid(),
      date: f.get('date'),
      weight: weightVal,
      leanMass: null,
      fatMass: null,
      bodyFat: null,
      abdomenCm: null,
      waistCm: null,
      waistCircumferenceCm: null,
      hipCm: null,
      bicepsLeftCm: null,
      bicepsRightCm: null,
      forearmLeftCm: null,
      forearmRightCm: null,
      thighLeftCm: null,
      thighRightCm: null,
      calfLeftCm: null,
      calfRightCm: null,
      createdAt: new Date().toISOString()
    });
    modal.close();
    showToast('Peso salvo com sucesso');
    render();
  };
}

function assessmentForm() {
  modalContent.innerHTML = `<form id="assessmentForm" class="stack">
    <div class="row"><h2>Nova avaliação</h2><button type="button" class="ghost" data-close>✕</button></div>
    <label class="field">Data<input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label>
    <div class="grid two">
      <label class="field">Peso corporal (kg)<input name="weight" type="number" min="0" max="1000" step="0.1" inputmode="decimal"></label>
      <label class="field">% Gordura<input name="bodyFat" type="number" min="0" max="100" step="0.1" inputmode="decimal"></label>
      <label class="field">Massa gorda (kg)<input name="fatMass" type="number" min="0" max="1000" step="0.1" inputmode="decimal"></label>
      <label class="field">Massa magra (kg)<input name="leanMass" type="number" min="0" max="1000" step="0.1" inputmode="decimal"></label>
    </div>
    <h3>Membros (cm)</h3>
    <div class="grid two">
      <label class="field">Bíceps esquerdo<input name="bicepsLeftCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Bíceps direito<input name="bicepsRightCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Antebraço esquerdo<input name="forearmLeftCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Antebraço direito<input name="forearmRightCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Coxa esquerda<input name="thighLeftCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Coxa direita<input name="thighRightCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Panturrilha esquerda<input name="calfLeftCm" type="number" min="0" max="300" step="0.1"></label>
      <label class="field">Panturrilha direita<input name="calfRightCm" type="number" min="0" max="300" step="0.1"></label>
    </div>
    <h3>Tronco (cm)</h3>
    <p class="muted">Meça em pé, sem prender a respiração, com a fita paralela ao chão.</p>
    <div class="grid two">
      <label class="field">Abdômen<input name="abdomenCm" type="number" min="0" max="500" step="0.1"><small class="muted">Fita na altura do umbigo, com o abdômen relaxado (sem contrair).</small></label>
      <label class="field">Cintura<input name="waistCircumferenceCm" type="number" min="0" max="500" step="0.1"><small class="muted">Parte mais estreita do tronco, geralmente um pouco acima do umbigo.</small></label>
      <label class="field">Quadril<input name="hipCm" type="number" min="0" max="500" step="0.1"><small class="muted">Parte mais larga dos glúteos, com os pés juntos.</small></label>
    </div>
    <p class="muted">Preencha apenas o que foi medido. Campos vazios não são salvos como zero.</p>
    <button class="primary">Salvar avaliação</button>
  </form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target),
      val = (k, max = 1000) => {
        const raw = String(f.get(k) ?? '').trim().replace(',', '.');
        return raw === '' ? null : number(raw, 0, max)
      },
      abdomenCm = val('abdomenCm', 500);
    await repo.put('bodyAssessments', {
      id: repo.uuid(),
      date: f.get('date'),
      weight: val('weight'),
      leanMass: val('leanMass'),
      fatMass: val('fatMass'),
      bodyFat: val('bodyFat', 100),
      abdomenCm,
      waistCm: abdomenCm,
      waistCircumferenceCm: val('waistCircumferenceCm', 500),
      hipCm: val('hipCm', 500),
      bicepsLeftCm: val('bicepsLeftCm', 300),
      bicepsRightCm: val('bicepsRightCm', 300),
      forearmLeftCm: val('forearmLeftCm', 300),
      forearmRightCm: val('forearmRightCm', 300),
      thighLeftCm: val('thighLeftCm', 300),
      thighRightCm: val('thighRightCm', 300),
      calfLeftCm: val('calfLeftCm', 300),
      calfRightCm: val('calfRightCm', 300),
      createdAt: new Date().toISOString()
    });
    modal.close();
    showToast('Avaliação salva');
    render()
  }
}

function activityForm(a = {}) {
  const modalities = ['Pilates', 'Jiu Jitsu', 'Bicicleta', 'Esteira', 'Caminhada/Corrida', 'TRX', 'Outra'];
  modalContent.innerHTML = `<form id="activityForm" class="stack"><div class="row"><h2>${a.id?'Editar':'Nova'} atividade</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Modalidade<select name="modality">${modalities.map(m=>`<option ${a.modality===m?'selected':''}>${m}</option>`).join('')}</select></label><label class="field">Nome personalizado (use se escolher Outra)<input name="customModality" value="${esc(a.customModality||'')}"></label><div class="grid two"><label class="field">Data<input name="date" type="date" required value="${a.date||new Date().toISOString().slice(0,10)}"></label><label class="field">Duração (min)<input name="durationMinutes" type="number" inputmode="numeric" min="1" max="1440" required value="${a.durationMinutes??60}"></label><label class="field">Distância (km, opcional)<input name="distanceKm" inputmode="decimal" value="${a.distanceKm??''}"></label><label class="field">Calorias (opcional)<input name="calories" inputmode="numeric" value="${a.calories??''}"></label></div><label class="field">Intensidade<select name="intensity"><option ${a.intensity==='Leve'?'selected':''}>Leve</option><option ${!a.intensity||a.intensity==='Moderada'?'selected':''}>Moderada</option><option ${a.intensity==='Intensa'?'selected':''}>Intensa</option></select></label><label class="field">Observações<textarea name="notes">${esc(a.notes||'')}</textarea></label><button class="primary">Salvar atividade</button>${a.id?'<button type="button" class="danger" id="deleteActivity">Excluir atividade</button>':''}</form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('#deleteActivity')?.addEventListener('click', async () => {
    if (!confirm('Excluir esta atividade?')) return;
    await repo.remove('activityDiary', a.id);
    modal.close();
    showToast('Atividade excluída');
    render()
  });
  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target),
      mod = f.get('modality'),
      custom = f.get('customModality').trim(),
      now = new Date().toISOString();
    await repo.put('activityDiary', {
      ...a,
      id: a.id || repo.uuid(),
      modality: mod === 'Outra' ? (custom || 'Outra') : mod,
      customModality: custom,
      date: f.get('date'),
      durationMinutes: number(f.get('durationMinutes'), 1, 1440),
      distanceKm: f.get('distanceKm') ? number(f.get('distanceKm'), 0, 10000) : null,
      calories: f.get('calories') ? number(f.get('calories'), 0, 100000) : null,
      intensity: f.get('intensity'),
      notes: f.get('notes'),
      createdAt: a.createdAt || now,
      updatedAt: now
    });
    modal.close();
    showToast('Atividade salva');
    render()
  }
}

function downloadText(content, filename) {
  const blob = new Blob([content], {
      type: 'text/plain;charset=utf-8'
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportPeriodForm() {
  const today = new Date().toISOString().slice(0, 10),
    first = today.slice(0, 8) + '01';
  modalContent.innerHTML = `<form id="periodForm" class="stack"><div class="row"><h2>Exportar treinos · escolha o período</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Data inicial<input name="startDate" type="date" required value="${first}"></label><label class="field">Data final<input name="endDate" type="date" required value="${today}"></label><label class="field">Conteúdo<select name="scope"><option value="all">Musculação e outras atividades</option><option value="strength">Somente musculação</option><option value="activities">Somente outras atividades</option></select></label><div class="chips" id="periodQuickRanges"><button type="button" class="chip" data-range="7">Últimos 7 dias</button><button type="button" class="chip" data-range="30">Últimos 30 dias</button><button type="button" class="chip" data-range="month">Este mês</button><button type="button" class="chip" data-range="all">Tudo</button></div><p class="muted">O arquivo TXT será organizado para copiar ou anexar em uma conversa de IA.</p><button class="primary">Gerar arquivo TXT</button></form>`;
  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelectorAll('#periodQuickRanges [data-range]').forEach(chip => chip.onclick = () => {
    const form = modalContent.querySelector('#periodForm'),
      end = new Date().toISOString().slice(0, 10),
      r = chip.dataset.range,
      start = r === 'all' ? '2020-01-01' : r === 'month' ? end.slice(0, 8) + '01' : new Date(Date.now() - Number(r) * 86400000).toISOString().slice(0, 10);
    form.elements.startDate.value = start;
    form.elements.endDate.value = end
  });
  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target),
      start = f.get('startDate'),
      end = f.get('endDate'),
      scope = f.get('scope');
    if (end < start) {
      showToast('A data final deve ser igual ou posterior à inicial.');
      return
    }
    const sessions = (await repo.all('workoutSessions')).filter(x => x.status === 'completed' && (x.startedAt || '').slice(0, 10) >= start && (x.startedAt || '').slice(0, 10) <= end).sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
    const sets = await repo.all('executedSets'),
      exercises = await repo.all('exercises');
    const activities = (await repo.all('activityDiary')).filter(x => (x.date || '') >= start && (x.date || '') <= end).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let txt = `# Relatório de treinos MAB Personal\nPeríodo: ${start} a ${end}\nGerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
    if (scope !== 'activities') {
      txt += '## Musculação\n';
      if (!sessions.length) txt += 'Nenhuma sessão concluída no período.\n\n';
      for (const session of sessions) {
        txt += `### ${(session.startedAt||'').slice(0,10)} - Treino ${session.groupCode||''}\n`;
        const ss = sets.filter(x => x.sessionId === session.id && x.completed).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.setNumber - b.setNumber);
        const ids = [...new Set(ss.map(x => x.exerciseId))];
        for (const id of ids) {
          const ex = exercises.find(x => x.id === id);
          txt += `- ${ex?.name||'Exercício'}:\n`;
          for (const st of ss.filter(x => x.exerciseId === id)) txt += `  - Série ${st.setNumber}: ${st.reps} reps x ${st.weight} kg, RIR ${st.rir}\n`;
        }
        txt += '\n'
      }
    }
    if (scope !== 'strength') {
      txt += '## Outras atividades\n';
      if (!activities.length) txt += 'Nenhuma atividade registrada no período.\n';
      for (const a of activities) txt += `- ${a.date}: ${a.modality}, ${a.durationMinutes} min${a.distanceKm!=null?`, ${a.distanceKm} km`:''}${a.calories!=null?`, ${a.calories} kcal`:''}, intensidade ${a.intensity||'não informada'}${a.notes?`. Observações: ${a.notes}`:''}\n`;
    }
    txt += '\n## Solicitação sugerida para análise\nAnalise a consistência, evolução de cargas e repetições, distribuição semanal, sinais de estagnação e oportunidades de progressão. Não invente dados ausentes.\n';
    downloadText(txt, `mab-treinos-${start}-a-${end}.txt`);
    modal.close();
    showToast('Relatório exportado')
  }
}

function settings() {
  modalContent.innerHTML = `<div class="stack"><div class="row"><h2>Configurações e Dados</h2><button class="ghost" data-close>✕</button></div><p class="muted">Os dados ficam neste aparelho. Faça backups periódicos.</p><p class="muted" id="lastBackupInfo"></p><button class="primary" id="exportBtn">Exportar backup JSON</button><button class="secondary" id="importBtn">Importar backup JSON</button><button class="ghost" id="exportPeriodBtn">Exportar treinos por período</button><button class="danger" id="eraseBtn">Apagar todos os dados</button></div>`;
  modal.showModal();
  const updateBackupInfo = r => {
    const el = modalContent.querySelector('#lastBackupInfo');
    if (!el) return;
    if (!r?.value) { el.textContent = 'Backup: nunca exportado neste aparelho.'; return }
    const d = Math.floor((Date.now() - new Date(r.value).getTime()) / 86400000);
    el.textContent = d <= 0 ? 'Último backup: hoje.' : `Último backup: há ${d} ${d === 1 ? 'dia' : 'dias'}.`
  };
  repo.get('settings', 'lastBackupAt').then(updateBackupInfo).catch(() => {});
  modalContent.querySelector('[data-close]').onclick = () => modal.close();
  modalContent.querySelector('#exportBtn').onclick = async () => {
    downloadBackup(await exportBackup());
    updateBackupInfo({ value: new Date().toISOString() });
    showToast('Backup exportado')
  };
  modalContent.querySelector('#importBtn').onclick = () => document.querySelector('#importInput').click();
  modalContent.querySelector('#exportPeriodBtn').onclick = () => {
    modal.close();
    exportPeriodForm()
  };
  modalContent.querySelector('#eraseBtn').onclick = async () => {
    if (prompt('Digite APAGAR para confirmar') !== 'APAGAR') return;
    for (const s of repo.stores) await (await import('./db.js')).clear(s);
    modal.close();
    await seed();
    render();
    showToast('Dados apagados')
  }
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.actPeriod) {
    actChartPeriod = b.dataset.actPeriod;
    renderActivityChart(document.querySelector('#activityChartMetric')?.value || 'frequency');
    return;
  }
  if (b.dataset.actSubview) {
    actChartSubView = b.dataset.actSubview;
    const sel = document.querySelector('#activityChartMetric');
    if (sel && sel.value.startsWith('frequency')) {
      if (actChartSubView === 'all') sel.value = 'frequency';
      else if (actChartSubView === 'modalities') sel.value = 'frequency_modalities';
      else if (actChartSubView === 'exercises') sel.value = 'frequency_exercises';
    }
    renderActivityChart(document.querySelector('#activityChartMetric')?.value || 'frequency');
    return;
  }
  if (b.dataset.route) {
    navigate(b.dataset.route);
    return
  }
  const a = b.dataset.action;
  if (a === 'start') start(b.dataset.group);
  if (a === 'save-set') saveSet(Number(b.dataset.n)).catch(x => showToast(x.message));
  if (a === 'next' || a === 'prev') {
    const s = (await openSessions())[0];
    s.currentIndex = Math.max(0, (s.currentIndex || 0) + (a === 'next' ? 1 : -1));
    await repo.put('workoutSessions', s);
    render()
  }
  if (a === 'finish') {
    if (window.__mabFinishPending || document.querySelector('#mabFinishOverlay')) return;
    const s = (await openSessions())[0];
    s.status = 'completed';
    s.finishedAt = new Date().toISOString();
    await repo.put('workoutSessions', s);
    await releaseScreenWakeLock();
    navigate('dashboard');
    showToast('Treino concluído')
  }
  if (a === 'skip-rest') {
    const r = await activeRest();
    if (r) {
      r.status = 'cancelled';
      r.endedAt = new Date().toISOString();
      r.actualDurationSeconds = Math.max(0, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000));
      r.endReason = 'skipped';
      await repo.put('restTimers', r);
      render()
    }
  }
  if (a === 'rest') {
    const s = (await openSessions())[0];
    const items = (await repo.all('planItems')).filter(x => x.cycleId === s.cycleId && x.groupCode === s.groupCode && x.active).sort((x, y) => x.order - y.order);
    await beginRest(Number(b.dataset.sec), s, items[s.currentIndex || 0]);
    render()
  }
  if (a === 'plan-group') {
    localStorage.setItem('mab-plan-group', b.dataset.group);
    render()
  }
  if (a === 'toggle-plan') {
    const item = await repo.get('planItems', b.dataset.id);
    item.active = false;
    item.updatedAt = new Date().toISOString();
    await repo.put('planItems', item);
    showToast('Exercício retirado do plano atual');
    render()
  }
  if (a === 'move-plan-up' || a === 'move-plan-down') {
    const cycle = await activeCycle();
    const group = localStorage.getItem('mab-plan-group') || 'A';
    const items = (await repo.all('planItems')).filter(x => x.cycleId === cycle?.id && x.groupCode === group && x.active).sort((x, y) => x.order - y.order);
    const idx = items.findIndex(x => x.id === b.dataset.id);
    const target = a === 'move-plan-up' ? idx - 1 : idx + 1;
    if (idx >= 0 && target >= 0 && target < items.length) {
      const left = items[idx],
        right = items[target],
        tmp = left.order;
      left.order = right.order;
      right.order = tmp;
      left.updatedAt = right.updatedAt = new Date().toISOString();
      await repo.put('planItems', left);
      await repo.put('planItems', right);
      showToast('Ordem do treino atualizada');
      render()
    }
  }
  if (a === 'add-plan-item') planItemForm();
  if (a === 'edit-plan-item') planItemForm(await repo.get('planItems', b.dataset.id));
  if (a === 'new-exercise') exerciseForm();
  if (a === 'edit-exercise') exerciseForm(await repo.get('exercises', b.dataset.id));
  if (a === 'new-assessment') assessmentChoiceDialog();
  if (a === 'new-activity') activityForm();
  if (a === 'edit-activity') activityForm(await repo.get('activityDiary', b.dataset.id));
  if (a === 'export-period') exportPeriodForm()
});
document.querySelectorAll('.bottom-nav button').forEach(b => b.onclick = () => navigate(b.dataset.route));
document.querySelector('#settingsBtn').onclick = settings;
document.querySelector('#importInput').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const obj = JSON.parse(await file.text());
    const counts = obj.metadata?.recordCounts || {};
    if (!confirm(`Restaurar backup de ${obj.metadata?.exportedAt||'data desconhecida'}?\nExercícios: ${counts.exercises||0}\nSéries: ${counts.executedSets||0}`)) return;
    const result = await importBackup(obj, 'replace');
    modal.close();
    render();
    showToast(`Importado: ${result.created} registros`)
  } catch (err) {
    showToast(err.message)
  } finally {
    e.target.value = ''
  }
};
window.addEventListener('routechange', render);
window.addEventListener('focus', () => route() === 'workout' && render());
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && route() === 'workout') {
    if ((await openSessions()).length) await requestScreenWakeLock();
    render()
  }
});
await seed();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
if (navigator.storage?.persist) navigator.storage.persist();
render();