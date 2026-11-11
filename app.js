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
  return `<section class="grid dashboard-layout"><div class="stack"><div class="card"><div class="muted">PRÓXIMO TREINO</div><h2>Treino A · Superiores</h2><p class="muted">${cycle?esc(cycle.name):'Nenhum ciclo ativo'}</p><div class="stack"><button class="primary" data-action="start" data-group="A">▶ Iniciar musculação</button><button class="secondary" data-action="new-activity">+ Registrar outra atividade</button></div></div><div class="grid two"><div class="card metric"><span class="muted">Peso atual</span><strong>${assessments[0]?.weight??'--'} kg</strong></div><div class="card metric"><span class="muted">Musculações no mês</span><strong>${monthly.length}</strong></div><div class="card metric"><span class="muted">Outras atividades</span><strong>${monthlyActivities.length}</strong></div><div class="card metric"><span class="muted">Tempo ativo</span><strong>${fmt(total+activityMinutes*60)}</strong></div></div></div><div class="card"><h3>Atividades recentes</h3><div class="recent-activities-list">${recent.map(a=>`<div class="exercise-item" data-detail-kind="${a.type}" data-detail-id="${a.id||''}" style="cursor:pointer"><div><strong>${esc(a.title)}</strong><div class="muted">${esc(a.date)} · ${esc(a.detail)}</div></div><button class="ghost" data-action="view-detail" data-kind="${a.type}" data-id="${a.id}">Ver detalhes</button></div>`).join('')||'<div class="empty">Nenhuma atividade concluída ainda.</div>'}</div><div class="stack" style="margin-top:12px"><button class="ghost" data-route="plan">Editar plano A/B/C/D</button><button class="ghost" data-route="exercises">Biblioteca de exercícios</button><button class="ghost" data-route="evolution">Evolução e histórico</button></div></div></section>`
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
  return `<div class="stack">
    <div class="card">
      <div class="row">
        <div>
          <span class="muted">CICLO ATUAL</span>
          <h2>${esc(cycle?.name||'Sem ciclo')}</h2>
        </div>
        <button class="primary" data-action="add-plan-item">+ Adicionar ao treino</button>
      </div>
      <div class="chips">
        ${['A','B','C','D'].map(g=>`<button class="chip ${g===group?'active':''}" data-action="plan-group" data-group="${g}">Treino ${g}</button>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>Treino ${group}</h3>
      ${list.map(i=>{
        const e=exercises.find(x=>x.id===i.exerciseId);
        const repsText = i.minReps === i.maxReps ? `${i.minReps} reps` : `${i.minReps} a ${i.maxReps} reps`;
        return `<div class="plan-exercise-item">
          <div class="plan-exercise-main">
            <strong class="plan-exercise-title">${esc(e?.name)}</strong>
            <div class="plan-exercise-meta">
              <span class="plan-meta-badge">${i.sets} ${i.sets === 1 ? 'série' : 'séries'}</span>
              <span class="plan-meta-badge orange">${repsText}</span>
              <span class="plan-meta-badge">⏱ ${i.restSeconds}s descanso</span>
              ${i.rirTarget != null ? `<span class="plan-meta-badge muted">RIR ${i.rirTarget}</span>` : ''}
            </div>
          </div>
          <div class="plan-exercise-actions">
            <div class="plan-order-group">
              <button class="ghost icon-sm" data-action="move-plan-up" data-id="${i.id}" aria-label="Mover ${esc(e?.name)} para cima">↑</button>
              <button class="ghost icon-sm" data-action="move-plan-down" data-id="${i.id}" aria-label="Mover ${esc(e?.name)} para baixo">↓</button>
            </div>
            <div class="plan-control-group">
              <button class="ghost btn-sm" data-action="edit-plan-item" data-id="${i.id}">Editar</button>
              <button class="chip active btn-sm" data-action="toggle-plan" data-id="${i.id}">Inativar</button>
            </div>
          </div>
        </div>`;
      }).join('')||'<div class="empty">Nenhum exercício.</div>'}
    </div>
  </div>`;
}

async function exercises() {
  const list = (await repo.all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {
    sensitivity: 'base'
  }));
  return `<div class="stack">
    <div class="row" style="align-items:center;margin-bottom:0">
      <h2>Exercícios</h2>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;width:100%">
      <button type="button" class="primary" data-action="new-exercise" style="flex:1;min-width:140px;min-height:42px;font-size:12px;font-weight:800;padding:8px 10px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px;white-space:nowrap">+ Cadastrar Novo Exercício</button>
      <button type="button" class="secondary" data-action="import-exercises-dialog" style="flex:1;min-width:140px;min-height:42px;font-size:12px;font-weight:700;padding:8px 10px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px;white-space:nowrap">Importar Base de Exercícios</button>
      <button type="button" class="primary" data-action="export-exercises-dialog" style="flex:1;min-width:140px;min-height:42px;font-size:12px;font-weight:800;padding:8px 10px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px;white-space:nowrap">Exportar Base de Exercícios</button>
    </div>
    <div class="card">
      <input id="exerciseSearch" aria-label="Pesquisar exercícios" placeholder="Pesquisar" style="width:100%;padding:12px;border-radius:10px;border:1px solid #383838;background:#0e0e0e;color:#fff">
      <div id="exerciseList">${list.map(e=>exerciseRow(e)).join('')}</div>
    </div>
  </div>`;
}

function exerciseRow(e) {
  const primary = e.primaryMuscleGroup || e.muscleGroup || 'Peitoral';
  const secondaries = Array.isArray(e.secondaryMuscleGroups) && e.secondaryMuscleGroups.length > 0
    ? e.secondaryMuscleGroups.filter(g => g !== primary)
    : [];
  const muscleText = `Principal: ${esc(primary)}${secondaries.length ? ` · Secundários: ${esc(secondaries.join(', '))}` : ''}`;
  const videoBadge = e.videoUrl && String(e.videoUrl).trim()
    ? `<a href="${esc(e.videoUrl)}" target="_blank" rel="noopener noreferrer" class="mab-video-badge" title="Ver execução em vídeo">▶ Execução</a>`
    : '';

  return `<div class="exercise-item" data-name="${esc(e.name.toLowerCase())}"><div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong>${esc(e.name)}</strong>${videoBadge}</div><div class="muted" style="margin-top:2px">${muscleText}${e.equipment ? ` · ${esc(e.equipment)}` : ''}</div></div><button class="ghost" data-action="edit-exercise" data-id="${e.id}">Editar</button></div>`
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
  return `<div class="stack"><div class="row" style="flex-wrap:wrap;gap:8px"><h2>Evolução</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="primary" data-action="new-assessment">+ Peso/Bioimpedância</button></div></div><div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3>Atividades registradas</h3><select id="activityChartMetric" aria-label="Indicador do gráfico de atividades" style="background:#0e0e0e;color:#fff;border:1px solid #383838;border-radius:10px;padding:10px;max-width:100%;min-width:0;width:100%"><option value="duration">Tempo ativo (minutos)</option><option value="calories">Calorias (kcal)</option><option value="distance">Distância (km)</option><option value="frequency">Frequência de Atividades e Exercícios</option><option value="frequency_modalities">Frequência por modalidade</option><option value="frequency_exercises">Frequência por exercício</option></select></div><div id="activityChart"></div></div><div class="card"><h3>Composição corporal atual</h3><div class="grid two"><div class="metric"><span class="muted">Peso</span><strong>${fmtMetric(latest?.weight,' kg')}</strong>${delta('weight',' kg')}</div><div class="metric"><span class="muted">Massa magra</span><strong>${fmtMetric(latest?.leanMass,' kg')}</strong>${delta('leanMass',' kg')}</div><div class="metric"><span class="muted">Massa gorda</span><strong>${fmtMetric(latest?.fatMass,' kg')}</strong>${delta('fatMass',' kg')}</div><div class="metric"><span class="muted">Gordura corporal</span><strong>${fmtMetric(latest?.bodyFat,'%')}</strong>${delta('bodyFat',' p.p.')}</div><div class="metric"><span class="muted">Circunferência abdominal</span><strong>${fmtMetric(latest?.waistCm,' cm')}</strong>${delta('waistCm',' cm')}</div><div class="metric"><span class="muted">Data da avaliação</span><strong>${latest?.date||'--'}</strong></div></div></div><div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3>Evolução corporal</h3><select id="bodyChartMetric" aria-label="Indicador do gráfico" style="background:#0e0e0e;color:#fff;border:1px solid #383838;border-radius:10px;padding:10px;max-width:100%;min-width:0"><option value="weight">Peso</option><option value="leanMass">Massa magra</option><option value="fatMass">Massa gorda</option><option value="bodyFat">% gordura</option><option value="waistCm">Circunferência</option></select></div><div id="bodyChart"></div></div><div class="card"><h3>Histórico corporal</h3>${[...list].reverse().map(x=>`<div class="exercise-item"><div><strong>${x.weight!=null?`${x.weight} kg`:'— kg'}</strong><div class="muted">${esc(x.date)}</div><div class="muted">Magra: ${fmtMetric(x.leanMass,' kg')} · Gorda: ${fmtMetric(x.fatMass,' kg')} · Abdômen: ${fmtMetric(x.waistCm,' cm')}</div></div><span>${fmtMetric(x.bodyFat,'% gordura')}</span></div>`).join('')||'<div class="empty">Sem avaliações.</div>'}</div><div class="card"><h3>Exportar para análise</h3><p class="muted">Gere um arquivo de texto com exercícios, séries, cargas e atividades por intervalo de datas.</p><button class="secondary" data-action="export-period">Exportar treinos por período</button></div></div>`
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

const BASE_MUSCLE_GROUPS = ['Peitoral', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Pernas', 'Quadríceps', 'Posterior', 'Glúteos', 'Panturrilhas', 'Core'];

async function getAvailableMuscleGroups() {
  const customRecord = await repo.get('settings', 'customMuscleGroups').catch(() => null);
  const custom = Array.isArray(customRecord?.value) ? customRecord.value : [];
  const exercises = await repo.all('exercises').catch(() => []);
  const fromExercises = [];
  for (const ex of exercises) {
    if (ex.primaryMuscleGroup) fromExercises.push(ex.primaryMuscleGroup);
    if (ex.muscleGroup) fromExercises.push(ex.muscleGroup);
    if (Array.isArray(ex.secondaryMuscleGroups)) fromExercises.push(...ex.secondaryMuscleGroups);
  }
  const set = new Set([...BASE_MUSCLE_GROUPS, ...custom, ...fromExercises].map(s => String(s || '').trim()).filter(Boolean));
  return [...set];
}

async function addCustomMuscleGroup(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
  const customRecord = await repo.get('settings', 'customMuscleGroups').catch(() => null);
  const custom = Array.isArray(customRecord?.value) ? customRecord.value : [];
  if (!custom.includes(formatted)) {
    custom.push(formatted);
    await repo.put('settings', { key: 'customMuscleGroups', value: custom });
  }
  return formatted;
}

function openNewMuscleGroupDialog(origin, onAdded) {
  const existingOverlay = document.querySelector('#mabNewGroupOverlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mabNewGroupOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  overlay.innerHTML = `
    <div style="background:#181818;border:1px solid #383838;border-radius:18px;padding:20px;width:min(420px,100%);color:#fff;box-sizing:border-box;box-shadow:0 12px 32px rgba(0,0,0,0.6)">
      <div class="row" style="margin-bottom:12px">
        <h3 style="margin:0;font-size:17px;color:#ff851b">Novo Grupo Muscular</h3>
        <button type="button" class="ghost" id="mabCloseNewGroup" style="padding:4px 10px;font-size:14px">✕</button>
      </div>
      <p class="muted" style="font-size:12px;margin:0 0 14px">
        Digite o nome do músculo para adicioná-lo às opções (tanto para grupo principal quanto secundário):
      </p>
      <label class="field">
        <input type="text" id="mabNewGroupNameInput" placeholder="Ex.: Adutores, Abdutores, Trapézio, Lombar" autofocus style="background:#0e0e0e;color:#fff;border:1px solid #444;border-radius:10px;padding:12px;font-size:15px;width:100%;box-sizing:border-box">
      </label>
      <div id="mabNewGroupError" style="color:#ff5555;font-size:12px;min-height:18px;margin-top:6px;font-weight:600"></div>
      <div class="row" style="margin-top:14px;gap:8px">
        <button type="button" class="ghost" id="mabCancelNewGroup" style="flex:1">Cancelar</button>
        <button type="button" class="primary" id="mabConfirmNewGroup" style="flex:1">Adicionar grupo</button>
      </div>
    </div>
  `;
  const host = document.querySelector('#modalContent') || document.body;
  host.appendChild(overlay);

  const input = overlay.querySelector('#mabNewGroupNameInput');
  const errorEl = overlay.querySelector('#mabNewGroupError');
  const close = () => overlay.remove();

  overlay.querySelector('#mabCloseNewGroup').onclick = close;
  overlay.querySelector('#mabCancelNewGroup').onclick = close;

  setTimeout(() => input?.focus(), 80);

  const handleConfirm = async () => {
    const raw = input.value.trim();
    if (!raw) {
      errorEl.textContent = 'Informe o nome do grupo muscular.';
      input.focus();
      return;
    }
    const currentGroups = await getAvailableMuscleGroups();
    const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const cleanNorm = normalize(raw);
    const existing = currentGroups.find(g => normalize(g) === cleanNorm);
    if (existing) {
      errorEl.textContent = `O grupo muscular "${existing}" já existe na lista.`;
      input.focus();
      return;
    }

    const formatted = raw.charAt(0).toUpperCase() + raw.slice(1);
    await addCustomMuscleGroup(formatted);
    close();
    showToast(`Grupo "${formatted}" adicionado`);
    if (typeof onAdded === 'function') onAdded(formatted, origin);
  };

  overlay.querySelector('#mabConfirmNewGroup').onclick = handleConfirm;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      close();
    }
  });
}

async function exerciseForm(e = {}, addToCurrentPlan = false) {
  const allGroups = await getAvailableMuscleGroups();
  let currentPrimary = e.primaryMuscleGroup || e.muscleGroup || 'Peitoral';
  if (!allGroups.includes(currentPrimary)) allGroups.push(currentPrimary);
  const selectedSecondaries = Array.isArray(e.secondaryMuscleGroups)
    ? e.secondaryMuscleGroups.filter(g => g !== currentPrimary)
    : [];

  modalContent.innerHTML = `<form id="exerciseForm" class="stack">
    <div class="row">
      <h2>${e.id ? 'Editar' : 'Novo'} exercício</h2>
      <button type="button" class="ghost" data-close>✕</button>
    </div>
    <label class="field">
      Nome
      <input name="name" required value="${esc(e.name || '')}">
    </label>
    <div class="field">
      <div class="row" style="margin-bottom:2px">
        <span style="font-weight:600;font-size:13px">Grupo Muscular Principal (toque para selecionar um)</span>
        <button type="button" class="ghost" data-add-group-for="primary" style="font-size:11px;padding:4px 9px;border-color:rgba(255,133,27,0.4);color:#ff851b;border-radius:999px">+ Novo grupo</button>
      </div>
      <small class="muted" style="margin-top:-2px">Selecione o músculo alvo principal do exercício</small>
      <div class="mab-muscle-chips" id="primaryChipsContainer">
        ${allGroups.map(g => `<button type="button" class="mab-muscle-chip mab-primary-chip ${g === currentPrimary ? 'active' : ''}" data-group="${esc(g)}">${esc(g)}</button>`).join('')}
      </div>
      <input type="hidden" name="muscleGroup" id="primaryMuscleGroupInput" value="${esc(currentPrimary)}">
    </div>
    <div class="field">
      <div class="row" style="margin-bottom:2px">
        <span style="font-weight:600;font-size:13px">Grupos Secundários (sinergistas)</span>
        <button type="button" class="ghost" data-add-group-for="secondary" style="font-size:11px;padding:4px 9px;border-color:rgba(255,133,27,0.4);color:#ff851b;border-radius:999px">+ Novo grupo</button>
      </div>
      <small class="muted" style="margin-top:-2px">Toque para marcar/desmarcar músculos acionados como apoio</small>
      <div class="mab-muscle-chips" id="secondaryChipsContainer">
        ${allGroups.map(g => {
          const isPrimary = g === currentPrimary;
          const isActive = selectedSecondaries.includes(g) && !isPrimary;
          return `<button type="button" class="mab-muscle-chip mab-secondary-chip ${isActive ? 'active' : ''}" data-group="${esc(g)}" ${isPrimary ? 'style="display:none"' : ''}>${esc(g)}</button>`;
        }).join('')}
      </div>
    </div>
    <label class="field">
      Equipamento
      <input name="equipment" required value="${esc(e.equipment || '')}">
    </label>
    <label class="field">
      Vídeo/link (YouTube ou demonstração)
      <input name="videoUrl" type="url" placeholder="https://www.youtube.com/watch?v=..." value="${esc(e.videoUrl || '')}">
    </label>
    <label class="field">
      Observações
      <textarea name="notes">${esc(e.notes || '')}</textarea>
    </label>
    <button class="primary">Salvar exercício</button>
  </form>`;

  modal.showModal();
  modalContent.querySelector('[data-close]').onclick = () => modal.close();

  const primaryChipsContainer = modalContent.querySelector('#primaryChipsContainer');
  const secondaryChipsContainer = modalContent.querySelector('#secondaryChipsContainer');
  const primaryInput = modalContent.querySelector('#primaryMuscleGroupInput');

  // Seleção única para o grupo principal
  primaryChipsContainer.addEventListener('click', ev => {
    const chip = ev.target.closest('.mab-primary-chip');
    if (!chip) return;
    const newPrimary = chip.dataset.group;
    if (!newPrimary) return;

    primaryChipsContainer.querySelectorAll('.mab-primary-chip').forEach(c => {
      c.classList.toggle('active', c === chip);
    });
    primaryInput.value = newPrimary;

    // Atualiza secundários: o grupo principal não pode ser secundário
    secondaryChipsContainer.querySelectorAll('.mab-secondary-chip').forEach(c => {
      if (c.dataset.group === newPrimary) {
        c.classList.remove('active');
        c.style.display = 'none';
      } else {
        c.style.display = '';
      }
    });
  });

  // Marcação múltipla para grupos secundários
  secondaryChipsContainer.addEventListener('click', ev => {
    const chip = ev.target.closest('.mab-secondary-chip');
    if (!chip) return;
    chip.classList.toggle('active');
  });

  const handleGroupAdded = (newGroup, origin) => {
    if (!allGroups.includes(newGroup)) allGroups.push(newGroup);

    // Adiciona ao container principal se não existir
    let pChip = primaryChipsContainer.querySelector(`[data-group="${CSS.escape(newGroup)}"]`);
    if (!pChip) {
      pChip = document.createElement('button');
      pChip.type = 'button';
      pChip.className = 'mab-muscle-chip mab-primary-chip';
      pChip.dataset.group = newGroup;
      pChip.textContent = newGroup;
      primaryChipsContainer.appendChild(pChip);
    }

    // Adiciona ao container secundário se não existir
    let sChip = secondaryChipsContainer.querySelector(`[data-group="${CSS.escape(newGroup)}"]`);
    if (!sChip) {
      sChip = document.createElement('button');
      sChip.type = 'button';
      sChip.className = 'mab-muscle-chip mab-secondary-chip';
      sChip.dataset.group = newGroup;
      sChip.textContent = newGroup;
      secondaryChipsContainer.appendChild(sChip);
    }

    if (origin === 'primary') {
      // Seleciona como principal
      primaryChipsContainer.querySelectorAll('.mab-primary-chip').forEach(c => {
        c.classList.toggle('active', c === pChip);
      });
      primaryInput.value = newGroup;

      // Oculta nos secundários pois agora é o principal
      sChip.classList.remove('active');
      sChip.style.display = 'none';

      // Garante que os outros secundários fiquem visíveis
      secondaryChipsContainer.querySelectorAll('.mab-secondary-chip').forEach(c => {
        if (c.dataset.group !== newGroup) c.style.display = '';
      });
    } else {
      // Adicionado a partir dos secundários
      if (primaryInput.value !== newGroup) {
        sChip.classList.add('active');
        sChip.style.display = '';
      } else {
        sChip.style.display = 'none';
      }
    }
  };

  // Botões de adicionar novo grupo (disponíveis tanto no principal quanto no secundário)
  modalContent.querySelectorAll('[data-add-group-for]').forEach(btn => {
    btn.onclick = () => {
      openNewMuscleGroupDialog(btn.dataset.addGroupFor, handleGroupAdded);
    };
  });

  modalContent.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target),
      name = fd.get('name').trim(),
      now = new Date().toISOString();
    if (!name) {
      showToast('Informe o nome do exercício.');
      return;
    }
    const primary = primaryInput.value || 'Peitoral';
    const secondary = [...secondaryChipsContainer.querySelectorAll('.mab-secondary-chip.active')]
      .map(c => c.dataset.group)
      .filter(g => g && g !== primary);

    const saved = {
      ...e,
      id: e.id || repo.uuid(),
      name,
      nameNormalized: name.toLowerCase(),
      muscleGroup: primary,
      primaryMuscleGroup: primary,
      secondaryMuscleGroups: secondary,
      equipment: String(fd.get('equipment') || '').trim(),
      videoUrl: String(fd.get('videoUrl') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
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
      const same = items.filter(x => x.cycleId === cycle?.id && x.groupCode === group);
      await repo.put('planItems', {
        id: repo.uuid(),
        cycleId: cycle?.id,
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
      showToast('Exercício criado e adicionado ao Treino ' + group);
    } else showToast('Exercício salvo');
    render();
  };
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
  modalContent.innerHTML = `<form id="activityForm" class="stack"><div class="row"><h2>${a.id?'Editar':'Nova'} atividade</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Modalidade<select name="modality">${modalities.map(m=>`<option ${a.modality===m?'selected':''}>${m}</option>`).join('')}</select></label><label class="field">Nome personalizado (use se escolher Outra)<input name="customModality" value="${esc(a.customModality||'')}"></label><div class="grid two" style="min-width:0;width:100%;box-sizing:border-box"><label class="field">Data<input name="date" type="date" required value="${a.date||new Date().toISOString().slice(0,10)}" style="min-width:0;width:100%;box-sizing:border-box"></label><label class="field">Duração (min)<input name="durationMinutes" type="number" inputmode="numeric" min="1" max="1440" required value="${a.durationMinutes??60}" ${a.id?'readonly style="opacity:0.7;cursor:not-allowed;background:#1a1a1a"':''}></label><label class="field">Distância (km, opcional)<input name="distanceKm" inputmode="decimal" value="${a.distanceKm??''}"></label><label class="field">Calorias (opcional)<input name="calories" inputmode="numeric" value="${a.calories??''}"></label></div><label class="field">Intensidade<select name="intensity"><option ${a.intensity==='Leve'?'selected':''}>Leve</option><option ${!a.intensity||a.intensity==='Moderada'?'selected':''}>Moderada</option><option ${a.intensity==='Intensa'?'selected':''}>Intensa</option></select></label><label class="field">Esforço geral (RPE · 1 a 10)<select name="sessionRpe"><option value="">Não informado</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${Number(a.sessionRpe)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="field">Fadiga após a atividade (1 a 5)<select name="fatigueAfter"><option value="">Não informado</option>${Array.from({length:5},(_,i)=>`<option value="${i+1}" ${Number(a.fatigueAfter)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="field">Observações<textarea name="notes">${esc(a.notes||'')}</textarea></label><button class="primary">Salvar atividade</button>${a.id?'<button type="button" class="danger" id="deleteActivity">Excluir atividade</button>':''}</form>`;
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
      durationMinutes: a.id ? (Number(a.durationMinutes) || 0) : number(f.get('durationMinutes'), 1, 1440),
      distanceKm: f.get('distanceKm') ? number(f.get('distanceKm'), 0, 10000) : null,
      calories: f.get('calories') ? number(f.get('calories'), 0, 100000) : null,
      intensity: f.get('intensity'),
      sessionRpe: f.get('sessionRpe') ? Number(f.get('sessionRpe')) : null,
      fatigueAfter: f.get('fatigueAfter') ? Number(f.get('fatigueAfter')) : null,
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
      for (const a of activities) txt += `- ${a.date}: ${a.modality}, ${a.durationMinutes} min${a.distanceKm!=null?`, ${a.distanceKm} km`:''}${a.calories!=null?`, ${a.calories} kcal`:''}, intensidade ${a.intensity||'não informada'}${a.sessionRpe!=null?`, esforço (RPE) ${a.sessionRpe}/10`:''}${a.fatigueAfter!=null?`, fadiga ${a.fatigueAfter}/5`:''}${a.notes?`. Observações: ${a.notes}`:''}\n`;
    }
    txt += '\n## Solicitação sugerida para análise\nAnalise a consistência, evolução de cargas e repetições, distribuição semanal, sinais de estagnação e oportunidades de progressão. Não invente dados ausentes.\n';
    downloadText(txt, `mab-treinos-${start}-a-${end}.txt`);
    modal.close();
    showToast('Relatório exportado')
  }
}

function settings() {
  modalContent.innerHTML = `<div class="stack"><div class="row"><h2>Configurações e Dados</h2><button class="ghost" data-close>✕</button></div><p class="muted">Os dados ficam neste aparelho. Faça backups periódicos.</p><p class="muted" id="lastBackupInfo"></p><button class="primary" id="exportBtn">Exportar backup JSON completo</button><button class="secondary" id="importBtn">Importar backup JSON completo</button><div style="display:grid;gap:8px;padding:12px 0;border-top:1px solid #282828;border-bottom:1px solid #282828"><div class="muted" style="font-size:11px;font-weight:700;color:#ff851b;letter-spacing:.08em">PRESCRIÇÃO DO PERSONAL TRAINER</div><button class="secondary" id="exportPersonalBtn">Exportar treinos A/B/C/D (Personal)</button><button class="secondary" id="importPersonalBtn">Importar treinos A/B/C/D (Personal)</button><button class="ghost" id="viewTemplatePersonalBtn" style="color:#ff851b;border-color:rgba(255,133,27,0.4)">📋 Como preencher / Modelo (.txt / JSON)</button></div><button class="ghost" id="exportPeriodBtn">Exportar treinos por período</button><button class="danger" id="eraseBtn">Apagar todos os dados</button></div>`;
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
  modalContent.querySelector('#exportPersonalBtn')?.addEventListener('click', () => {
    modal.close();
    exportPersonalTraining().catch(e => showToast(e.message));
  });
  modalContent.querySelector('#importPersonalBtn')?.addEventListener('click', () => {
    document.querySelector('#importPersonalInput').click();
  });
  modalContent.querySelector('#viewTemplatePersonalBtn')?.addEventListener('click', () => {
    showPersonalTemplateModal();
  });
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

function parseTextWorkout(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Conteúdo de texto vazio.');
  }

  const lines = text.split(/\r?\n/);
  let cicloNome = 'Prescrição do Personal Trainer';
  let cicloObs = '';
  let currentGroup = null;
  const groups = {
    A: { titulo: 'Treino A', exercicios: [] },
    B: { titulo: 'Treino B', exercicios: [] },
    C: { titulo: 'Treino C', exercicios: [] },
    D: { titulo: 'Treino D', exercicios: [] }
  };

  const groupHeaderRegex = /^(?:#+\s*)?(?:\[\s*)?treino\s*([a-d])\s*(?:\])?(?:\s*[-–—:]\s*(.*))?$/i;
  const cycleRegex = /^(?:#+\s*)?(?:ciclo|periodiza[cç][aã]o|objetivo)\s*[:=]\s*(.*)$/i;
  const obsRegex = /^(?:#+\s*)?(?:obs|observa[cç][oõ]es|notas?)\s*[:=]\s*(.*)$/i;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line || (line.startsWith('#') && !groupHeaderRegex.test(line) && !cycleRegex.test(line))) continue;

    const cycleMatch = line.match(cycleRegex);
    if (cycleMatch) {
      cicloNome = cycleMatch[1].trim() || cicloNome;
      continue;
    }

    const obsMatch = line.match(obsRegex);
    if (obsMatch) {
      cicloObs = obsMatch[1].trim() || cicloObs;
      continue;
    }

    const groupMatch = line.match(groupHeaderRegex);
    if (groupMatch) {
      const code = groupMatch[1].toUpperCase();
      currentGroup = code;
      const subtitle = (groupMatch[2] || '').trim();
      groups[code].titulo = subtitle ? `Treino ${code} - ${subtitle}` : `Treino ${code}`;
      continue;
    }

    if (currentGroup && groups[currentGroup]) {
      const cleanLine = line.replace(/^[-*•\d.]+\s*/, '').trim();
      if (!cleanLine) continue;

      let name = '';
      let details = '';

      if (cleanLine.includes(':')) {
        const colonIdx = cleanLine.indexOf(':');
        name = cleanLine.slice(0, colonIdx).trim();
        details = cleanLine.slice(colonIdx + 1).trim();
      } else {
        const splitMatch = cleanLine.match(/^(.*?)(?:\s+)(\d+\s*(?:s[eé]ries|x\s*\d+).*)$/i);
        if (splitMatch) {
          name = splitMatch[1].trim();
          details = splitMatch[2].trim();
        } else {
          name = cleanLine;
          details = '';
        }
      }

      if (!name) continue;

      let sets = 3;
      let minReps = 8;
      let maxReps = 12;
      let rirTarget = 2;
      let restSeconds = 90;
      let videoUrl = '';
      let equipamento = '';
      let observacoes = '';

      if (details) {
        const videoMatch = details.match(/https?:\/\/[^\s,]+/i);
        if (videoMatch) {
          videoUrl = videoMatch[0];
          details = details.replace(videoMatch[0], '');
        }

        const setsMatch = details.match(/(\d+)\s*(?:s[eé]ries?|x)/i);
        if (setsMatch) {
          sets = Number(setsMatch[1]);
        }

        const repsRangeMatch = details.match(/(?:x\s*)?(\d+)\s*(?:a|-|–)\s*(\d+)\s*(?:reps?|repeti[cç][oõ]es)?/i);
        if (repsRangeMatch) {
          minReps = Number(repsRangeMatch[1]);
          maxReps = Number(repsRangeMatch[2]);
        } else {
          const singleRepMatch = details.match(/(?:x\s*|de\s*)(\d+)\s*(?:reps?|repeti[cç][oõ]es)?/i);
          if (singleRepMatch) {
            minReps = Number(singleRepMatch[1]);
            maxReps = Number(singleRepMatch[1]);
          }
        }

        const restMatch = details.match(/(?:descanso|pausa|intervalo)\s*[:=]?\s*(\d+)\s*s?/i);
        if (restMatch) {
          restSeconds = Number(restMatch[1]);
        }

        const rirMatch = details.match(/(?:rir|reserva)\s*[:=]?\s*(\d+)/i);
        if (rirMatch) {
          rirTarget = Number(rirMatch[1]);
        }

        const equipMatch = details.match(/(?:equipamento|equip)\s*[:=]?\s*([^,;]+)/i);
        if (equipMatch) {
          equipamento = equipMatch[1].trim();
        }

        const notesMatch = details.match(/(?:obs|observa[cç][aã]o|nota)\s*[:=]?\s*([^,;]+)/i);
        if (notesMatch) {
          observacoes = notesMatch[1].trim();
        }
      }

      groups[currentGroup].exercicios.push({
        nome: name,
        grupoPrincipal: 'Geral',
        gruposSecundarios: [],
        equipamento: equipamento || '',
        videoUrl: videoUrl || '',
        series: sets,
        repsMin: minReps,
        repsMax: maxReps,
        rirAlvo: rirTarget,
        descansoSegundos: restSeconds,
        observacoes: observacoes || ''
      });
    }
  }

  const totalFound = Object.values(groups).reduce((acc, g) => acc + g.exercicios.length, 0);
  if (totalFound === 0) {
    throw new Error('Não foi possível identificar exercícios no texto. Certifique-se de que os blocos começam com "TREINO A", "TREINO B", etc.');
  }

  return {
    tipo: 'MAB_TREINO_PERSONAL',
    versaoFormato: 1,
    ciclo: {
      nome: cicloNome,
      observacoes: cicloObs
    },
    treinos: groups
  };
}

function showPersonalTemplateModal() {
  const textTemplate = `Ciclo: Hipertrofia - Foco em Superiores e Pernas
Observações: Prescrito pelo Personal Trainer

TREINO A - Peitoral e Tríceps
- Supino Reto com Barra: 4 séries, 8 a 10 reps, RIR 2, descanso 120s, vídeo: https://www.youtube.com/watch?v=rT7DgCr-3pg
- Tríceps Testa: 3 séries, 10 a 12 reps, RIR 1, descanso 90s, vídeo: https://www.youtube.com/watch?v=d_KZxkY_0cM

TREINO B - Costas e Bíceps
- Puxada Frontal na Polia: 4 séries, 8 a 12 reps, RIR 2, descanso 90s, vídeo: https://www.youtube.com/watch?v=CAwf7n6Luuc
- Rosca Direta com Barra: 3 séries, 10 a 12 reps, RIR 2, descanso 60s

TREINO C - Pernas Completo
- Agachamento Livre com Barra: 4 séries, 6 a 8 reps, RIR 2, descanso 150s, vídeo: https://www.youtube.com/watch?v=bEv6CCg2BC8
- Cadeira Extensora: 3 séries, 10 a 12 reps, RIR 1, descanso 90s

TREINO D - Ombros e Core
- Desenvolvimento Militar: 4 séries, 8 a 10 reps, RIR 1, descanso 120s, vídeo: https://www.youtube.com/watch?v=2yjwXTZQDDI
- Elevação Lateral: 4 séries, 12 a 15 reps, RIR 1, descanso 60s`;

  const exampleJson = {
    tipo: "MAB_TREINO_PERSONAL",
    versaoFormato: 1,
    ciclo: {
      nome: "Hipertrofia - Foco em Superiores e Pernas",
      observacoes: "Prescrito pelo Personal Trainer"
    },
    treinos: {
      A: {
        titulo: "Treino A - Peitoral e Tríceps",
        exercicios: [
          {
            nome: "Supino Reto com Barra",
            grupoPrincipal: "Peitoral",
            gruposSecundarios: ["Tríceps", "Ombros"],
            equipamento: "Barra e Banco",
            videoUrl: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
            series: 4,
            repsMin: 8,
            repsMax: 10,
            rirAlvo: 2,
            descansoSegundos: 120,
            observacoes: "Pausa de 1s na fase excêntrica"
          }
        ]
      },
      B: {
        titulo: "Treino B - Costas e Bíceps",
        exercicios: [
          {
            nome: "Puxada Frontal na Polia",
            grupoPrincipal: "Costas",
            gruposSecundarios: ["Bíceps", "Ombros"],
            equipamento: "Polia Alta",
            videoUrl: "https://www.youtube.com/watch?v=CAwf7n6Luuc",
            series: 4,
            repsMin: 8,
            repsMax: 12,
            rirAlvo: 2,
            descansoSegundos: 90,
            observacoes: ""
          }
        ]
      },
      C: {
        titulo: "Treino C - Pernas Completo",
        exercicios: [
          {
            nome: "Agachamento Livre com Barra",
            grupoPrincipal: "Quadríceps",
            gruposSecundarios: ["Glúteos", "Posterior"],
            equipamento: "Barra Olímpica",
            videoUrl: "https://www.youtube.com/watch?v=bEv6CCg2BC8",
            series: 4,
            repsMin: 6,
            repsMax: 8,
            rirAlvo: 2,
            descansoSegundos: 150,
            observacoes: ""
          }
        ]
      },
      D: {
        titulo: "Treino D - Ombros e Core",
        exercicios: [
          {
            nome: "Desenvolvimento Militar",
            grupoPrincipal: "Ombros",
            gruposSecundarios: ["Tríceps", "Core"],
            equipamento: "Barra",
            videoUrl: "https://www.youtube.com/watch?v=2yjwXTZQDDI",
            series: 4,
            repsMin: 8,
            repsMax: 10,
            rirAlvo: 1,
            descansoSegundos: 120,
            observacoes: ""
          }
        ]
      }
    }
  };

  const jsonStr = JSON.stringify(exampleJson, null, 2);

  modalContent.innerHTML = `<div class="stack" style="max-height:86vh;overflow-y:auto">
    <div class="row">
      <div>
        <div class="muted" style="font-size:11px;color:#ff851b;font-weight:700">FICHA DE TREINO (PERSONAL TRAINER)</div>
        <h2 style="margin:2px 0 0">Como preencher e importar</h2>
      </div>
      <button type="button" class="ghost" data-close>✕</button>
    </div>

    <div class="card" style="padding:14px;background:#151515;border-color:#333">
      <div style="font-weight:700;color:#ff851b;font-size:13px;margin-bottom:8px">CAMPOS DA SUA FICHA DE TREINO</div>
      <div class="grid two" style="gap:8px;font-size:12px">
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🏋️ Nome do Exercício</strong>
          <span class="muted">Ex.: Supino Reto, Agachamento Livre, Leg Press</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🔢 Séries</strong>
          <span class="muted">Ex.: 3 ou 4 séries</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🎯 Repetições</strong>
          <span class="muted">Ex.: 8 a 10 reps, 10 a 12 reps ou 15 reps</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">⏱️ Descanso</strong>
          <span class="muted">Em segundos entre séries (ex.: 60s, 90s, 120s)</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">⚡ RIR (opcional)</strong>
          <span class="muted">Repetições na reserva antes de falhar (ex.: RIR 2)</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🎬 Vídeo (opcional)</strong>
          <span class="muted">Link do YouTube para ver a execução do exercício</span>
        </div>
      </div>
    </div>

    <div>
      <div class="row" style="margin-bottom:6px">
        <span style="font-weight:700;font-size:13px">Modelo em Texto (.txt / WhatsApp)</span>
        <span class="muted" style="font-size:11px">Fácil de ler e editar</span>
      </div>
      <div style="background:#0a0a0a;border:1px solid #333;border-radius:12px;padding:12px;max-height:220px;overflow-y:auto;font-family:monospace;font-size:11px;color:#eee;white-space:pre-wrap;line-height:1.45" id="templateTextBlock">${esc(textTemplate)}</div>
    </div>

    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button type="button" class="secondary" id="btnCopyTextTemplate" style="flex:1;min-width:140px;font-size:12px;padding:10px">📋 Copiar texto</button>
      <button type="button" class="primary" id="btnDownloadTextTemplate" style="flex:1;min-width:140px;font-size:12px;padding:10px">⬇ Baixar .txt</button>
    </div>

    <div class="card" style="padding:14px;background:#181818;border-color:#383838;margin-top:4px">
      <div class="row" style="margin-bottom:8px">
        <strong style="font-size:13px;color:#ff851b">📝 Colar texto e importar agora</strong>
      </div>
      <p class="muted" style="font-size:11px;margin:0 0 8px">Recebeu a ficha do seu Personal por WhatsApp ou e-mail? Cole o texto abaixo e importe diretamente:</p>
      <textarea id="pasteWorkoutInput" placeholder="Cole aqui o texto com Treino A, B, C, D..." style="width:100%;height:90px;background:#0d0d0d;color:#fff;border:1px solid #383838;border-radius:8px;padding:8px;font-family:monospace;font-size:11px;box-sizing:border-box"></textarea>
      <button type="button" class="primary" id="btnImportPastedText" style="width:100%;margin-top:8px;padding:10px;font-size:13px">▶ Importar treino colado</button>
    </div>

    <details style="font-size:11px;color:#888;margin-top:4px">
      <summary style="cursor:pointer;color:#aaa">Ver formato técnico avançado (JSON para desenvolvedores)</summary>
      <div style="margin-top:8px">
        <div style="background:#0a0a0a;border:1px solid #282828;border-radius:8px;padding:10px;max-height:160px;overflow-y:auto;font-family:monospace;font-size:10px;color:#ccc;white-space:pre-wrap">${esc(jsonStr)}</div>
        <div class="row" style="gap:6px;margin-top:6px">
          <button type="button" class="ghost" id="btnCopyJsonTemplate" style="flex:1;font-size:11px;padding:6px">Copiar JSON</button>
          <button type="button" class="ghost" id="btnDownloadJsonTemplate" style="flex:1;font-size:11px;padding:6px">Baixar .json</button>
        </div>
      </div>
    </details>

    <button type="button" class="ghost" data-close style="margin-top:4px">Fechar</button>
  </div>`;

  modal.showModal();
  modalContent.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.close());

  modalContent.querySelector('#btnCopyTextTemplate').onclick = async () => {
    try {
      await navigator.clipboard.writeText(textTemplate);
      showToast('Modelo de texto copiado!');
    } catch {
      showToast('Selecione e copie o texto acima.');
    }
  };

  modalContent.querySelector('#btnDownloadTextTemplate').onclick = () => {
    downloadText(textTemplate, 'modelo-treino-personal-mab.txt');
    showToast('Arquivo modelo (.txt) baixado');
  };

  modalContent.querySelector('#btnImportPastedText').onclick = async () => {
    const text = modalContent.querySelector('#pasteWorkoutInput')?.value.trim();
    if (!text) {
      showToast('Cole o texto da ficha de treino antes de importar.');
      return;
    }
    try {
      let obj = null;
      try {
        obj = JSON.parse(text);
      } catch {
        obj = parseTextWorkout(text);
      }
      modal.close();
      await importPersonalTraining(obj);
    } catch (err) {
      showToast(err.message || 'Erro ao processar texto do treino.');
    }
  };

  modalContent.querySelector('#btnCopyJsonTemplate')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      showToast('Modelo JSON copiado!');
    } catch {
      showToast('Selecione e copie o texto acima.');
    }
  });

  modalContent.querySelector('#btnDownloadJsonTemplate')?.addEventListener('click', () => {
    downloadText(jsonStr, 'modelo-treino-personal-mab.json');
    showToast('Arquivo modelo (.json) baixado');
  });
}

async function exportExercisesModal() {
  const exercises = (await repo.all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  if (!exercises.length) {
    showToast('Nenhum exercício cadastrado para exportar.');
    return;
  }

  modalContent.innerHTML = `<div class="stack" style="gap:10px">
    <div class="row" style="margin-bottom:0">
      <div>
        <div class="muted" style="font-size:11px;color:#ff851b;font-weight:700">EXPORTAÇÃO DE EXERCÍCIOS</div>
        <h2 style="margin:2px 0 0;font-size:18px">Exportar base cadastrada</h2>
      </div>
      <button type="button" class="ghost" data-close style="padding:4px 10px">✕</button>
    </div>
    <p class="muted" style="font-size:12px;margin:0 0 2px">
      Selecione os exercícios para gerar o arquivo TXT com todos os campos cadastrados:
    </p>

    <div class="row" style="gap:8px;align-items:center;padding:4px 0">
      <button type="button" class="chip active" id="btnToggleAllExercises" style="flex:1;min-height:42px;font-size:12px;padding:8px 10px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px">Desmarcar todos</button>
      <button type="button" class="primary" id="btnDownloadSelectedTxt" style="flex:1;min-height:42px;font-size:12px;font-weight:800;padding:8px 10px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px;transition:opacity .15s">⬇ Baixar TXT (${exercises.length})</button>
    </div>

    <div class="row" style="justify-content:space-between;align-items:center;margin-top:-2px">
      <span class="muted" id="selectedExercisesCount" style="font-size:11px">Total selecionado: ${exercises.length} de ${exercises.length}</span>
    </div>

    <input type="text" id="filterExportExercisesInput" placeholder="Filtrar exercícios..." style="width:100%;padding:8px 12px;background:#0a0a0a;border:1px solid #333;border-radius:8px;color:#fff;font-size:12px;box-sizing:border-box">

    <div id="exportExercisesList" style="display:flex;flex-direction:column;gap:6px;height:185px;max-height:185px;overflow-y:auto;padding-right:4px;-webkit-overflow-scrolling:touch">
      ${exercises.map(ex => {
        const primary = ex.primaryMuscleGroup || ex.muscleGroup || 'Peitoral';
        const secondaries = Array.isArray(ex.secondaryMuscleGroups) && ex.secondaryMuscleGroups.length ? ex.secondaryMuscleGroups.join(', ') : 'Nenhum';
        return `<label class="export-ex-item" data-name="${esc((ex.name || '').toLowerCase())}" style="padding:8px 10px;gap:8px">
          <input type="checkbox" name="selectedEx" value="${esc(ex.id)}" checked style="margin-top:2px">
          <div style="flex:1;min-width:0">
            <strong style="display:block;font-size:13px;color:#fff;line-height:1.25">${esc(ex.name)}</strong>
            <div class="muted" style="font-size:10px;margin-top:2px">
              Principal: <span style="color:#ddd">${esc(primary)}</span> · Secundários: <span style="color:#bbb">${esc(secondaries)}</span>
            </div>
            <div class="muted" style="font-size:10px">
              ${ex.equipment ? `Equipamento: ${esc(ex.equipment)} · ` : ''}${ex.videoUrl ? `▶ Vídeo · ` : ''}${ex.active !== false ? 'Ativo' : 'Inativo'}
            </div>
          </div>
        </label>`;
      }).join('')}
    </div>
  </div>`;

  modal.showModal();
  modalContent.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.close());

  const listEl = modalContent.querySelector('#exportExercisesList');
  const countEl = modalContent.querySelector('#selectedExercisesCount');
  const toggleBtn = modalContent.querySelector('#btnToggleAllExercises');
  const filterInput = modalContent.querySelector('#filterExportExercisesInput');
  const dlBtn = modalContent.querySelector('#btnDownloadSelectedTxt');

  let allSelected = true;

  const updateCount = () => {
    const checked = listEl.querySelectorAll('input[type="checkbox"]:checked').length;
    countEl.textContent = `Total selecionado: ${checked} de ${exercises.length}`;
    if (checked === 0) {
      dlBtn.disabled = true;
      dlBtn.style.opacity = '0.38';
      dlBtn.style.cursor = 'not-allowed';
      dlBtn.textContent = '⬇ Baixar TXT (0)';
      toggleBtn.textContent = 'Selecionar todos';
      toggleBtn.classList.remove('active');
      allSelected = false;
    } else {
      dlBtn.disabled = false;
      dlBtn.style.opacity = '1';
      dlBtn.style.cursor = 'pointer';
      dlBtn.textContent = `⬇ Baixar TXT (${checked})`;
      if (checked === exercises.length) {
        toggleBtn.textContent = 'Desmarcar todos';
        toggleBtn.classList.add('active');
        allSelected = true;
      } else {
        toggleBtn.textContent = 'Selecionar todos';
        toggleBtn.classList.remove('active');
        allSelected = false;
      }
    }
  };

  listEl.addEventListener('change', updateCount);

  toggleBtn.onclick = () => {
    allSelected = !allSelected;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = allSelected);
    updateCount();
  };

  filterInput.oninput = () => {
    const q = filterInput.value.toLowerCase().trim();
    listEl.querySelectorAll('.export-ex-item').forEach(item => {
      item.style.display = item.dataset.name.includes(q) ? '' : 'none';
    });
  };

  const generateTxtExport = () => {
    const selectedIds = new Set([...listEl.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value));
    const selected = exercises.filter(ex => selectedIds.has(ex.id));
    if (!selected.length) {
      showToast('Selecione ao menos um exercício para exportar.');
      return null;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let txt = `# BASE DE EXERCÍCIOS MAB PERSONAL\n`;
    txt += `# Data da exportação: ${dateStr} às ${timeStr}\n`;
    txt += `# Total de exercícios exportados: ${selected.length}\n`;
    txt += `============================================================\n\n`;

    selected.forEach((ex, idx) => {
      const primary = ex.primaryMuscleGroup || ex.muscleGroup || 'Peitoral';
      const secondaries = Array.isArray(ex.secondaryMuscleGroups) && ex.secondaryMuscleGroups.length
        ? ex.secondaryMuscleGroups.join(', ')
        : 'Nenhum';

      txt += `${idx + 1}. ${ex.name}\n`;
      txt += `   - Grupo Muscular Principal: ${primary}\n`;
      txt += `   - Grupos Secundários (sinergistas): ${secondaries}\n`;
      txt += `   - Equipamento: ${ex.equipment || 'Não informado'}\n`;
      txt += `   - Vídeo de Execução: ${ex.videoUrl || 'Não informado'}\n`;
      txt += `   - Observações: ${ex.notes || 'Nenhuma'}\n`;
      txt += `   - Status: ${ex.active !== false ? 'Ativo' : 'Inativo'}\n\n`;
    });

    txt += `============================================================\n`;
    return { txt, count: selected.length };
  };

  dlBtn.onclick = () => {
    const res = generateTxtExport();
    if (!res) return;
    const dateSlug = new Date().toISOString().slice(0, 10);
    downloadText(res.txt, `mab-exercicios-cadastrados-${dateSlug}.txt`);
    showToast(`Arquivo TXT com ${res.count} exercícios baixado!`);
  };
}

function parseExercisesTxt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Conteúdo do arquivo vazio.');
  }

  const lines = text.split(/\r?\n/);
  const items = [];
  let current = null;

  const isHeader = line => line.startsWith('#') || line.startsWith('===') || line.startsWith('---');

  const cleanVal = v => {
    const s = String(v || '').trim();
    if (!s || s.toLowerCase() === 'não informado' || s.toLowerCase() === 'nao informado' || s.toLowerCase() === 'nenhum' || s.toLowerCase() === 'nenhuma' || s === '-') return '';
    return s;
  };

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isHeader(line)) continue;

    const numMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
    if (numMatch) {
      if (current && current.name) items.push(current);
      current = {
        name: numMatch[1].trim(),
        primaryMuscleGroup: 'Peitoral',
        secondaryMuscleGroups: [],
        equipment: '',
        videoUrl: '',
        notes: '',
        active: true
      };
      continue;
    }

    if (current) {
      const cleanField = line.replace(/^[-*•\d.]+\s*/, '').trim();

      const mPrimary = cleanField.match(/^(?:grupo\s*muscular\s*principal|grupo\s*principal|m[uú]sculo\s*principal|grupo)\s*[:=]\s*(.*)$/i);
      if (mPrimary) {
        const val = cleanVal(mPrimary[1]);
        if (val) current.primaryMuscleGroup = val;
        continue;
      }

      const mSecondary = cleanField.match(/^(?:grupos?\s*secund[aá]rios?\s*(?:\(sinergistas\))?|secund[aá]rios?|sinergistas?)\s*[:=]\s*(.*)$/i);
      if (mSecondary) {
        const val = cleanVal(mSecondary[1]);
        if (val) {
          current.secondaryMuscleGroups = val.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        }
        continue;
      }

      const mEquip = cleanField.match(/^(?:equipamento|aparelho|equip)\s*[:=]\s*(.*)$/i);
      if (mEquip) {
        current.equipment = cleanVal(mEquip[1]);
        continue;
      }

      const mVideo = cleanField.match(/^(?:v[ií]deo(?:\s*de\s*execu[cç][aã]o)?|link)\s*[:=]\s*(.*)$/i);
      if (mVideo) {
        current.videoUrl = cleanVal(mVideo[1]);
        continue;
      }

      const mNotes = cleanField.match(/^(?:observa[cç][oõ]es?|obs|notas?)\s*[:=]\s*(.*)$/i);
      if (mNotes) {
        current.notes = cleanVal(mNotes[1]);
        continue;
      }

      const mStatus = cleanField.match(/^(?:status|ativo)\s*[:=]\s*(.*)$/i);
      if (mStatus) {
        const val = cleanVal(mStatus[1]).toLowerCase();
        current.active = !(val === 'inativo' || val === 'false' || val === 'não' || val === 'nao');
        continue;
      }

      if (!line.includes(':') && !line.startsWith('-')) {
        if (current && current.name) items.push(current);
        current = {
          name: line,
          primaryMuscleGroup: 'Peitoral',
          secondaryMuscleGroups: [],
          equipment: '',
          videoUrl: '',
          notes: '',
          active: true
        };
        continue;
      }
    } else {
      if (!line.includes(':')) {
        current = {
          name: line.replace(/^[-*•\d.]+\s*/, '').trim(),
          primaryMuscleGroup: 'Peitoral',
          secondaryMuscleGroups: [],
          equipment: '',
          videoUrl: '',
          notes: '',
          active: true
        };
      }
    }
  }

  if (current && current.name) items.push(current);

  if (!items.length) {
    throw new Error('Nenhum exercício válido foi identificado no texto ou arquivo.');
  }

  return items;
}

async function importExercisesBatch(exercisesList) {
  if (!Array.isArray(exercisesList) || !exercisesList.length) {
    throw new Error('Nenhum exercício para importar.');
  }

  const confirmMsg = `Importar ${exercisesList.length} ${exercisesList.length === 1 ? 'exercício' : 'exercícios'} para a biblioteca?\n\nExercícios existentes serão atualizados e novos exercícios serão cadastrados.`;
  if (!confirm(confirmMsg)) return;

  const now = new Date().toISOString();
  const allExisting = await repo.all('exercises');
  const exByName = new Map();
  for (const ex of allExisting) {
    const key = (ex.nameNormalized || ex.name || '').trim().toLowerCase();
    if (key) exByName.set(key, ex);
  }

  let createdCount = 0;
  let updatedCount = 0;
  const newCustomGroups = new Set();

  for (const item of exercisesList) {
    const name = String(item.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();

    const primary = String(item.primaryMuscleGroup || 'Peitoral').trim();
    const secondaries = Array.isArray(item.secondaryMuscleGroups)
      ? item.secondaryMuscleGroups.map(s => String(s || '').trim()).filter(Boolean)
      : [];

    if (primary && !BASE_MUSCLE_GROUPS.includes(primary)) newCustomGroups.add(primary);
    secondaries.forEach(g => {
      if (g && !BASE_MUSCLE_GROUPS.includes(g)) newCustomGroups.add(g);
    });

    const existing = exByName.get(key);
    if (existing) {
      existing.primaryMuscleGroup = primary || existing.primaryMuscleGroup || existing.muscleGroup;
      existing.muscleGroup = primary || existing.muscleGroup;
      if (secondaries.length) existing.secondaryMuscleGroups = secondaries;
      if (item.equipment !== undefined) existing.equipment = item.equipment;
      if (item.videoUrl !== undefined) existing.videoUrl = item.videoUrl;
      if (item.notes !== undefined) existing.notes = item.notes;
      if (item.active !== undefined) existing.active = item.active;
      existing.updatedAt = now;
      await repo.put('exercises', existing);
      updatedCount++;
    } else {
      const newEx = {
        id: repo.uuid(),
        name,
        nameNormalized: key,
        muscleGroup: primary,
        primaryMuscleGroup: primary,
        secondaryMuscleGroups: secondaries,
        equipment: item.equipment || '',
        videoUrl: item.videoUrl || '',
        notes: item.notes || '',
        active: item.active !== false,
        createdAt: now,
        updatedAt: now
      };
      await repo.put('exercises', newEx);
      exByName.set(key, newEx);
      createdCount++;
    }
  }

  for (const g of newCustomGroups) {
    await addCustomMuscleGroup(g);
  }

  showToast(`Importação concluída! (${createdCount} novos, ${updatedCount} atualizados)`);
  render();
}

function importExercisesModal() {
  const textTemplate = `# BASE DE EXERCÍCIOS MAB PERSONAL
============================================================

1. Supino Reto com Barra
   - Grupo Muscular Principal: Peitoral
   - Grupos Secundários (sinergistas): Tríceps, Ombros
   - Equipamento: Barra e Banco
   - Vídeo de Execução: https://www.youtube.com/watch?v=rT7DgCr-3pg
   - Observações: Pausa de 1s na fase excêntrica
   - Status: Ativo

2. Agachamento Livre com Barra
   - Grupo Muscular Principal: Quadríceps
   - Grupos Secundários (sinergistas): Glúteos, Posterior, Core
   - Equipamento: Barra Olímpica
   - Vídeo de Execução: https://www.youtube.com/watch?v=bEv6CCg2BC8
   - Observações: Profundidade controlada
   - Status: Ativo

3. Puxada Frontal na Polia
   - Grupo Muscular Principal: Costas
   - Grupos Secundários (sinergistas): Bíceps, Ombros
   - Equipamento: Polia Alta
   - Vídeo de Execução: https://www.youtube.com/watch?v=CAwf7n6Luuc
   - Observações: Foco na adução das escápulas
   - Status: Ativo

============================================================`;

  modalContent.innerHTML = `<div class="stack" style="max-height:86vh;overflow-y:auto">
    <div class="row">
      <div>
        <div class="muted" style="font-size:11px;color:#ff851b;font-weight:700">BASE DE EXERCÍCIOS (IMPORTAÇÃO EM LOTE)</div>
        <h2 style="margin:2px 0 0">Como preencher e importar</h2>
      </div>
      <button type="button" class="ghost" data-close>✕</button>
    </div>

    <div class="card" style="padding:14px;background:#151515;border-color:#333">
      <div style="font-weight:700;color:#ff851b;font-size:13px;margin-bottom:8px">CAMPOS DO CADASTRO DE EXERCÍCIOS</div>
      <div class="grid two" style="gap:8px;font-size:12px">
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🏋️ Nome do Exercício</strong>
          <span class="muted">Ex.: Supino Reto com Barra, Agachamento Livre</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🎯 Grupo Muscular Principal</strong>
          <span class="muted">Ex.: Peitoral, Costas, Quadríceps, Ombros, etc.</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🤝 Grupos Secundários</strong>
          <span class="muted">Sinergistas/apoio separados por vírgula (ex.: Tríceps, Ombros)</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🛠️ Equipamento</strong>
          <span class="muted">Ex.: Barra e Banco, Máquina, Halteres, Polia</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">🎬 Vídeo de Execução (opcional)</strong>
          <span class="muted">Link do YouTube para visualização no app</span>
        </div>
        <div style="background:#0e0e0e;padding:10px;border-radius:10px;border:1px solid #282828">
          <strong style="display:block;color:#fff">📝 Observações (opcional)</strong>
          <span class="muted">Dicas posturais ou cuidados de execução</span>
        </div>
      </div>
    </div>

    <div>
      <div class="row" style="margin-bottom:6px">
        <span style="font-weight:700;font-size:13px">Modelo em Texto (.txt / Bloco de Notas)</span>
        <span class="muted" style="font-size:11px">Formato idêntico à exportação</span>
      </div>
      <div style="background:#0a0a0a;border:1px solid #333;border-radius:12px;padding:12px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;color:#eee;white-space:pre-wrap;line-height:1.45" id="templateExercisesTextBlock">${esc(textTemplate)}</div>
    </div>

    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button type="button" class="secondary" id="btnCopyExercisesTextTemplate" style="flex:1;min-width:130px;font-size:12px;padding:10px">📋 Copiar texto</button>
      <button type="button" class="primary" id="btnDownloadExercisesTextTemplate" style="flex:1;min-width:130px;font-size:12px;padding:10px">⬇ Baixar .txt</button>
      <button type="button" class="ghost" id="btnSelectExercisesTxtFile" style="flex:1;min-width:130px;font-size:12px;padding:10px;border-color:rgba(255,133,27,0.4);color:#ff851b">📁 Carregar arquivo</button>
    </div>

    <div class="card" style="padding:14px;background:#181818;border-color:#383838;margin-top:4px">
      <div class="row" style="margin-bottom:8px">
        <strong style="font-size:13px;color:#ff851b">📝 Colar texto e importar agora</strong>
      </div>
      <p class="muted" style="font-size:11px;margin:0 0 8px">Já tem a lista de exercícios? Cole o texto abaixo e importe para sua biblioteca:</p>
      <textarea id="pasteExercisesTxtInput" placeholder="Cole aqui o texto da lista de exercícios formatada..." style="width:100%;height:90px;background:#0d0d0d;color:#fff;border:1px solid #383838;border-radius:8px;padding:8px;font-family:monospace;font-size:11px;box-sizing:border-box"></textarea>
      <button type="button" class="primary" id="btnImportPastedExercises" style="width:100%;margin-top:8px;padding:10px;font-size:13px">▶ Importar exercícios colados</button>
    </div>

    <button type="button" class="ghost" data-close style="margin-top:4px">Fechar</button>
  </div>`;

  modal.showModal();
  modalContent.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.close());

  modalContent.querySelector('#btnCopyExercisesTextTemplate').onclick = async () => {
    try {
      await navigator.clipboard.writeText(textTemplate);
      showToast('Modelo de exercícios copiado!');
    } catch {
      showToast('Selecione e copie o texto acima.');
    }
  };

  modalContent.querySelector('#btnDownloadExercisesTextTemplate').onclick = () => {
    downloadText(textTemplate, 'modelo-base-exercicios-mab.txt');
    showToast('Arquivo modelo (.txt) baixado');
  };

  modalContent.querySelector('#btnSelectExercisesTxtFile').onclick = () => {
    document.querySelector('#importExercisesTxtInput')?.click();
  };

  modalContent.querySelector('#btnImportPastedExercises').onclick = async () => {
    const text = modalContent.querySelector('#pasteExercisesTxtInput')?.value.trim();
    if (!text) {
      showToast('Cole o texto dos exercícios antes de importar.');
      return;
    }
    try {
      const parsed = parseExercisesTxt(text);
      modal.close();
      await importExercisesBatch(parsed);
    } catch (err) {
      showToast(err.message || 'Erro ao processar texto de exercícios.');
    }
  };
}

async function exportPersonalTraining() {
  const cycle = await activeCycle();
  const [items, exercises, workoutGroups] = await Promise.all([
    repo.all('planItems'),
    repo.all('exercises'),
    repo.all('workoutGroups')
  ]);
  const exById = new Map(exercises.map(e => [e.id, e]));
  const codes = ['A', 'B', 'C', 'D'];
  const treinos = {};

  for (const code of codes) {
    const wg = workoutGroups.find(g => g.cycleId === cycle?.id && g.code === code);
    let titulo = `Treino ${code}`;
    if (wg?.description) {
      titulo = `Treino ${code} - ${wg.description}`;
    }
    const groupItems = items
      .filter(x => x.cycleId === cycle?.id && x.groupCode === code && x.active)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const exercicios = groupItems.map(item => {
      const ex = exById.get(item.exerciseId) || {};
      const primary = ex.primaryMuscleGroup || ex.muscleGroup || 'Peitoral';
      const secondaries = Array.isArray(ex.secondaryMuscleGroups)
        ? ex.secondaryMuscleGroups.filter(g => g !== primary)
        : [];
      return {
        nome: ex.name || 'Exercício',
        grupoPrincipal: primary,
        gruposSecundarios: secondaries,
        equipamento: ex.equipment || '',
        videoUrl: ex.videoUrl || '',
        series: Number(item.sets) || 3,
        repsMin: Number(item.minReps) || 8,
        repsMax: Number(item.maxReps) || 12,
        rirAlvo: item.rirTarget != null ? Number(item.rirTarget) : 2,
        descansoSegundos: Number(item.restSeconds) || 90,
        observacoes: ex.notes || ''
      };
    });

    treinos[code] = {
      titulo,
      exercicios
    };
  }

  const payload = {
    tipo: 'MAB_TREINO_PERSONAL',
    versaoFormato: 1,
    ciclo: {
      nome: cycle?.name || 'Hipertrofia - Foco em Superiores e Pernas',
      observacoes: cycle?.goal || 'Prescrito pelo Personal Trainer'
    },
    treinos
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mab-treino-personal-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Treinos do Personal exportados');
}

async function importPersonalTraining(obj) {
  if (!obj || (obj.tipo !== 'MAB_TREINO_PERSONAL' && !obj.treinos)) {
    throw new Error('Arquivo inválido. O arquivo selecionado não contém o formato de treino do Personal Trainer.');
  }

  const treinos = obj.treinos || {};
  const codes = ['A', 'B', 'C', 'D'];
  const summaryParts = [];
  let totalExercises = 0;

  for (const c of codes) {
    const list = Array.isArray(treinos[c]?.exercicios) ? treinos[c].exercicios : [];
    totalExercises += list.length;
    summaryParts.push(`Treino ${c}: ${list.length} ${list.length === 1 ? 'exercício' : 'exercícios'}`);
  }

  const cycleName = obj.ciclo?.nome || 'Prescrição do Personal Trainer';
  const cycleObs = obj.ciclo?.observacoes || '';

  const confirmMsg = `Importar treinos do Personal Trainer?\n\nCiclo: ${cycleName}\n${summaryParts.join('\n')}\n\nNota: Seu histórico de treinos concluídos, cargas e avaliações será preservado.`;
  if (!confirm(confirmMsg)) return;

  const now = new Date().toISOString();
  let cycle = await activeCycle();

  if (cycle) {
    cycle.name = cycleName;
    if (cycleObs) cycle.goal = cycleObs;
    cycle.updatedAt = now;
    await repo.put('cycles', cycle);
  } else {
    cycle = {
      id: repo.uuid(),
      name: cycleName,
      startDate: now.slice(0, 10),
      endDate: '',
      goal: cycleObs || 'Hipertrofia',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    await repo.put('cycles', cycle);
  }

  const allExercises = await repo.all('exercises');
  const exByName = new Map();
  for (const ex of allExercises) {
    const key = (ex.nameNormalized || ex.name || '').trim().toLowerCase();
    if (key) exByName.set(key, ex);
  }

  const allGroups = await repo.all('workoutGroups');
  const allPlanItems = await repo.all('planItems');

  // Inativa todos os outros exercícios pré-existentes dos treinos A, B, C e D de musculação no ciclo atual
  for (const item of allPlanItems) {
    if (item.cycleId === cycle.id && ['A', 'B', 'C', 'D'].includes(item.groupCode)) {
      if (item.active !== false) {
        item.active = false;
        item.updatedAt = now;
        await repo.put('planItems', item);
      }
    }
  }

  for (const code of codes) {
    const tData = treinos[code];
    if (!tData) continue;

    if (tData.titulo) {
      let desc = tData.titulo.replace(/^Treino\s+[A-D]\s*[-·]\s*/i, '').trim();
      if (!desc) desc = tData.titulo;
      let wg = allGroups.find(g => g.cycleId === cycle.id && g.code === code);
      if (wg) {
        wg.description = desc;
        await repo.put('workoutGroups', wg);
      } else {
        wg = {
          id: repo.uuid(),
          cycleId: cycle.id,
          code,
          description: desc
        };
        await repo.put('workoutGroups', wg);
        allGroups.push(wg);
      }
    }

    const exList = Array.isArray(tData.exercicios) ? tData.exercicios : [];

    for (let i = 0; i < exList.length; i++) {
      const rawEx = exList[i];
      const exName = String(rawEx.nome || rawEx.name || '').trim();
      if (!exName) continue;
      const key = exName.toLowerCase();
      let ex = exByName.get(key);

      const primary = String(rawEx.grupoPrincipal || rawEx.muscleGroup || rawEx.primaryMuscleGroup || 'Peitoral').trim();
      let secondaries = [];
      if (Array.isArray(rawEx.gruposSecundarios || rawEx.secondaryMuscleGroups)) {
        secondaries = (rawEx.gruposSecundarios || rawEx.secondaryMuscleGroups).map(String).map(s => s.trim()).filter(Boolean);
      } else if (typeof (rawEx.gruposSecundarios || rawEx.secondaryMuscleGroups) === 'string') {
        secondaries = (rawEx.gruposSecundarios || rawEx.secondaryMuscleGroups).split(',').map(s => s.trim()).filter(Boolean);
      }
      secondaries = secondaries.filter(g => g !== primary);

      const equip = String(rawEx.equipamento || rawEx.equipment || '').trim();
      const video = String(rawEx.videoUrl || '').trim();
      const notes = String(rawEx.observacoes || rawEx.notes || '').trim();

      if (ex) {
        ex.primaryMuscleGroup = primary || ex.primaryMuscleGroup || ex.muscleGroup;
        ex.muscleGroup = primary || ex.muscleGroup;
        if (secondaries.length) ex.secondaryMuscleGroups = secondaries;
        if (equip) ex.equipment = equip;
        if (video) ex.videoUrl = video;
        if (notes) ex.notes = notes;
        ex.active = true;
        ex.updatedAt = now;
        await repo.put('exercises', ex);
      } else {
        ex = {
          id: repo.uuid(),
          name: exName,
          nameNormalized: key,
          muscleGroup: primary,
          primaryMuscleGroup: primary,
          secondaryMuscleGroups: secondaries,
          equipment: equip,
          videoUrl: video,
          notes: notes,
          active: true,
          createdAt: now,
          updatedAt: now
        };
        await repo.put('exercises', ex);
        exByName.set(key, ex);
        allExercises.push(ex);
      }

      await repo.put('planItems', {
        id: repo.uuid(),
        cycleId: cycle.id,
        groupCode: code,
        exerciseId: ex.id,
        order: i + 1,
        sets: Number(rawEx.series || rawEx.sets) || 3,
        minReps: Number(rawEx.repsMin ?? rawEx.minReps) || 8,
        maxReps: Number(rawEx.repsMax ?? rawEx.maxReps) || 12,
        rirTarget: rawEx.rirAlvo != null ? Number(rawEx.rirAlvo) : (rawEx.rirTarget != null ? Number(rawEx.rirTarget) : 2),
        restSeconds: Number(rawEx.descansoSegundos ?? rawEx.restSeconds) || 90,
        active: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  showToast(`Treinos do Personal importados! (${totalExercises} exercícios)`);
  render();
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.actPeriod) {
    b.parentElement?.querySelectorAll('[data-act-period]').forEach(chip => chip.classList.toggle('active', chip === b));
    actChartPeriod = b.dataset.actPeriod;
    renderActivityChart(document.querySelector('#activityChartMetric')?.value || 'frequency');
    return;
  }
  if (b.dataset.actSubview) {
    b.parentElement?.querySelectorAll('[data-act-subview]').forEach(chip => chip.classList.toggle('active', chip === b));
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
  if (a === 'view-detail') {
    if (typeof window.openDetail === 'function') window.openDetail(b.dataset.kind, b.dataset.id);
  }
  if (a === 'export-period') exportPeriodForm();
  if (a === 'export-personal-plan') {
    exportPersonalTraining().catch(e => showToast(e.message));
  }
  if (a === 'import-personal-plan') {
    document.querySelector('#importPersonalInput')?.click();
  }
  if (a === 'view-personal-template') {
    showPersonalTemplateModal();
  }
  if (a === 'export-exercises-dialog') {
    exportExercisesModal().catch(e => showToast(e.message));
  }
  if (a === 'import-exercises-dialog') {
    importExercisesModal();
  }
});
document.querySelectorAll('.bottom-nav button').forEach(b => b.onclick = () => navigate(b.dataset.route));
document.querySelector('#settingsBtn').onclick = settings;
document.querySelector('#importInput').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let obj = null;
    try {
      obj = JSON.parse(text);
    } catch {
      if (/treino\s*[a-d]/i.test(text)) {
        obj = parseTextWorkout(text);
      }
    }
    if (obj && (obj.tipo === 'MAB_TREINO_PERSONAL' || (obj.treinos && (obj.treinos.A || obj.treinos.B || obj.treinos.C || obj.treinos.D)))) {
      await importPersonalTraining(obj);
      modal.close();
      return;
    }
    const counts = obj?.metadata?.recordCounts || {};
    if (!confirm(`Restaurar backup de ${obj?.metadata?.exportedAt||'data desconhecida'}?\nExercícios: ${counts.exercises||0}\nSéries: ${counts.executedSets||0}`)) return;
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
document.querySelector('#importPersonalInput')?.addEventListener('change', async e => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let obj = null;
    try {
      obj = JSON.parse(text);
    } catch {
      obj = parseTextWorkout(text);
    }
    await importPersonalTraining(obj);
    modal.close();
  } catch (err) {
    showToast(err.message || 'Erro ao importar treino do Personal.');
  } finally {
    e.target.value = '';
  }
});
document.querySelector('#importExercisesTxtInput')?.addEventListener('change', async e => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseExercisesTxt(text);
    modal.close();
    await importExercisesBatch(parsed);
  } catch (err) {
    showToast(err.message || 'Erro ao importar arquivo TXT de exercícios.');
  } finally {
    e.target.value = '';
  }
});
window.addEventListener('routechange', render);
window.addEventListener('focus', () => route() === 'workout' && render());
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && route() === 'workout') {
    if ((await openSessions()).length) await requestScreenWakeLock();
    render()
  }
});
window.activityForm = activityForm;
window.render = render;
await seed();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
if (navigator.storage?.persist) navigator.storage.persist();
render();