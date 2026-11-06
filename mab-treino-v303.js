import {
  repo
} from './repositories.js';
const VERSION = '3.0.3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWorkoutContext() {
  const sessions = await repo.all('workoutSessions');
  const current = sessions.find(s => s.status === 'in_progress');
  if (!current) return null;
  const items = (await repo.all('planItems')).filter(x => x.cycleId === current.cycleId && x.groupCode === current.groupCode && x.active).sort((a, b) => a.order - b.order);
  const exercises = await repo.all('exercises');
  const index = Math.min(current.currentIndex || 0, Math.max(items.length - 1, 0));
  const item = items[index];
  if (!item) return {
    current,
    items,
    exercises,
    index,
    item: null
  };
  return {
    current,
    items,
    exercises,
    index,
    item
  };
}
async function getPreviousSeries(context) {
  const {
    current,
    item
  } = context;
  if (!item) return [];
  const sessions = (await repo.all('workoutSessions')).filter(s => s.status === 'completed' && s.id !== current.id && s.groupCode === current.groupCode).sort((a, b) => (b.finishedAt || b.startedAt || '').localeCompare(a.finishedAt || a.startedAt || ''));
  const sets = await repo.all('executedSets');
  for (const session of sessions) {
    const match = sets.filter(s => s.sessionId === session.id && s.exerciseId === item.exerciseId && s.completed).sort((a, b) => a.setNumber - b.setNumber);
    if (match.length) return match;
  }
  return [];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  } [c]));
}

function insertVideoLink(context) {
  const ex = context.exercises.find(e => e.id === context.item.exerciseId);
  document.querySelector('#mabExerciseVideo')?.remove();
  if (!ex?.videoUrl) return;
  const h2 = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === ex.name);
  if (!h2) return;
  const a = document.createElement('a');
  a.id = 'mabExerciseVideo';
  a.href = ex.videoUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = '▶ Ver execução';
  a.style.cssText = 'display:inline-flex;margin-top:8px;color:#ff851b;font-weight:700;text-decoration:none;font-size:16px;';
  h2.insertAdjacentElement('afterend', a);
}

function ensureInfoArea(nextButton) {
  let area = document.querySelector('#mabNextExerciseInfo');
  if (!area) {
    area = document.createElement('div');
    area.id = 'mabNextExerciseInfo';
    area.className = 'mab-next-exercise';
    nextButton.parentElement?.insertBefore(area, nextButton);
  }
  return area;
}

function ensureV293Styles() {
  if (document.querySelector('#mabV293Styles')) return;
  const style = document.createElement('style');
  style.id = 'mabV293Styles';
  style.textContent = `
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
`;
  document.head.appendChild(style);
}
async function enhanceWorkout() {
  if (!document.querySelector('[data-action="save-set"]')) return;
  ensureV293Styles();
  const context = await getWorkoutContext();
  if (!context?.item) return;
  const {
    items,
    exercises,
    index
  } = context;
  insertVideoLink(context);
  const previous = await getPreviousSeries(context);
  const savedCurrent = (await repo.all('executedSets')).filter(s => s.sessionId === context.current.id && s.exerciseId === context.item.exerciseId);
  document.querySelectorAll('.set-row').forEach((row, rowIndex) => {
    const seriesNumber = rowIndex + 1;
    const alreadySaved = savedCurrent.some(s => s.setNumber === seriesNumber && s.completed);
    const prior = previous.find(s => s.setNumber === seriesNumber);
    const kg = row.querySelector('[data-set="weight"]');
    const reps = row.querySelector('[data-set="reps"]');
    const rir = row.querySelector('[data-set="rir"]');
    [kg, reps, rir].forEach(input => {
      if (input) input.style.fontSize = '16px';
    });
    row.querySelector('.mab-load-reference')?.remove();
    row.querySelector('.mab-previous-row')?.remove();
    if (prior) {
      const ref = document.createElement('div');
      ref.className = 'mab-previous-row';
      ref.setAttribute('aria-label', `Execução anterior da série ${seriesNumber}`);
      ref.innerHTML = `<span class="mab-label">Anterior</span><span class="mab-value">${escapeHtml(prior.reps??'-')}</span><span class="mab-value">${escapeHtml(prior.weight??'-')}</span><span class="mab-value">${escapeHtml(prior.rir??'-')}</span><span></span>`;
      row.appendChild(ref);
    }
    if (alreadySaved) row.classList.add('mab-series-saved');
    else row.classList.remove('mab-series-saved');
  });
  const nextButton = document.querySelector('[data-action="next"]');
  if (!nextButton) return;
  const isLast = index >= items.length - 1;
  const info = ensureInfoArea(nextButton);
  if (isLast) {
    nextButton.hidden = true;
    info.hidden = true;
    info.innerHTML = '';
  } else {
    nextButton.hidden = false;
    info.hidden = false;
    const nextItem = items[index + 1];
    const nextExercise = exercises.find(e => e.id === nextItem?.exerciseId);
    nextButton.disabled = false;
    nextButton.textContent = 'Próximo →';
    nextButton.removeAttribute('aria-disabled');
    info.innerHTML = `<span class="muted">A seguir</span><strong>${escapeHtml(nextExercise?.name||'Próximo exercício')}</strong>`;
  }
}

function restoreViewport() {
  const active = document.activeElement;
  if (active && typeof active.blur === 'function') active.blur();
  document.body.style.zoom = '1';
  document.documentElement.style.zoom = '1';
  window.scrollTo({
    top: Math.max(0, window.scrollY - 1),
    behavior: 'smooth'
  });
}
document.addEventListener('click', async event => {
  const save = event.target.closest('[data-action="save-set"]');
  if (!save) return;
  await sleep(120);
  restoreViewport();
  await sleep(180);
  await enhanceWorkout();
}, true);
const observer = new MutationObserver(() => {
  clearTimeout(window.__mabV293Timer);
  window.__mabV293Timer = setTimeout(() => enhanceWorkout().catch(console.error), 60);
});
observer.observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});
window.addEventListener('routechange', () => setTimeout(() => enhanceWorkout().catch(console.error), 80));
window.addEventListener('focus', () => setTimeout(() => enhanceWorkout().catch(console.error), 80));
document.documentElement.dataset.mabVersion = VERSION;
setTimeout(() => enhanceWorkout().catch(console.error), 100);


const SHORT_WORKOUT_SECONDS = 300;
async function deleteWorkoutSession(session) {
  const sets = (await repo.all('executedSets')).filter(x => x.sessionId === session.id);
  for (const set of sets) await repo.remove('executedSets', set.id);
  const timers = (await repo.all('restTimers')).filter(x => x.sessionId === session.id);
  for (const timer of timers) await repo.remove('restTimers', timer.id);
  await repo.remove('workoutSessions', session.id);
}

function sessionSeconds(session) {
  const start = Date.parse(session.startedAt || '');
  const end = Date.parse(session.finishedAt || new Date().toISOString());
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
}
async function handleShortWorkoutFinish(event) {
  const button = event.target.closest('[data-action="finish"]');
  if (!button) return;
  const session = (await repo.all('workoutSessions')).find(x => x.status === 'in_progress');
  if (!session || sessionSeconds(session) >= SHORT_WORKOUT_SECONDS) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const seconds = sessionSeconds(session);
  const keep = confirm(`Este treino teve apenas ${fmtShort(seconds)}. Deseja manter o registro?\n\nOK = manter\nCancelar = apagar o treino iniciado por engano`);
  if (keep) {
    session.status = 'completed';
    session.finishedAt = new Date().toISOString();
    await repo.put('workoutSessions', session);
  } else {
    await deleteWorkoutSession(session);
  }
  document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();
}

function fmtShort(total) {
  const m = Math.floor(total / 60),
    s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
async function enhanceShortWorkoutHistory() {
  if (!document.querySelector('.dashboard-layout')) return;
  const sessions = (await repo.all('workoutSessions')).filter(x => x.status === 'completed' && sessionSeconds(x) < SHORT_WORKOUT_SECONDS).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const rows = [...document.querySelectorAll('.dashboard-layout .exercise-item')];
  for (const row of rows) {
    if (row.querySelector('.mab-delete-short')) continue;
    const title = row.querySelector('strong')?.textContent || '';
    const detail = row.querySelector('.muted')?.textContent || '';
    const group = (title.match(/Treino\s+([A-D])/i) || [])[1];
    const date = (detail.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
    const duration = (detail.match(/(\d{2}):(\d{2})/) || []);
    if (!group || !date || !duration) continue;
    const seconds = Number(duration[1]) * 60 + Number(duration[2]);
    if (seconds >= SHORT_WORKOUT_SECONDS) continue;
    const session = sessions.find(x => x.groupCode === group.toUpperCase() && (x.startedAt || '').slice(0, 10) === date && Math.abs(sessionSeconds(x) - seconds) <= 1);
    if (!session) continue;
    row.querySelector('.orange')?.remove();
    const button = document.createElement('button');
    button.className = 'ghost mab-delete-short';
    button.textContent = 'Apagar';
    button.dataset.sessionId = session.id;
    button.setAttribute('aria-label', `Apagar Treino ${group} de ${date}`);
    row.appendChild(button);
  }
}
// v2.10.1: listener antigo desativado; finalizacao e tratada pelo resumo pos-treino
// document.addEventListener('click',handleShortWorkoutFinish,true);
document.addEventListener('click', async event => {
  const button = event.target.closest('.mab-delete-short');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const session = await repo.get('workoutSessions', button.dataset.sessionId);
  if (!session) return;
  if (!confirm(`Apagar definitivamente este Treino ${session.groupCode} de ${fmtShort(sessionSeconds(session))}?`)) return;
  await deleteWorkoutSession(session);
  button.closest('.exercise-item')?.remove();
  window.dispatchEvent(new Event('routechange'));
}, true);
const shortHistoryObserver = new MutationObserver(() => {
  clearTimeout(window.__mabShortHistoryTimer);
  window.__mabShortHistoryTimer = setTimeout(() => enhanceShortWorkoutHistory().catch(console.error), 100);
});
shortHistoryObserver.observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});
setTimeout(() => enhanceShortWorkoutHistory().catch(console.error), 150);

// v2.10.0 - fechamento inteligente, perfil e calorias editaveis
const MAB_V2100 = '2.11.0';
const PROFILE_KEY = 'mab-physical-profile-v2100';
const FINISH_PATCH = 'mab-finish-v2100';

function loadPhysicalProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')
  } catch {
    return {}
  }
}

function savePhysicalProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
}
async function currentWeight() {
  const rows = (await repo.all('bodyAssessments')).filter(x => x.weight != null && x.date).sort((a, b) => b.date.localeCompare(a.date));
  return Number(rows[0]?.weight) || null
}

function workoutMET() {
  return 5.0
}

function estimateCalories(weight, seconds) {
  if (!weight || !seconds) return null;
  return Math.round(workoutMET() * weight * (seconds / 3600))
}

function closeSummaryModal() {
  document.querySelector('#mabFinishOverlay')?.remove()
}
async function saveWorkoutSummary(session) {
  const caloriesEl = document.querySelector('#mabFinishCalories');
  const sourceEl = document.querySelector('#mabFinishSource');
  const notesEl = document.querySelector('#mabFinishNotes');
  const optionalNumber = selector => {
    const value = document.querySelector(selector)?.value.trim() || '';
    if (!value) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null
  };
  const painRegion = document.querySelector('#mabFinishPainRegion')?.value || '';
  const painIntensity = optionalNumber('#mabFinishPainIntensity');
  const painNotes = document.querySelector('#mabFinishPainNotes')?.value.trim() || '';
  const estimated = Number(document.querySelector('#mabEstimatedCalories')?.dataset.value) || null;
  session.estimatedCalories = estimated;
  session.calories = caloriesEl?.value ? Number(caloriesEl.value) : null;
  session.calorieSource = sourceEl?.value || 'Estimativa MAB';
  session.calorieMethod = 'MET 5.0 x peso x duracao';
  session.notes = (notesEl?.value || '').trim();
  session.sessionRpe = optionalNumber('#mabFinishRpe');
  session.fatigueAfter = optionalNumber('#mabFinishFatigue');
  session.discomforts = painRegion || painIntensity != null || painNotes ? [{
    region: painRegion || null,
    intensity: painIntensity,
    notes: painNotes || null
  }] : [];
  session.durationSeconds = sessionSeconds(session);
  session.status = 'completed';
  session.finishedAt = session.finishedAt || new Date().toISOString();
  await repo.put('workoutSessions', session);
  window.__mabFinishPending = false;
  closeSummaryModal();
  document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();
}
async function openWorkoutSummary(session) {
  if (document.querySelector('#mabFinishOverlay')) return;
  session.finishedAt = session.finishedAt || new Date().toISOString();
  const weight = await currentWeight();
  const seconds = sessionSeconds(session);
  const estimated = estimateCalories(weight, seconds);
  const overlay = document.createElement('div');
  overlay.id = 'mabFinishOverlay';
  overlay.dataset.sessionId = session.id;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';
  overlay.innerHTML = `<div style="width:min(620px,100%);max-height:90vh;overflow:auto;background:#151515;border:1px solid #3a3a3a;border-radius:22px;padding:20px;color:#fff;box-sizing:border-box"><div style="color:#ff851b;font-size:13px;font-weight:800;letter-spacing:.08em">TREINO CONCLUÍDO</div><h2 style="margin:6px 0 4px">Treino ${escapeHtml(session.groupCode||'')}</h2><div style="color:#aaa;margin-bottom:18px">Duração: ${fmtShort(seconds)}${weight?` · Peso de referência: ${weight} kg`:''}</div><div style="background:#0d0d0d;border:1px solid #333;border-radius:16px;padding:16px;margin-bottom:14px"><div style="color:#aaa;font-size:13px">Estimativa MAB</div><strong id="mabEstimatedCalories" data-value="${estimated||''}" style="display:block;font-size:28px;color:#ff851b;margin:4px 0">${estimated?`≈ ${estimated} kcal`:'Sem peso atual para estimar'}</strong><small style="color:#888">Estimativa inicial por MET, peso atual e duração. O valor abaixo pode ser substituído pelo wearable.</small></div><label style="display:block;margin:12px 0 6px;color:#bbb">Calorias registradas</label><div style="display:flex;gap:8px;align-items:center"><input id="mabFinishCalories" inputmode="numeric" type="number" min="0" max="10000" value="${estimated||''}" style="flex:1;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><span>kcal</span></div><label style="display:block;margin:14px 0 6px;color:#bbb">Fonte</label><select id="mabFinishSource" style="width:100%;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><option>Estimativa MAB</option><option>Apple Watch</option><option>Polar</option><option>Garmin</option><option>Outro</option></select><label style="display:block;margin:14px 0 6px;color:#bbb">Observações do treino</label><textarea id="mabFinishNotes" rows="4" placeholder="Opcional" style="width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"></textarea><button id="mabSaveFinish" style="width:100%;margin-top:16px;background:#ff851b;color:#080808;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800">Salvar e concluir</button></div>`;
  const contextFields = document.createElement('div');
  contextFields.id = 'mabFinishContextFields';
  contextFields.style.cssText = 'display:grid;gap:10px;margin:14px 0;padding:14px;background:#0d0d0d;border:1px solid #333;border-radius:14px';
  contextFields.innerHTML = `<div style="color:#aaa;font-size:12px">Contexto opcional · pode concluir sem preencher</div><label style="display:grid;gap:6px;color:#bbb">Esforço geral da sessão · RPE<select id="mabFinishRpe" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label><label style="display:grid;gap:6px;color:#bbb">Fadiga após o treino · 1–5<select id="mabFinishFatigue" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({length:5},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label><strong style="font-size:13px">Dor ou desconforto</strong><label style="display:grid;gap:6px;color:#bbb">Região<select id="mabFinishPainRegion" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Nenhum / não informar</option><option>Ombro</option><option>Cotovelo</option><option>Punho</option><option>Peitoral</option><option>Costas</option><option>Lombar</option><option>Quadril</option><option>Joelho</option><option>Tornozelo</option><option>Bíceps</option><option>Tríceps</option><option>Coxa</option><option>Panturrilha</option><option>Outra</option></select></label><label style="display:grid;gap:6px;color:#bbb">Intensidade · 1–5<select id="mabFinishPainIntensity" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({length:5},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label><label style="display:grid;gap:6px;color:#bbb">Observação sobre o desconforto<input id="mabFinishPainNotes" placeholder="Opcional" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"></label>`;
  overlay.querySelector('#mabFinishNotes').before(contextFields);
  document.body.appendChild(overlay);
  document.querySelector('#mabSaveFinish').onclick = () => saveWorkoutSummary(session).catch(console.error)
}
async function isLastSeriesComplete() {
  const ctx = await getWorkoutContext();
  if (!ctx?.item || ctx.index !== ctx.items.length - 1) return false;
  const sets = (await repo.all('executedSets')).filter(x => x.sessionId === ctx.current.id && x.exerciseId === ctx.item.exerciseId && x.completed);
  return sets.length >= Number(ctx.item.sets || 0)
}
async function maybeFinishAfterRestLegacy() {
  const session = (await repo.all('workoutSessions')).find(x => x.status === 'in_progress');
  if (!session) return false;
  if (!(await isLastSeriesComplete())) return false;
  const running = (await repo.all('restTimers')).find(x => x.sessionId === session.id && x.status === 'running');
  if (running && remaining(running.targetEndAt) > 0) return false;
  if (running) {
    running.status = 'completed';
    await repo.put('restTimers', running)
  }
  await openWorkoutSummary(session);
  return true
}
const maybeFinishAfterRest = maybeFinishAfterRestLegacy;
setInterval(() => {
  if (document.querySelector('#mabFinishOverlay')) return;
  maybeFinishAfterRest().catch(() => {})
}, 1000);
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action="skip-rest"]');
  if (!b) return;
  setTimeout(() => maybeFinishAfterRest().catch(() => {}), 80)
}, true);
// intercepta finalizar normal e preserva regra de treino curto
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action="finish"]');
  if (!b || b.dataset[FINISH_PATCH]) return;
  window.__mabFinishPending = true;
  const session = (await repo.all('workoutSessions')).find(x => x.status === 'in_progress');
  if (!session) {
    window.__mabFinishPending = false;
    return
  }
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const seconds = sessionSeconds(session);
  if (seconds < SHORT_WORKOUT_SECONDS) {
    const keep = confirm(`Este treino teve apenas ${fmtShort(seconds)}. Deseja manter o registro?\n\nOK = manter\nCancelar = apagar o treino iniciado por engano`);
    if (!keep) {
      await deleteWorkoutSession(session);
      window.__mabFinishPending = false;
      document.querySelector('.bottom-nav [data-route="dashboard"]')?.click();
      return
    }
  }
  await openWorkoutSummary(session)
}, true);

function enhanceSettingsProfile() {
  const modal = document.querySelector('#modalContent');
  if (!modal || !modal.querySelector('#exportBtn') || modal.querySelector('#mabProfileSection')) return;
  const p = loadPhysicalProfile();
  const block = document.createElement('div');
  block.id = 'mabProfileSection';
  block.className = 'stack';
  block.innerHTML = `<hr style="border-color:#333;width:100%"><h3>Perfil físico</h3><p class="muted">Usado como base para futuras estimativas. O peso vem da avaliação corporal mais recente.</p><label class="field">Data de nascimento<input id="mabBirthDate" type="date" value="${escapeHtml(p.birthDate||'')}"></label><label class="field">Altura (cm)<input id="mabHeight" type="number" inputmode="numeric" min="100" max="250" value="${escapeHtml(p.heightCm||'')}"></label><label class="field">Sexo para cálculo fisiológico<select id="mabSex"><option value="">Não informado</option><option value="female" ${p.sex==='female'?'selected':''}>Feminino</option><option value="male" ${p.sex==='male'?'selected':''}>Masculino</option></select></label><button class="secondary" id="mabSaveProfile">Salvar perfil</button>`;
  modal.querySelector('.stack')?.appendChild(block);
  block.querySelector('#mabSaveProfile').onclick = () => {
    savePhysicalProfile({
      birthDate: block.querySelector('#mabBirthDate').value,
      heightCm: Number(block.querySelector('#mabHeight').value) || null,
      sex: block.querySelector('#mabSex').value
    });
    block.querySelector('#mabSaveProfile').textContent = 'Perfil salvo ✓';
    setTimeout(() => block.querySelector('#mabSaveProfile') && (block.querySelector('#mabSaveProfile').textContent = 'Salvar perfil'), 1200)
  }
}
const profileObserver = new MutationObserver(() => setTimeout(enhanceSettingsProfile, 30));
profileObserver.observe(document.querySelector('#modal') || document.body, {
  childList: true,
  subtree: true
});
async function enhanceDashboardCalories() {
  if (!document.querySelector('.dashboard-layout')) return;
  const sessions = (await repo.all('workoutSessions')).filter(x => x.status === 'completed' && x.calories != null);
  const rows = [...document.querySelectorAll('.dashboard-layout .exercise-item')];
  for (const row of rows) {
    if (row.dataset.mabCalories === '1') continue;
    const title = row.querySelector('strong')?.textContent || '';
    if (!title.includes('Musculação')) continue;
    const detail = row.querySelector('.muted');
    if (!detail) continue;
    const group = (title.match(/Treino\s+([A-D])/i) || [])[1],
      date = (detail.textContent.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
    const s = sessions.find(x => x.groupCode === group && (x.startedAt || '').slice(0, 10) === date);
    if (s) {
      detail.textContent += ` · ${s.calories} kcal`;
      row.dataset.mabCalories = '1'
    }
  }
}
const kcalObserver = new MutationObserver(() => {
  clearTimeout(window.__mabKcalTimer);
  window.__mabKcalTimer = setTimeout(() => enhanceDashboardCalories().catch(() => {}), 100)
});
kcalObserver.observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});
document.documentElement.dataset.mabVersion = MAB_V2100;


// v2.10.2 - classificacao dinamica do foco do proximo treino
const LOWER_BODY_TERMS = ['perna', 'pernas', 'quadríceps', 'quadriceps', 'posterior', 'isquiotib', 'glúte', 'glute', 'panturr', 'adutor', 'abdutor', 'coxa', 'femoral', 'hamstring', 'calf', 'leg'];
const UPPER_BODY_TERMS = ['peito', 'costas', 'ombro', 'ombros', 'bíceps', 'biceps', 'tríceps', 'triceps', 'dorsal', 'trapézio', 'trapezio', 'delto', 'braço', 'braco', 'antebraço', 'antebraco', 'chest', 'back', 'shoulder', 'arm'];

function normalizeMuscleText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function muscleRegion(value) {
  const text = normalizeMuscleText(value);
  const lower = LOWER_BODY_TERMS.some(x => text.includes(normalizeMuscleText(x)));
  const upper = UPPER_BODY_TERMS.some(x => text.includes(normalizeMuscleText(x)));
  if (lower && !upper) return 'lower';
  if (upper && !lower) return 'upper';
  return 'other'
}
async function workoutFocusLabel(groupCode) {
  const cycle = (await repo.all('cycles')).find(x => x.status === 'active');
  if (!cycle) return '';
  const items = (await repo.all('planItems')).filter(x => x.cycleId === cycle.id && x.groupCode === groupCode && x.active);
  const exercises = await repo.all('exercises');
  let upper = 0,
    lower = 0;
  for (const item of items) {
    const ex = exercises.find(x => x.id === item.exerciseId);
    const region = muscleRegion(ex?.muscleGroup);
    if (region === 'upper') upper++;
    if (region === 'lower') lower++;
  }
  if (lower > 0 && upper === 0) return 'Inferiores';
  if (upper > 0 && lower === 0) return 'Superiores';
  if (lower > upper) return 'Inferiores';
  if (upper > lower) return 'Superiores';
  if (lower && upper) return 'Corpo inteiro';
  return '';
}
async function enhanceNextWorkoutFocus() {
  if (!document.querySelector('.dashboard-layout')) return;
  const card = [...document.querySelectorAll('.dashboard-layout .card')].find(c => c.textContent.includes('PRÓXIMO TREINO'));
  if (!card) return;
  const h2 = card.querySelector('h2');
  const start = card.querySelector('[data-action="start"]');
  if (!h2 || !start) return;
  const group = (start.dataset.group || (h2.textContent.match(/Treino\s+([A-D])/i) || [])[1] || '').toUpperCase();
  if (!group) return;
  const focus = await workoutFocusLabel(group);
  h2.textContent = focus ? `Treino ${group} · ${focus}` : `Treino ${group}`;
}
const focusObserver = new MutationObserver(() => {
  clearTimeout(window.__mabFocusTimer);
  window.__mabFocusTimer = setTimeout(() => enhanceNextWorkoutFocus().catch(() => {}), 90)
});
focusObserver.observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});
window.addEventListener('routechange', () => setTimeout(() => enhanceNextWorkoutFocus().catch(() => {}), 120));
setTimeout(() => enhanceNextWorkoutFocus().catch(() => {}), 180);


// v2.10.3 - editar/excluir avaliacao corporal e alerta de variacao
function assessmentEditorV2103(a) {
  const modal = document.querySelector('#modal'),
    content = document.querySelector('#modalContent');
  if (!modal || !content) return;
  const val = v => v == null ? '' : escapeHtml(v);
  content.innerHTML = `<form id="mabAssessmentEdit" class="stack">
    <div class="row"><h2>Editar avaliação</h2><button type="button" class="ghost" data-close>✕</button></div>
    <label class="field">Data<input name="date" type="date" required value="${val(a.date)}"></label>
    <div class="grid two">
      <label class="field">Peso corporal (kg)<input name="weight" type="number" min="0" max="1000" step="0.1" inputmode="decimal" value="${val(a.weight)}"></label>
      <label class="field">% Gordura<input name="bodyFat" type="number" min="0" max="100" step="0.1" inputmode="decimal" value="${val(a.bodyFat)}"></label>
      <label class="field">Massa gorda (kg)<input name="fatMass" type="number" min="0" max="1000" step="0.1" inputmode="decimal" value="${val(a.fatMass)}"></label>
      <label class="field">Massa magra (kg)<input name="leanMass" type="number" min="0" max="1000" step="0.1" inputmode="decimal" value="${val(a.leanMass)}"></label>
    </div>
    <h3>Membros (cm)</h3>
    <div class="grid two">
      <label class="field">Bíceps esquerdo<input name="bicepsLeftCm" type="number" min="0" max="300" step="0.1" value="${val(a.bicepsLeftCm)}"></label>
      <label class="field">Bíceps direito<input name="bicepsRightCm" type="number" min="0" max="300" step="0.1" value="${val(a.bicepsRightCm)}"></label>
      <label class="field">Antebraço esquerdo<input name="forearmLeftCm" type="number" min="0" max="300" step="0.1" value="${val(a.forearmLeftCm)}"></label>
      <label class="field">Antebraço direito<input name="forearmRightCm" type="number" min="0" max="300" step="0.1" value="${val(a.forearmRightCm)}"></label>
      <label class="field">Coxa esquerda<input name="thighLeftCm" type="number" min="0" max="300" step="0.1" value="${val(a.thighLeftCm)}"></label>
      <label class="field">Coxa direita<input name="thighRightCm" type="number" min="0" max="300" step="0.1" value="${val(a.thighRightCm)}"></label>
      <label class="field">Panturrilha esquerda<input name="calfLeftCm" type="number" min="0" max="300" step="0.1" value="${val(a.calfLeftCm)}"></label>
      <label class="field">Panturrilha direita<input name="calfRightCm" type="number" min="0" max="300" step="0.1" value="${val(a.calfRightCm)}"></label>
    </div>
    <h3>Tronco (cm)</h3>
    <div class="grid two">
      <label class="field">Abdômen<input name="abdomenCm" type="number" min="0" max="500" step="0.1" value="${val(a.abdomenCm ?? a.waistCm)}"></label>
      <label class="field">Cintura<input name="waistCircumferenceCm" type="number" min="0" max="500" step="0.1" value="${val(a.waistCircumferenceCm)}"></label>
      <label class="field">Quadril<input name="hipCm" type="number" min="0" max="500" step="0.1" value="${val(a.hipCm)}"></label>
    </div>
    <p class="muted">Campos vazios permanecem sem valor; não são convertidos em zero.</p>
    <button class="primary">Salvar alterações</button>
    <button type="button" class="danger" id="mabDeleteAssessment">Excluir avaliação</button>
  </form>`;
  modal.showModal();
  content.querySelector('[data-close]').onclick = () => modal.close();
  content.querySelector('#mabDeleteAssessment').onclick = async () => {
    if (!confirm('Excluir esta avaliação corporal? Ela será removida do histórico e dos gráficos.')) return;
    await repo.remove('bodyAssessments', a.id);
    modal.close();
    window.dispatchEvent(new Event('routechange'));
  };
  content.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const parse = v => {
      const s = String(v || '').trim().replace(',', '.');
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null
    };
    const newWeight = parse(f.get('weight'));
    const abdomenCm = parse(f.get('abdomenCm'));
    const rows = (await repo.all('bodyAssessments')).filter(x => x.id !== a.id && x.weight != null && x.date <= f.get('date')).sort((x, y) => y.date.localeCompare(x.date));
    const prior = rows[0];
    if (prior && newWeight != null && Math.abs(newWeight - Number(prior.weight)) >= 10) {
      const diff = Math.abs(newWeight - Number(prior.weight)).toFixed(1);
      if (!confirm(`Atenção: o peso informado varia ${diff} kg em relação à avaliação anterior (${prior.weight} kg).\n\nOK = salvar mesmo assim\nCancelar = revisar o valor`)) return;
    }
    await repo.put('bodyAssessments', {
      ...a,
      date: f.get('date'),
      weight: newWeight,
      leanMass: parse(f.get('leanMass')),
      fatMass: parse(f.get('fatMass')),
      bodyFat: parse(f.get('bodyFat')),
      abdomenCm,
      waistCm: abdomenCm,
      waistCircumferenceCm: parse(f.get('waistCircumferenceCm')),
      hipCm: parse(f.get('hipCm')),
      bicepsLeftCm: parse(f.get('bicepsLeftCm')),
      bicepsRightCm: parse(f.get('bicepsRightCm')),
      forearmLeftCm: parse(f.get('forearmLeftCm')),
      forearmRightCm: parse(f.get('forearmRightCm')),
      thighLeftCm: parse(f.get('thighLeftCm')),
      thighRightCm: parse(f.get('thighRightCm')),
      calfLeftCm: parse(f.get('calfLeftCm')),
      calfRightCm: parse(f.get('calfRightCm')),
      updatedAt: new Date().toISOString()
    });
    modal.close();
    window.dispatchEvent(new Event('routechange'));
  };
}
async function enhanceAssessmentHistoryV2103() {
  if (!document.querySelector('#bodyChart')) return;
  const assessments = (await repo.all('bodyAssessments')).sort((a, b) => b.date.localeCompare(a.date));
  const cards = [...document.querySelectorAll('#app .card')];
  const history = cards.find(c => c.querySelector('h3')?.textContent.trim() === 'Histórico corporal');
  if (!history) return;
  const rows = [...history.querySelectorAll('.exercise-item')];
  for (const [index, row] of rows.entries()) {
    const date = (row.querySelector('.muted')?.textContent.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
    const weightText = row.querySelector('strong')?.textContent || '';
    const weight = Number((weightText.match(/[\d.,]+/) || [])[0]?.replace(',', '.'));
    const orderedAssessment = assessments[index];
    const mappedAssessment = assessments.find(x => x.id === row.dataset.v306AssessmentId);
    const a = mappedAssessment || (orderedAssessment?.date === date ? orderedAssessment : assessments.find(x => x.date === date && (Number.isNaN(weight) || Math.abs(Number(x.weight) - weight) < 0.01)));
    if (!a) continue;
    row.dataset.assessmentId = a.id;
    const existingActions = row.querySelector('.mab-assessment-actions');
    if (existingActions) {
      existingActions.querySelector('[data-mab-edit-assessment]')?.setAttribute('data-mab-edit-assessment', a.id);
      existingActions.querySelector('[data-mab-delete-assessment]')?.setAttribute('data-mab-delete-assessment', a.id);
      continue
    }
    const actions = document.createElement('div');
    actions.className = 'row mab-assessment-actions';
    actions.innerHTML = `<button class="ghost" data-mab-edit-assessment="${a.id}">Editar</button><button class="danger" data-mab-delete-assessment="${a.id}">Excluir</button>`;
    row.appendChild(actions);
  }
}
document.addEventListener('click', async e => {
  const edit = e.target.closest('[data-mab-edit-assessment]');
  if (edit) {
    e.preventDefault();
    const a = await repo.get('bodyAssessments', edit.dataset.mabEditAssessment);
    if (a) assessmentEditorV2103(a);
    return
  }
  const del = e.target.closest('[data-mab-delete-assessment]');
  if (del) {
    e.preventDefault();
    const a = await repo.get('bodyAssessments', del.dataset.mabDeleteAssessment);
    if (!a) return;
    if (!confirm('Excluir esta avaliação corporal? Ela será removida do histórico e dos gráficos.')) return;
    await repo.remove('bodyAssessments', a.id);
    window.dispatchEvent(new Event('routechange'));
  }
}, true);
const assessmentObserverV2103 = new MutationObserver(() => {
  clearTimeout(window.__mabAssessmentTimer);
  window.__mabAssessmentTimer = setTimeout(() => enhanceAssessmentHistoryV2103().catch(() => {}), 120)
});
assessmentObserverV2103.observe(document.querySelector('#app') || document.body, {
  childList: true,
  subtree: true
});
window.addEventListener('routechange', () => setTimeout(() => enhanceAssessmentHistoryV2103().catch(() => {}), 150));
setTimeout(() => enhanceAssessmentHistoryV2103().catch(() => {}), 200);
// alerta preventivo também para novas avaliações: observa o formulário nativo e confirma antes do submit quando possível
function attachNewAssessmentWarningV2103() {
  const form = document.querySelector('#assessmentForm');
  if (!form || form.dataset.mabWarning === '1') return;
  form.dataset.mabWarning = '1';
  form.addEventListener('submit', async e => {
    if (form.dataset.mabApproved === '1') {
      form.dataset.mabApproved = '0';
      return
    }
    const input = form.querySelector('[name="weight"]');
    const date = form.querySelector('[name="date"]')?.value;
    const rawWeight = String(input?.value ?? '').trim().replace(',', '.');
    if (!rawWeight || !date) return;
    const w = Number(rawWeight);
    if (!Number.isFinite(w)) return;
    const rows = (await repo.all('bodyAssessments')).filter(x => x.weight != null && x.date <= date).sort((a, b) => b.date.localeCompare(a.date));
    const prior = rows[0];
    if (prior && Number.isFinite(w) && Math.abs(w - Number(prior.weight)) >= 10) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const diff = Math.abs(w - Number(prior.weight)).toFixed(1);
      if (confirm(`Atenção: o peso informado varia ${diff} kg em relação à última avaliação (${prior.weight} kg).\n\nOK = salvar mesmo assim\nCancelar = revisar o valor`)) {
        form.dataset.mabApproved = '1';
        form.requestSubmit();
      }
    }
  }, true)
}
const formObserverV2103 = new MutationObserver(() => attachNewAssessmentWarningV2103());
formObserverV2103.observe(document.querySelector('#modal') || document.body, {
  childList: true,
  subtree: true
});


// v3.0.3 - hotfix consolidado de navegacao
const MAB303 = {
  changing: false,
  renderTimer: null
};

function ensureV303Styles() {
  if (document.querySelector('#mabV303Styles')) return;
  const st = document.createElement('style');
  st.id = 'mabV303Styles';
  st.textContent = `#mabExerciseNavigator{display:grid;gap:7px;margin-top:10px}.mab-exercise-nav-item{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;padding:10px 12px;border:1px solid #333;border-radius:10px;background:#111;color:#fff}.mab-exercise-nav-item .state{font-size:12px;color:#aaa}.mab-exercise-nav-item.current{border-color:#ff851b;background:#1b130d}.mab-exercise-nav-item.completed{opacity:.78}.mab-exercise-nav-item.partial{border-color:#73532b}.mab-next-exercise{min-width:0;text-align:center}.mab-next-exercise strong{display:block;white-space:normal;line-height:1.15;margin-top:3px}@media(max-width:540px){.mab-exercise-nav-item{grid-template-columns:20px minmax(0,1fr)}.mab-exercise-nav-item .state{grid-column:2}}`;
  document.head.appendChild(st)
}
async function workoutProgressV303() {
  const ctx = await getWorkoutContext();
  if (!ctx || !ctx.current || !ctx.items.length) return null;
  const sets = await repo.all('executedSets');
  const progress = ctx.items.map((item, index) => {
    const planned = Number(item.sets || 0);
    const done = sets.filter(x => x.sessionId === ctx.current.id && x.exerciseId === item.exerciseId && x.completed).length;
    return {
      item,
      index,
      planned,
      done,
      complete: planned > 0 && done >= planned,
      partial: done > 0 && done < planned,
      exercise: ctx.exercises.find(e => e.id === item.exerciseId)
    }
  });
  return {
    ...ctx,
    progress
  }
}
async function goToExerciseV303(index) {
  if (MAB303.changing) return false;
  const data = await workoutProgressV303();
  if (!data) return false;
  const target = Number(index);
  if (!Number.isInteger(target) || target < 0 || target >= data.progress.length || target === data.index) return false;
  MAB303.changing = true;
  try {
    data.current.currentIndex = target;
    await repo.put('workoutSessions', data.current);
    window.dispatchEvent(new Event('routechange'));
    return true
  } finally {
    setTimeout(() => {
      MAB303.changing = false
    }, 180)
  }
}

function nextPendingV303(data, fromIndex) {
  for (let step = 1; step <= data.progress.length; step++) {
    const candidate = data.progress[(fromIndex + step) % data.progress.length];
    if (!candidate.complete) return candidate
  }
  return null
}
async function renderExerciseNavigatorV303() {
  if (!document.querySelector('[data-action="save-set"]')) return;
  ensureV303Styles();
  const data = await workoutProgressV303();
  if (!data) return;
  const exerciseCard = [...document.querySelectorAll('#app .card')].find(c => c.querySelector('[data-action="save-set"]'));
  if (!exerciseCard) return;
  let title = exerciseCard.querySelector('[data-mab-nav-heading]');
  if (!title) {
    title = document.createElement('div');
    title.dataset.mabNavHeading = '1';
    title.innerHTML = '<div class="muted" style="margin-top:14px">EXERCÍCIOS DO TREINO</div>';
    exerciseCard.appendChild(title)
  }
  let nav = exerciseCard.querySelector('#mabExerciseNavigator');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'mabExerciseNavigator';
    exerciseCard.appendChild(nav)
  }
  nav.innerHTML = data.progress.map(p => {
    const state = p.index === data.index ? 'Atual' : p.complete ? 'Concluído' : p.partial ? 'Parcial' : 'Pendente';
    const icon = p.index === data.index ? '▶' : p.complete ? '✓' : p.partial ? '◐' : '○';
    const cls = p.index === data.index ? 'current' : p.complete ? 'completed' : p.partial ? 'partial' : '';
    return `<button type="button" class="mab-exercise-nav-item ${cls}" data-mab-exercise-index="${p.index}"><span>${icon}</span><strong>${escapeHtml(p.exercise?.name||'Exercício')}</strong><span class="state">${state} · ${p.done}/${p.planned}</span></button>`
  }).join('');
  const nextButton = document.querySelector('[data-action="next"]');
  if (nextButton) {
    const info = ensureInfoArea(nextButton);
    const next = data.progress[data.index + 1];
    if (next) {
      info.hidden = false;
      info.innerHTML = `<span class="muted">A SEGUIR</span><strong>${escapeHtml(next.exercise?.name||'Próximo exercício')}</strong>`;
      nextButton.hidden = false
    } else {
      info.hidden = true;
      nextButton.hidden = true
    }
  }
}

function scheduleNavigatorV303(delay = 160) {
  clearTimeout(MAB303.renderTimer);
  MAB303.renderTimer = setTimeout(() => renderExerciseNavigatorV303().catch(console.error), delay)
}
async function autoAdvanceAfterSaveV303() {
  await sleep(180);
  const data = await workoutProgressV303();
  if (!data) return;
  const current = data.progress[data.index];
  if (!current || !current.complete) return;
  const next = nextPendingV303(data, data.index);
  if (next) await goToExerciseV303(next.index)
}
// Capture handles only the new direct exercise selector and post-save auto-advance.
// Native app.js remains authoritative for Next, Previous, Skip Rest and Finish.
document.addEventListener('click', event => {
  const direct = event.target.closest('[data-mab-exercise-index]');
  if (direct) {
    event.preventDefault();
    event.stopImmediatePropagation();
    goToExerciseV303(direct.dataset.mabExerciseIndex).catch(console.error);
    return
  }
  if (event.target.closest('[data-action="save-set"]')) setTimeout(() => autoAdvanceAfterSaveV303().catch(console.error), 260)
}, true);
document.addEventListener('click', event => {
  if (event.target.closest('[data-action="next"],[data-action="prev"],[data-action="skip-rest"]')) scheduleNavigatorV303(240)
}, false);
window.addEventListener('routechange', () => scheduleNavigatorV303(180));
window.addEventListener('focus', () => scheduleNavigatorV303(180));
scheduleNavigatorV303(240);