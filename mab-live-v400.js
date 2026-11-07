// MAB Training v4.0.0 — atividade ao vivo (cronômetro + GPS opcional) e detalhe de execução.
import {repo} from './repositories.js';
import {navigate} from './router.js';
import {fmt, elapsed} from './timer-service.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const toast = m => { const t = document.querySelector('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400) };
const modal = () => document.querySelector('#modal');
const modalContent = () => document.querySelector('#modalContent');
const showModal = html => { const c = modalContent(), m = modal(); if (!c || !m) return false; c.innerHTML = html; if (!m.open) m.showModal(); return true };
const closeModal = () => modal()?.close();
const today = () => new Date().toISOString().slice(0, 10);

const METS = { 'Caminhada': 3.5, 'Esteira': 5.5, 'Corrida': 8, 'Bicicleta': 7.5, 'Pilates': 3, 'Jiu Jitsu': 9, 'TRX': 6, 'Outra': 5 };
const GPS_MODALITIES = ['Caminhada', 'Corrida', 'Bicicleta'];
const PAIN_REGIONS = ['Ombro', 'Cotovelo', 'Punho', 'Peitoral', 'Costas', 'Lombar', 'Quadril', 'Joelho', 'Tornozelo', 'Bíceps', 'Tríceps', 'Coxa', 'Panturrilha', 'Outra'];

async function currentWeight() {
  const list = (await repo.all('bodyAssessments')).filter(a => a.weight != null).sort((a, b) => b.date.localeCompare(a.date));
  return list[0]?.weight ?? null;
}

/* ---------- Atividade ao vivo ---------- */
let liveState = null;

function chooseActivityMode() {
  if (!showModal(`<div class="stack"><div class="row"><h2>Outra atividade</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">Pilates, jiu jitsu, TRX, caminhada, bicicleta...</p><button class="primary" id="mabLiveStartBtn">▶ Iniciar agora (cronômetro)</button><button class="secondary" id="mabLivePastBtn">Registrar atividade passada</button></div>`)) return;
  modalContent().querySelector('[data-close]').onclick = closeModal;
  modalContent().querySelector('#mabLiveStartBtn').onclick = () => liveSetup();
  modalContent().querySelector('#mabLivePastBtn').onclick = () => {
    closeModal();
    window.__mabLiveBypass = true;
    document.querySelector('[data-action="new-activity"]')?.click();
    setTimeout(() => window.__mabLiveBypass = false, 400);
  };
}

function liveSetup() {
  const modalities = Object.keys(METS);
  showModal(`<form id="mabLiveSetup" class="stack"><div class="row"><h2>Iniciar atividade</h2><button type="button" class="ghost" data-close>✕</button></div><label class="field">Modalidade<select name="modality">${modalities.map(m => `<option>${m}</option>`).join('')}</select></label><label class="field">Nome personalizado (se escolher Outra)<input name="customModality"></label><label class="field" id="mabGpsRow" hidden><span style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="gps" style="width:20px;height:20px;accent-color:#ff851b"> Rastrear distância por GPS</span><small class="muted">O celular pedirá permissão de localização. A tela precisa ficar ligada durante o trajeto.</small></label><div class="row"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Iniciar cronômetro</button></div></form>`);
  const form = modalContent().querySelector('#mabLiveSetup');
  const gpsRow = form.querySelector('#mabGpsRow');
  const syncGps = () => gpsRow.hidden = !GPS_MODALITIES.includes(form.elements.modality.value);
  form.elements.modality.onchange = syncGps;
  syncGps();
  form.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  form.onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(form), mod = f.get('modality'), custom = String(f.get('customModality') || '').trim();
    closeModal();
    startLive({ modality: mod === 'Outra' ? (custom || 'Outra') : mod, customModality: custom, gps: GPS_MODALITIES.includes(mod) && f.get('gps') === 'on' });
  };
}

async function startLive(opts) {
  liveState = { ...opts, id: repo.uuid(), startedAt: new Date().toISOString(), startedMs: Date.now(), points: [], distanceMeters: 0, watchId: null, wakeLock: null, tick: null };
  const overlay = document.createElement('div');
  overlay.id = 'mabLiveOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';
  overlay.innerHTML = `<div style="width:min(620px,100%);background:#151515;border:1px solid #3a3a3a;border-radius:22px;padding:20px;color:#fff;box-sizing:border-box"><div style="color:#ff851b;font-size:13px;font-weight:800;letter-spacing:.08em">ATIVIDADE EM ANDAMENTO</div><h2 style="margin:6px 0 4px">${esc(opts.modality)}</h2><div id="mabLiveGpsInfo" style="color:#888;font-size:12px;min-height:16px">${opts.gps ? 'GPS: aguardando sinal…' : ''}</div><div style="text-align:center;margin:14px 0"><div id="mabLiveTimer" style="font-size:52px;font-weight:800;color:#ff851b;font-variant-numeric:tabular-nums">00:00</div><div style="color:#888;font-size:12px">tempo de execução</div></div><div id="mabLiveStats" style="text-align:center;color:#ddd;font-size:15px;min-height:20px;margin-bottom:14px"></div><button id="mabLiveFinish" style="width:100%;background:#ff851b;color:#080808;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800">Finalizar atividade</button><button id="mabLiveCancel" style="width:100%;margin-top:10px;background:transparent;color:#bbb;border:1px solid #444;border-radius:14px;padding:13px;font-size:14px">Cancelar e descartar</button></div>`;
  document.body.appendChild(overlay);
  if (navigator.wakeLock) { try { liveState.wakeLock = await navigator.wakeLock.request('screen') } catch {} }
  const timerEl = overlay.querySelector('#mabLiveTimer'), statsEl = overlay.querySelector('#mabLiveStats'), gpsInfo = overlay.querySelector('#mabLiveGpsInfo');
  liveState.tick = setInterval(() => {
    if (!liveState) return;
    const sec = Math.floor((Date.now() - liveState.startedMs) / 1000);
    timerEl.textContent = fmt(sec);
    if (liveState.gps && liveState.distanceMeters > 0) {
      const km = liveState.distanceMeters / 1000, speed = sec > 0 ? km / (sec / 3600) : 0;
      statsEl.textContent = `${km.toFixed(2)} km · ${speed.toFixed(1)} km/h`;
    }
  }, 1000);
  if (liveState.gps) startGps(gpsInfo);
  overlay.querySelector('#mabLiveFinish').onclick = () => finishLive().catch(e => toast(e.message));
  overlay.querySelector('#mabLiveCancel').onclick = () => {
    if (!confirm('Descartar esta atividade em andamento?')) return;
    stopLive();
    overlay.remove();
    toast('Atividade descartada');
  };
}

function haversine(a, b) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function startGps(infoEl) {
  if (!('geolocation' in navigator)) { infoEl.textContent = 'GPS indisponível neste aparelho — seguindo só com o cronômetro.'; liveState.gps = false; return }
  liveState.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, accuracy } = pos.coords;
    if (accuracy != null && accuracy > 30) return;
    const pt = { latitude, longitude };
    const last = liveState.points[liveState.points.length - 1];
    if (last) { const d = haversine(last, pt); if (d >= 2 && d < 100) liveState.distanceMeters += d }
    liveState.points.push(pt);
    infoEl.textContent = `GPS ativo · ${(liveState.distanceMeters / 1000).toFixed(2)} km`;
  }, () => { infoEl.textContent = 'GPS não autorizado — seguindo só com o cronômetro.'; liveState.gps = false }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
}

function stopLive() {
  if (!liveState) return;
  clearInterval(liveState.tick);
  if (liveState.watchId != null) navigator.geolocation.clearWatch(liveState.watchId);
  liveState.wakeLock?.release?.().catch(() => {});
}

async function finishLive() {
  const st = liveState;
  stopLive();
  const seconds = Math.max(1, Math.round((Date.now() - st.startedMs) / 1000));
  const distanceKm = st.gps && st.distanceMeters > 50 ? +(st.distanceMeters / 1000).toFixed(2) : null;
  const avgSpeedKmh = distanceKm ? +(distanceKm / (seconds / 3600)).toFixed(1) : null;
  document.querySelector('#mabLiveOverlay')?.remove();
  liveState = null;
  const weight = await currentWeight();
  const met = METS[st.modality] ?? 5;
  const estimated = weight ? Math.round(met * weight * (seconds / 3600)) : null;
  const overlay = document.createElement('div');
  overlay.id = 'mabLiveSummary';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box';
  overlay.innerHTML = `<div style="width:min(620px,100%);max-height:92vh;overflow:auto;background:#151515;border:1px solid #3a3a3a;border-radius:22px;padding:20px;color:#fff;box-sizing:border-box"><div style="color:#ff851b;font-size:13px;font-weight:800;letter-spacing:.08em">ATIVIDADE CONCLUÍDA</div><h2 style="margin:6px 0 4px">${esc(st.modality)}</h2><div style="color:#aaa;margin-bottom:14px">Duração: ${fmt(seconds)}${distanceKm != null ? ` · ${distanceKm} km · ${avgSpeedKmh} km/h` : ''}</div><div style="background:#0d0d0d;border:1px solid #333;border-radius:16px;padding:16px;margin-bottom:14px"><div style="color:#aaa;font-size:13px">Estimativa MAB</div><strong style="display:block;font-size:28px;color:#ff851b;margin:4px 0">${estimated ? `≈ ${estimated} kcal` : 'Sem peso atual para estimar'}</strong><small style="color:#888">MET ${met} × peso × duração. Substitua abaixo pelo valor do seu dispositivo.</small></div><label style="display:block;margin:12px 0 6px;color:#bbb">Calorias registradas</label><div style="display:flex;gap:8px;align-items:center"><input id="mabLiveCalories" inputmode="numeric" type="number" min="0" max="10000" value="${estimated || ''}" style="flex:1;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><span>kcal</span></div><label style="display:block;margin:14px 0 6px;color:#bbb">Fonte</label><select id="mabLiveSource" style="width:100%;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"><option>Estimativa MAB</option><option>Apple Watch</option><option>Polar</option><option>Garmin</option><option>Outro</option></select><div id="mabLiveContext" style="margin-top:14px"></div><label style="display:block;margin:14px 0 6px;color:#bbb">Observações</label><textarea id="mabLiveNotes" rows="3" placeholder="Opcional" style="width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:12px;padding:14px;font-size:16px"></textarea><button id="mabLiveSave" style="width:100%;margin-top:16px;background:#ff851b;color:#080808;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:800">Salvar atividade</button></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#mabLiveContext').innerHTML = `<div style="color:#aaa;font-size:12px">Contexto opcional · pode salvar sem preencher</div><label style="display:grid;gap:6px;color:#bbb;margin-top:8px">Esforço geral (RPE)<span style="font-size:11px;color:#888">1 = muito leve · 10 = esforço máximo</span><select id="mabLiveRpe" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label><label style="display:grid;gap:6px;color:#bbb;margin-top:10px">Fadiga após a atividade · 1–5<select id="mabLiveFatigue" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({ length: 5 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label><strong style="font-size:13px;display:block;margin-top:12px">Dor ou desconforto</strong><label style="display:grid;gap:6px;color:#bbb;margin-top:6px">Região<select id="mabLivePainRegion" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Nenhum / não informar</option>${PAIN_REGIONS.map(r => `<option>${r}</option>`).join('')}</select></label><label style="display:grid;gap:6px;color:#bbb;margin-top:10px">Intensidade · 1–5<select id="mabLivePainIntensity" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"><option value="">Não informado</option>${Array.from({ length: 5 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label><label style="display:grid;gap:6px;color:#bbb;margin-top:10px">Observação sobre o desconforto<input id="mabLivePainNotes" placeholder="Opcional" style="background:#111;color:#fff;border:1px solid #444;border-radius:10px;padding:12px"></label>`;
  overlay.querySelector('#mabLiveSave').onclick = async () => {
    const num = sel => { const v = overlay.querySelector(sel)?.value.trim() || ''; if (!v) return null; const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null };
    const rpe = num('#mabLiveRpe'), fatigue = num('#mabLiveFatigue');
    const painRegion = overlay.querySelector('#mabLivePainRegion')?.value || '', painIntensity = num('#mabLivePainIntensity'), painNotes = overlay.querySelector('#mabLivePainNotes')?.value.trim() || '';
    await repo.put('activityDiary', {
      id: st.id,
      modality: st.modality,
      customModality: st.customModality || '',
      date: today(),
      live: true,
      startedAt: st.startedAt,
      finishedAt: new Date().toISOString(),
      durationSeconds: seconds,
      durationMinutes: +(seconds / 60).toFixed(1),
      distanceKm,
      avgSpeedKmh,
      gpsTracked: distanceKm != null,
      met,
      estimatedCalories: estimated,
      calories: num('#mabLiveCalories'),
      calorieSource: overlay.querySelector('#mabLiveSource')?.value || 'Estimativa MAB',
      calorieMethod: `MET ${met} x peso x duracao`,
      notes: overlay.querySelector('#mabLiveNotes')?.value.trim() || '',
      sessionRpe: rpe,
      fatigueAfter: fatigue,
      discomforts: painRegion || painIntensity != null || painNotes ? [{ region: painRegion || null, intensity: painIntensity, notes: painNotes || null }] : [],
      intensity: rpe != null ? (rpe >= 8 ? 'Intensa' : rpe >= 5 ? 'Moderada' : 'Leve') : null,
      createdAt: new Date().toISOString()
    });
    overlay.remove();
    toast('Atividade salva');
    window.dispatchEvent(new CustomEvent('routechange', { detail: 'dashboard' }));
  };
}

/* ---------- Detalhe da execução ---------- */
const ZONE_MAP = { 'Ombros': 'shoulders', 'Peitoral': 'chest', 'Costas': 'lats', 'Bíceps': 'arms', 'Tríceps': 'arms', 'Core': 'core', 'Glúteos': 'glutes', 'Quadríceps': 'quads', 'Pernas': 'quads', 'Posterior': 'hams', 'Panturrilhas': 'calves' };
const zonesOf = groups => { const z = new Set(); groups.forEach(g => { const k = ZONE_MAP[g]; if (k) z.add(k) }); return z };

function muscleFigure(view, P, S, uid) {
  const f = key => P.has(key) ? `url(#mgP${uid})` : S.has(key) ? `url(#mgS${uid})` : '#1e1e1e';
  const defs = `<defs><radialGradient id="mgP${uid}" cx="50%" cy="45%" r="70%"><stop offset="0%" stop-color="#ffb020"/><stop offset="55%" stop-color="#ff6a00"/><stop offset="100%" stop-color="#8a3000"/></radialGradient><radialGradient id="mgS${uid}" cx="50%" cy="45%" r="70%"><stop offset="0%" stop-color="#c07a3a"/><stop offset="100%" stop-color="#5a3a20"/></radialGradient></defs>`;
  const outline = `<path d="M50 25 C41 25 33 28 28 33 C18 41 13 55 12 75 C11 95 14 108 18 116 C20 122 24 122 25 116 C28 106 29 95 30 84 C31 92 32 100 33 108 C30 122 28 140 30 156 C32 172 34 188 36 200 L42 200 C42 188 43 172 46 158 C48 150 52 150 54 158 C57 172 58 188 58 200 L64 200 C66 188 68 172 70 156 C72 140 70 122 67 108 C68 100 69 92 70 84 C71 95 72 106 75 116 C76 122 80 122 82 116 C86 108 89 95 88 75 C87 55 82 41 72 33 C67 28 59 25 50 25 Z" fill="#141414" stroke="#3a3a3a" stroke-width="1.5"/>`;
  const head = `<ellipse cx="50" cy="14" rx="9" ry="11" fill="#141414" stroke="#3a3a3a" stroke-width="1.5"/>`;
  const st = 'stroke="#0d0d0d" stroke-width="1"';
  const zones = view === 'front' ? `<ellipse cx="24" cy="36" rx="8" ry="7" fill="${f('shoulders')}" ${st}/><ellipse cx="76" cy="36" rx="8" ry="7" fill="${f('shoulders')}" ${st}/><ellipse cx="42" cy="45" rx="9" ry="7" fill="${f('chest')}" ${st}/><ellipse cx="58" cy="45" rx="9" ry="7" fill="${f('chest')}" ${st}/><ellipse cx="20" cy="66" rx="6" ry="14" fill="${f('arms')}" ${st}/><ellipse cx="80" cy="66" rx="6" ry="14" fill="${f('arms')}" ${st}/><ellipse cx="50" cy="74" rx="10" ry="14" fill="${f('core')}" ${st}/><ellipse cx="38" cy="128" rx="9" ry="24" fill="${f('quads')}" ${st}/><ellipse cx="62" cy="128" rx="9" ry="24" fill="${f('quads')}" ${st}/><ellipse cx="40" cy="172" rx="7" ry="16" fill="${f('calves')}" ${st}/><ellipse cx="60" cy="172" rx="7" ry="16" fill="${f('calves')}" ${st}/>`
    : `<ellipse cx="50" cy="32" rx="12" ry="6" fill="${f('shoulders')}" ${st}/><ellipse cx="24" cy="38" rx="8" ry="7" fill="${f('shoulders')}" ${st}/><ellipse cx="76" cy="38" rx="8" ry="7" fill="${f('shoulders')}" ${st}/><ellipse cx="20" cy="66" rx="6" ry="14" fill="${f('arms')}" ${st}/><ellipse cx="80" cy="66" rx="6" ry="14" fill="${f('arms')}" ${st}/><ellipse cx="32" cy="60" rx="6" ry="18" fill="${f('lats')}" ${st}/><ellipse cx="68" cy="60" rx="6" ry="18" fill="${f('lats')}" ${st}/><ellipse cx="50" cy="86" rx="8" ry="10" fill="${f('core')}" ${st}/><ellipse cx="42" cy="104" rx="10" ry="10" fill="${f('glutes')}" ${st}/><ellipse cx="58" cy="104" rx="10" ry="10" fill="${f('glutes')}" ${st}/><ellipse cx="38" cy="136" rx="9" ry="22" fill="${f('hams')}" ${st}/><ellipse cx="62" cy="136" rx="9" ry="22" fill="${f('hams')}" ${st}/><ellipse cx="40" cy="174" rx="7" ry="15" fill="${f('calves')}" ${st}/><ellipse cx="60" cy="174" rx="7" ry="15" fill="${f('calves')}" ${st}/>`;
  return `<svg viewBox="0 0 100 220" style="height:150px" role="img" aria-label="Mapa muscular — ${view === 'front' ? 'frente' : 'costas'}">${defs}${outline}${head}${zones}</svg>`;
}

function bodySvg(primary, secondary) {
  const P = zonesOf(primary), S = zonesOf(secondary);
  return `<div style="display:flex;justify-content:center;gap:10px;align-items:flex-end">${muscleFigure('front', P, S, 'f')}${muscleFigure('back', P, S, 'b')}</div><div style="display:flex;justify-content:center;gap:34px;color:#666;font-size:9px;margin-top:2px"><span>FRENTE</span><span>COSTAS</span></div>`;
}

const stars = (v, max = 5) => { if (v == null) return '—'; const full = Math.max(0, Math.min(5, Math.round(v / (max / 5)))); return `${'★★★★★'.slice(0, full)}${'☆☆☆☆☆'.slice(0, 5 - full)} <span style="color:#888;font-size:11px">${v}/${max}</span>` };
const metric = (label, value) => `<div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;padding:8px"><div style="color:#888;font-size:10px">${label}</div><div style="color:#fff;font-weight:700;font-size:13px;margin-top:2px">${value}</div></div>`;

function detailShell(title, subtitle, bodyHtml) {
  showModal(`<div class="stack" style="gap:10px"><div class="row" style="align-items:center"><img src="mab-logo.svg" alt="MAB Training" style="width:30px;height:30px"><div style="flex:1"><div style="font-weight:800;font-size:13px;letter-spacing:.04em">MAB TRAINING</div><div style="color:#888;font-size:9px;letter-spacing:.18em">TREINO · ATIVIDADE · EVOLUÇÃO</div></div><button type="button" class="ghost" data-close>✕</button></div><div><strong style="font-size:16px">${esc(title)}</strong><div class="muted" style="font-size:12px">${esc(subtitle)}</div></div>${bodyHtml}</div>`);
  modalContent().querySelector('[data-close]').onclick = closeModal;
}

async function openDetail(kind, id) {
  showModal(`<div class="stack"><div class="row"><strong>Carregando detalhes…</strong><button type="button" class="ghost" data-close>✕</button></div></div>`);
  modalContent()?.querySelector('[data-close]')?.addEventListener('click', closeModal);
  try {
  if (kind === 'strength') {
    const s = (await repo.all('workoutSessions')).find(x => x.id === id);
    if (!s) return;
    const sets = (await repo.all('executedSets')).filter(x => x.sessionId === id && x.completed);
    const exercises = await repo.all('exercises');
    const groups = await repo.all('workoutGroups');
    const groupDesc = groups.find(g => g.cycleId === s.cycleId && g.code === s.groupCode)?.description || '';
    const totalSec = s.durationSeconds ?? elapsed(s.startedAt, s.finishedAt);
    const exIds = [...new Set(sets.map(x => x.exerciseId))];
    const avgPerEx = exIds.length ? Math.round(totalSec / exIds.length) : null;
    const primary = new Set(), secondary = new Set();
    exIds.forEach(eid => { const ex = exercises.find(e => e.id === eid); if (ex?.primaryMuscleGroup) primary.add(ex.primaryMuscleGroup); (ex?.secondaryMuscleGroups || []).forEach(g => secondary.add(g)) });
    primary.forEach(g => secondary.delete(g));
    const legend = primary.size || secondary.size ? `${[...primary].join(', ')}${secondary.size ? ` <span style="color:#888">· apoio: ${[...secondary].join(', ')}</span>` : ''}` : 'Classifique os exercícios na Biblioteca para ver o mapa muscular.';
    detailShell(`Treino ${s.groupCode || ''}${groupDesc ? ' · ' + groupDesc : ''}`, (s.startedAt || '').slice(0, 10), `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${metric('Tempo total', fmt(totalSec))}${metric('Média por exercício', avgPerEx != null ? fmt(avgPerEx) : '—')}${metric('Calorias', s.calories != null ? `${s.calories} kcal` : '—')}${metric('Esforço (RPE)', stars(s.sessionRpe, 10))}${metric('Fadiga', stars(s.fatigueAfter, 5))}${metric('Grupo', `Treino ${s.groupCode || '—'}`)}</div><div style="margin-top:10px">${bodySvg(primary, secondary)}</div><div class="muted" style="font-size:11px;text-align:center;margin-top:4px">${legend}</div>`);
    return;
  }
  const a = await repo.get('activityDiary', id);
  if (!a) return;
  const sec = a.durationSeconds ?? Math.round(Number(a.durationMinutes || 0) * 60);
  detailShell(a.modality || 'Atividade', a.date || '', `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${metric('Duração', fmt(sec))}${metric('Distância', a.distanceKm != null ? `${a.distanceKm} km` : '—')}${metric('Velocidade média', a.avgSpeedKmh != null ? `${a.avgSpeedKmh} km/h` : '—')}${metric('Calorias', a.calories != null ? `${a.calories} kcal` : '—')}${metric('Esforço (RPE)', stars(a.sessionRpe, 10))}${metric('Fadiga', stars(a.fatigueAfter, 5))}</div>${a.intensity ? `<div class="muted" style="font-size:12px;margin-top:8px">Intensidade: ${esc(a.intensity)}</div>` : ''}${a.notes ? `<div class="muted" style="font-size:12px;margin-top:4px">Obs.: ${esc(a.notes)}</div>` : ''}`);
  } catch (e) {
    showModal(`<div class="stack"><div class="row"><strong>Não foi possível abrir o detalhe</strong><button type="button" class="ghost" data-close>✕</button></div><p class="muted">${esc(e.message)}</p></div>`);
    modalContent()?.querySelector('[data-close]')?.addEventListener('click', closeModal);
  }
}

function askDetail(kind, id) {
  showModal(`<div class="stack"><div class="row"><h2 style="font-size:18px">Atividade recente</h2><button type="button" class="ghost" data-close>✕</button></div><p class="muted">Ver detalhe desta execução?</p><div class="row"><button type="button" class="ghost" data-close>Agora não</button><button class="primary" id="mabDetailYes">Ver detalhes</button></div></div>`);
  modalContent().querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  modalContent().querySelector('#mabDetailYes').onclick = ev => { ev.currentTarget.disabled = true; openDetail(kind, id).catch(e => { ev.currentTarget.disabled = false; toast(e.message) }) };
}

/* ---------- Ouvintes ---------- */
document.addEventListener('click', e => {
  if (window.__mabLiveBypass) return;
  const newActivity = e.target.closest('[data-action="new-activity"]');
  if (newActivity) {
    e.preventDefault();
    e.stopImmediatePropagation();
    chooseActivityMode();
    return;
  }
}, true);

document.addEventListener('click', e => {
  if (e.target.closest('button, a, input, select, textarea')) return;
  const row = e.target.closest('[data-detail-id]');
  if (!row || !row.dataset.detailId) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  askDetail(row.dataset.detailKind, row.dataset.detailId);
}, true);

window.MABLive = { version: '4.0.0' };
