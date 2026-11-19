import { all, get, remove, tx, uuid } from './db.js';
import { route } from './router.js';
import { esc, number } from './validators.js';
import { sumTotals, scalePortions, macroCalories, macroPercentages, sumWater, mealCount, proteinByMeal, calorieBalance, localDate } from './nutrition-calc.js';
import { scanBarcode } from './barcode-scanner.js';
import { fetchOffProduct, searchOffProducts, isValidEan } from './off-client.js';

const MEALS = {
  pre_treino: 'Pré-treino', cafe: 'Café da manhã', lanche_manha: 'Lanche da manhã',
  almoco: 'Almoço', lanche_tarde: 'Lanche da tarde', jantar: 'Jantar', ceia: 'Ceia', outra: 'Outra'
};
const MACROS = { carbs: 'Carboidratos', protein: 'Proteína', fat: 'Gordura' };
const COLORS = { carbs: '#f58220', protein: '#ffbf80', fat: '#9a6240' };
let selectedDate = localDate();
let viewingDate = false;
let barcodeLookup;
let foodSearchController;
let foodSearchTimer;
let mealDraft;
const n = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const modal = () => document.querySelector('#modal');
const content = () => document.querySelector('#modalContent');
const toast = message => {
  const target = document.querySelector('#toast');
  target.textContent = message;
  target.classList.add('show');
  setTimeout(() => target.classList.remove('show'), 3000);
};
const guard = fn => async event => {
  try { await fn(event); } catch (error) { console.error('Diário alimentar:', error); toast(error.message); }
};

function shiftDate(date, offset) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return localDate(value);
}

function defaultTimeForDate(date) {
  if (date !== localDate()) return '';
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function dayData(date) {
  const [logs, setting, closure] = await Promise.all([all('foodLogs'), get('settings', 'nutritionGoals'), get('dayClosures', date)]);
  const dayLogs = logs.filter(item => item.date === date);
  const waterLogs = dayLogs.filter(item => item.kind === 'water');
  const items = dayLogs.filter(item => item.kind !== 'water');
  return {
    items, waterLogs, waterMl: closure?.waterMl ?? sumWater(waterLogs),
    consumed: closure?.consumed ?? sumTotals(items),
    goals: closure?.goals ?? setting?.value, closure
  };
}

function progress(value, goal) {
  return `<div class="progress"><i style="width:${goal > 0 ? Math.min(100, value / goal * 100) : 0}%"></i></div>`;
}

function calorieSummary(consumed, goals) {
  return goals
    ? `<strong>${n(consumed.kcal)} / ${n(goals.kcal)} kcal</strong><div class="muted">Consumidas / meta · ${consumed.kcal > goals.kcal ? `excedidas ${n(consumed.kcal - goals.kcal)}` : `restam ${n(goals.kcal - consumed.kcal)}`} kcal</div>${progress(consumed.kcal, goals.kcal)}<div class="muted">Energia estimada dos macros (4/4/9): ${n(macroCalories(consumed))} kcal</div>`
    : `<strong>${n(consumed.kcal)} kcal consumidas</strong><p class="muted">Energia estimada dos macros (4/4/9): ${n(macroCalories(consumed))} kcal</p><p class="muted">Defina suas metas</p>`;
}

export async function dietCardHtml() {
  const { consumed, goals } = await dayData(localDate());
  return `<div class="card stack diet-card"><h3>DIETA · HOJE</h3>${calorieSummary(consumed, goals)}<div class="muted">${Object.entries(MACROS).map(([key, label]) => `${label}: ${n(consumed[key])} g`).join(' · ')}</div><button class="ghost" data-route="diet">Abrir diário de alimentação</button></div>`;
}

function macroBars(consumed, goals) {
  return Object.entries(MACROS).map(([key, label]) => `<div class="stack"><span>${label}: ${n(consumed[key])} / ${goals ? n(goals[key]) : '—'} g</span>${progress(consumed[key], goals?.[key])}</div>`).join('');
}

function pie(consumed) {
  const percentages = macroPercentages(consumed);
  let offset = 0;
  const circles = Object.entries(percentages).map(([key, value]) => {
    const circle = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${COLORS[key]}" stroke-width="10" stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${-offset}"/>`;
    offset += value;
    return circle;
  }).join('');
  return `<div class="diet-pie"><svg viewBox="0 0 42 42" role="img" aria-label="Distribuição de calorias por macro"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#333" stroke-width="10"/><g transform="rotate(-90 21 21)">${circles}</g></svg><div>${Object.entries(MACROS).map(([key, label]) => `<div style="color:${COLORS[key]}">${label}: ${n(percentages[key])}%</div>`).join('')}<small class="muted">kcal dos macros · 4/4/9 kcal/g</small></div></div>`;
}

export async function dietView() {
  if (!viewingDate) selectedDate = localDate();
  const { items, waterLogs, waterMl, consumed, goals, closure } = await dayData(selectedDate);
  const closures = (await all('dayClosures')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const mealTypes = [...Object.entries(MEALS)];
  for (const meal of new Set(items.map(item => item.meal).filter(meal => meal && !MEALS[meal]))) {
    mealTypes.push([meal, meal]);
  }
  const proteinTotals = proteinByMeal(items);
  const mealProteinRows = mealTypes.filter(([meal]) => Object.hasOwn(proteinTotals, meal))
    .map(([meal, label]) => `<div class="row"><span>${esc(label)}</span><strong>${n(proteinTotals[meal])} g</strong></div>`).join('');
  const waterRows = waterLogs.map(item => `<div class="row water-log-row"><span>Água · ${n(item.quantityMl)} ml${item.time ? ` · ${esc(item.time)}` : ''}</span>${closure ? '' : `<div class="row"><button class="ghost" data-diet="edit-water" data-id="${esc(item.id)}" aria-label="Editar registro de água">Editar</button><button class="ghost" data-diet="delete-water" data-id="${esc(item.id)}" aria-label="Excluir registro de água">Excluir</button></div>`}</div>`).join('');
  return `<section id="dietView" class="stack">
    <div class="row"><h2>Diário de alimentação</h2><button class="ghost" data-diet="goals">Metas</button></div>
    <div class="row"><button class="ghost" data-diet="previous" aria-label="Dia anterior">‹</button><label class="field">Data<input id="dietDate" type="date" value="${esc(selectedDate)}"></label><button class="ghost" data-diet="next" aria-label="Próximo dia">›</button></div>
    <div class="card stack">${calorieSummary(consumed, goals)}${macroBars(consumed, goals)}${pie(consumed)}<button class="primary" data-diet="${closure ? 'reopen' : 'close-day'}">${closure ? 'Reabrir dia para editar' : 'Fechar dia'}</button>${closure ? `<p>Saldo: ${balanceLabel(closure.balance)}</p><p class="muted">Gasto em treinos/atividades: ${n(closure.burnedKcal)} kcal (estimado). Dia fechado com as metas da época. Reabra para alterar os registros.</p>` : `<button class="secondary" data-diet="register-meal">+ Registrar Refeição</button>`}</div>
    <div class="card stack diet-daily-details"><div class="grid two"><div class="metric"><span class="muted">Refeições registradas</span><strong>${mealCount(items)}</strong></div><div class="metric"><span class="muted">Água consumida</span><strong>${n(waterMl)} ml</strong>${closure ? '' : '<button type="button" class="ghost" data-diet="add-water">+ Registrar água</button>'}</div></div><div><h3>Proteína por refeição</h3>${mealProteinRows || '<p class="muted">Nenhuma refeição registrada.</p>'}</div>${waterRows ? `<div class="stack"><h3>Registros de água</h3>${waterRows}</div>` : ''}</div>
    ${mealTypes.map(([meal, label]) => {
      const rows = items.filter(item => item.meal === meal);
      const totals = sumTotals(rows);
      return `<div class="card stack diet-meal-card"><div class="row diet-meal-heading"><div><h3>${esc(label)}</h3><span class="muted">${n(totals.kcal)} kcal · C ${n(totals.carbs)} g · P ${n(totals.protein)} g · G ${n(totals.fat)} g</span></div><button type="button" class="primary diet-meal-toggle" data-diet="toggle-meal" aria-expanded="false" aria-label="Expandir ${esc(label)}" aria-controls="meal-${esc(meal)}">+</button></div><div id="meal-${esc(meal)}" class="stack diet-meal-content" hidden>${rows.map(item => `<div class="diet-food-row stack"><strong>${esc(item.name)}</strong><span class="muted">${n(item.qty)} porções${item.quantity != null && item.unit !== 'porção' ? ` · ${n(item.quantity)} ${esc(item.unit || '')}${item.weightGrams != null && item.unit !== 'g' ? ` · ${n(item.weightGrams)} g` : ''}` : ''}${item.time ? ` · ${esc(item.time)}` : ''} · ${n(item.kcal)} kcal · C ${n(item.carbs)} g · P ${n(item.protein)} g · G ${n(item.fat)} g</span>${closure ? '' : `<div class="row"><button class="ghost" data-diet="edit-log" data-id="${esc(item.id)}">Editar</button><button class="ghost" data-diet="delete-log" data-id="${esc(item.id)}">Excluir</button></div>`}</div>`).join('') || '<p class="muted">Nenhum alimento registrado.</p>'}${closure ? '' : `<button class="ghost" data-diet="add" data-meal="${esc(meal)}">+ Adicionar alimentos</button><button class="ghost" data-diet="copy" data-meal="${esc(meal)}">Copiar refeição de ontem</button>`}</div></div>`;
    }).join('')}
    <div class="card stack"><h3>Últimos 7 dias fechados</h3>${closures.map(day => `<button class="ghost" data-diet="show-date" data-date="${esc(day.date)}">${esc(day.date)} · ${balanceLabel(day.balance)}</button>`).join('') || '<p class="muted">Nenhum dia fechado.</p>'}</div>
  </section>`;
}

async function refresh() {
  if (route() === 'diet') document.querySelector('#app').innerHTML = await dietView();
}

function showDialog(title, html) {
  barcodeLookup?.abort();
  barcodeLookup = null;
  clearTimeout(foodSearchTimer);
  foodSearchController?.abort();
  foodSearchController = null;
  content().innerHTML = `<div class="stack diet-dialog"><div class="row"><h2>${esc(title)}</h2><button type="button" class="ghost" data-diet="dismiss" aria-label="Fechar">✕</button></div>${html}</div>`;
  if (!modal().open) modal().showModal();
}

function numericField(key, label, value = '', required = true) {
  return `<label class="field">${esc(label)}<input name="${key}" inputmode="decimal" value="${esc(value)}" ${required ? 'required' : ''}></label>`;
}

function readNumber(form, key, min = 0) {
  const value = form.elements.namedItem(key).value.trim();
  if (!value) throw new Error('Preencha todos os valores numéricos.');
  return number(value, min, 1000000);
}

function readNutrition(form) {
  return Object.fromEntries(['kcal', ...Object.keys(MACROS)].map(key => [key, readNumber(form, key)]));
}

async function goalsDialog() {
  const goals = (await get('settings', 'nutritionGoals'))?.value;
  showDialog('Metas diárias', `<form id="dietGoalsForm" class="stack">${numericField('kcal', 'Meta (kcal)', goals?.kcal)}${Object.entries(MACROS).map(([key, label]) => numericField(key, `${label} (g)`, goals?.[key])).join('')}<p id="dietGoalsWarning" class="orange" role="status"></p><button class="primary">Salvar metas</button></form>`);
  const form = content().querySelector('form');
  form.oninput = () => {
    const values = ['kcal', 'carbs', 'protein', 'fat'].map(key => Number(form.elements.namedItem(key).value.replace(',', '.')));
    const [kcal, carbs, protein, fat] = values;
    const macroKcal = carbs * 4 + protein * 4 + fat * 9;
    content().querySelector('#dietGoalsWarning').textContent = values.every(Number.isFinite) && Math.abs(kcal - macroKcal) > 1 ? `Atenção: os macros somam ${n(macroKcal)} kcal, diferente da meta. Você pode salvar assim mesmo.` : '';
  };
  form.oninput();
  form.onsubmit = guard(async event => {
    event.preventDefault();
    const value = readNutrition(form);
    await tx(['settings'], 'readwrite', t => t.objectStore('settings').put({ key: 'nutritionGoals', value }));
    modal().close();
    await refresh();
  });
}

async function requireOpen(date) {
  if (await get('dayClosures', date)) throw new Error('Reabra o dia antes de editar.');
}

function mealPickerDialog() {
  mealDraft = null;
  showDialog('Registrar refeição', `<p class="muted">Escolha a refeição para começar.</p><div class="stack">${Object.entries(MEALS).map(([meal, label]) => `<button type="button" class="ghost" data-diet="select-meal" data-meal="${meal}">${esc(label)}</button>`).join('')}</div>`);
}

async function addDialog(meal) {
  const date = selectedDate;
  await requireOpen(date);
  const localFoods = (await all('foodItems')).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '') || a.name.localeCompare(b.name));
  mealDraft = { meal, date, time: defaultTimeForDate(date), items: [], localFoods, query: '', remoteFoods: [], searchMessage: '' };
  showDialog('Registrar refeição', '');
  renderMealBuilder();
}

function mealNutritionText(values) {
  const known = value => value == null || value === '' ? '—' : n(value);
  return `${known(values.kcal)} kcal · C ${known(values.carbs)} g · P ${known(values.protein)} g · G ${known(values.fat)} g`;
}

function renderMealBuilder() {
  const state = mealDraft;
  if (!state) return;
  const rows = state.items.map(item => {
    const totals = scalePortions(item.food, item.qty);
    return `<div class="diet-food-row stack"><div class="row"><strong>${esc(item.food.name)}</strong><button type="button" class="danger diet-remove-item" data-diet="builder-remove" data-id="${esc(item.draftId)}" aria-label="Excluir ${esc(item.food.name)}">Excluir</button></div><label class="field">Quantidade (${esc(item.food.servingUnit)} por porção)<input type="text" inputmode="decimal" autocomplete="off" value="${esc(item.qty)}" data-builder-qty="${esc(item.draftId)}" aria-label="Quantidade de ${esc(item.food.name)}"></label><span class="muted" data-builder-item-total="${esc(item.draftId)}">${mealNutritionText(totals)}</span><button type="button" class="ghost" data-diet="builder-edit" data-id="${esc(item.draftId)}">Editar alimento e nutrientes</button></div>`;
  }).join('');
  const totals = sumTotals(state.items.map(item => scalePortions(item.food, item.qty)));
  content().innerHTML = `<div class="stack diet-dialog"><div class="row"><h2>${esc(MEALS[state.meal] || state.meal)}</h2><button type="button" class="ghost" data-diet="dismiss" aria-label="Cancelar refeição">✕</button></div><label class="field">Horário da refeição (opcional)<input id="dietMealTime" type="time" value="${esc(state.time)}"></label><label class="field">Buscar alimento por nome<input id="dietBuilderSearch" type="search" inputmode="search" autocomplete="off" placeholder="Ex.: leite integral" value="${esc(state.query)}"></label><div id="dietBuilderResults" class="stack" aria-live="polite"></div><button type="button" class="primary" data-diet="scan" data-meal="${esc(state.meal)}">Ler código de barras</button><button type="button" class="ghost" data-diet="builder-manual">+ Cadastrar alimento manualmente</button><h3>Alimentos desta refeição (${state.items.length})</h3><div id="dietBuilderItems" class="stack">${rows || '<p class="muted">Adicione um ou mais alimentos. Nada será salvo no diário até tocar em “Salvar Refeição”.</p>'}</div><div class="card stack"><strong>Total da refeição</strong><span id="dietBuilderTotal">${mealNutritionText(totals)}</span></div><button type="button" class="primary" data-diet="save-meal" ${state.items.length ? '' : 'disabled'}>Salvar Refeição</button><button type="button" class="ghost" data-diet="cancel-meal">Cancelar sem salvar</button></div>`;
  content().querySelector('#dietMealTime').oninput = event => { state.time = event.target.value; };
  content().querySelector('#dietBuilderSearch').oninput = event => {
    state.query = event.target.value.trim();
    scheduleFoodSearch(state);
  };
  content().querySelectorAll('[data-builder-qty]').forEach(input => {
    input.oninput = () => updateMealDraftTotals(state);
  });
  renderBuilderResults(state);
}

function renderBuilderResults(state) {
  const target = content().querySelector('#dietBuilderResults');
  if (!target || mealDraft !== state) return;
  const query = state.query.toLocaleLowerCase('pt-BR');
  const local = state.localFoods.filter(food => !query || food.name.toLocaleLowerCase('pt-BR').includes(query));
  const localHtml = local.map(food => `<div class="diet-search-result"><strong>${esc(food.name)}</strong><span class="muted">${n(food.servingSize)} ${esc(food.servingUnit)} · ${n(food.kcal)} kcal${food.favorite ? ' · Favorito' : ''}</span><div class="row"><button type="button" class="ghost" data-diet="builder-add-local" data-id="${esc(food.id)}">Adicionar</button><button type="button" class="ghost" data-diet="builder-edit-local" data-id="${esc(food.id)}">Editar alimento</button><button type="button" class="ghost" data-diet="builder-favorite" data-id="${esc(food.id)}">${food.favorite ? 'Desfavoritar' : 'Favoritar'}</button></div></div>`).join('');
  const remoteHtml = state.remoteFoods.map((food, index) => `<div class="diet-search-result"><strong>${esc(food.name)}</strong><span class="muted">${food.brand ? `${esc(food.brand)} · ` : ''}${mealNutritionText(food)} · Open Food Facts</span>${food.warnings.length ? `<span class="orange">${esc(food.warnings.join(' · '))}</span>` : ''}<button type="button" class="ghost" data-diet="builder-add-off" data-index="${index}">Conferir e adicionar</button></div>`).join('');
  const queryNotice = state.searchMessage ? `<p class="muted" role="status">${esc(state.searchMessage)}</p>` : '';
  const empty = !local.length && !state.remoteFoods.length && state.query && !state.searchMessage
    ? '<p class="muted">Nenhum produto encontrado. Você pode cadastrar manualmente.</p>' : '';
  target.innerHTML = `${queryNotice}${localHtml}${remoteHtml}${empty}`;
}

function scheduleFoodSearch(state) {
  clearTimeout(foodSearchTimer);
  foodSearchController?.abort();
  foodSearchController = null;
  state.remoteFoods = [];
  state.searchMessage = '';
  const query = state.query.trim();
  if (query.length >= 2 && navigator.onLine === false) state.searchMessage = 'Sem conexão. Você ainda pode cadastrar o alimento manualmente.';
  else if (query.length >= 2) state.searchMessage = 'Pesquisando na Open Food Facts…';
  renderBuilderResults(state);
  if (query.length < 2 || navigator.onLine === false) return;
  foodSearchTimer = setTimeout(async () => {
    const controller = new AbortController();
    foodSearchController = controller;
    try {
      const products = await searchOffProducts(query, { signal: controller.signal });
      if (controller.signal.aborted || mealDraft !== state || state.query.trim() !== query) return;
      state.remoteFoods = products;
      state.searchMessage = products.length ? '' : 'Nenhum produto encontrado na Open Food Facts. O cadastro manual continua disponível.';
    } catch (error) {
      if (controller.signal.aborted || mealDraft !== state || state.query.trim() !== query) return;
      state.searchMessage = `${error.message} Você ainda pode cadastrar manualmente.`;
    } finally {
      if (foodSearchController === controller) foodSearchController = null;
      renderBuilderResults(state);
    }
  }, 350);
}

function updateMealDraftTotals(state) {
  let valid = true;
  const totals = [];
  for (const item of state.items) {
    const input = content().querySelector(`[data-builder-qty="${CSS.escape(item.draftId)}"]`);
    const qty = Number(input?.value.replace(',', '.'));
    const line = content().querySelector(`[data-builder-item-total="${CSS.escape(item.draftId)}"]`);
    if (!Number.isFinite(qty) || qty <= 0) {
      valid = false;
      if (line) line.textContent = 'Informe uma quantidade maior que zero.';
      continue;
    }
    item.qty = qty;
    const scaled = scalePortions(item.food, qty);
    totals.push(scaled);
    if (line) line.textContent = mealNutritionText(scaled);
  }
  const total = content().querySelector('#dietBuilderTotal');
  if (total) total.textContent = valid ? mealNutritionText(sumTotals(totals)) : 'Corrija as quantidades para calcular o total.';
}

function addLocalFoodToDraft(food) {
  if (!mealDraft || !food) return;
  mealDraft.items.push({ draftId: uuid(), food, qty: 1, isNew: false });
  renderMealBuilder();
}

function builderFoodDialog(food = {}, draft = null, notice = '') {
  const state = mealDraft;
  if (!state) return;
  const title = draft ? 'Editar alimento da refeição' : food.source === 'openfoodfacts' ? 'Conferir produto' : 'Novo alimento';
  const warning = notice || (food.warnings || []).join(' · ');
  showDialog(title, `${warning ? `<p class="orange" role="status">${esc(warning)}</p>` : ''}<form id="dietBuilderFoodForm" class="stack"><label class="field">Nome<input name="name" value="${esc(food.name)}" maxlength="160" required></label><label class="field">Marca (opcional)<input name="brand" value="${esc(food.brand)}" maxlength="200"></label><label class="field">Código de barras (opcional)<input name="barcode" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(food.barcode)}"></label><p id="dietBarcodeWarning" class="orange" role="status"></p>${numericField('servingSize', 'Tamanho da porção', food.servingSize)}<label class="field">Unidade<select name="servingUnit">${['g', 'ml', 'un'].map(unit => `<option ${(food.servingUnit || 'g') === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>${numericField('qty', 'Quantidade consumida (porções)', draft?.qty ?? 1)}${numericField('kcal', 'kcal por porção', food.kcal)}${Object.entries(MACROS).map(([key, label]) => numericField(key, `${label} (g) por porção`, food[key])).join('')}<p class="muted">Confira o rótulo. Nutrientes não informados pela fonte precisam ser preenchidos; os valores não serão estimados.</p><button class="primary">${draft ? 'Atualizar alimento' : 'Adicionar à refeição'}</button><button type="button" class="ghost" data-diet="builder-return">Voltar sem adicionar</button></form>`);
  const form = content().querySelector('#dietBuilderFoodForm');
  const barcodeInput = form.elements.namedItem('barcode');
  const barcodeWarning = () => {
    barcodeInput.value = barcodeInput.value.replace(/\D/g, '');
    content().querySelector('#dietBarcodeWarning').textContent = barcodeInput.value && !isValidEan(barcodeInput.value)
      ? 'Dígito verificador EAN/UPC inválido ou formato não reconhecido. Confira o código; você pode salvar assim mesmo.' : '';
  };
  barcodeInput.oninput = barcodeWarning;
  barcodeWarning();
  form.onsubmit = guard(async event => {
    event.preventDefault();
    const name = form.elements.namedItem('name').value.trim();
    if (!name) throw new Error('Informe o nome do alimento.');
    const barcode = barcodeInput.value.trim();
    if (barcode && !/^\d+$/.test(barcode)) throw new Error('O código de barras deve conter somente dígitos.');
    const now = new Date().toISOString();
    const { warnings, ...foodFields } = food;
    const savedFood = {
      ...foodFields, id: food.id || uuid(), name, brand: form.elements.namedItem('brand').value.trim(),
      barcode: barcode || null, servingSize: readNumber(form, 'servingSize', 0.000001),
      servingUnit: form.elements.namedItem('servingUnit').value, ...readNutrition(form),
      source: food.source || 'manual', favorite: food.favorite ?? false,
      lastUsedAt: food.lastUsedAt ?? null, createdAt: food.createdAt || now, updatedAt: now
    };
    const updated = {
      draftId: draft?.draftId || uuid(), food: savedFood,
      qty: readNumber(form, 'qty', 0.000001), isNew: draft?.isNew ?? !food.id
    };
    const draftIndex = draft ? state.items.findIndex(item => item.draftId === draft.draftId) : -1;
    if (draftIndex >= 0) state.items[draftIndex] = updated;
    else state.items.push(updated);
    renderMealBuilder();
  });
}

async function saveMealDraft() {
  const state = mealDraft;
  if (!state?.items.length) throw new Error('Adicione ao menos um alimento antes de salvar.');
  if (state.saving) return;
  state.saving = true;
  const saveButton = content().querySelector('[data-diet="save-meal"]');
  if (saveButton) saveButton.disabled = true;
  try {
    await requireOpen(state.date);
    for (const item of state.items) {
      const input = content().querySelector(`[data-builder-qty="${CSS.escape(item.draftId)}"]`);
      item.qty = number(input?.value, 0.000001, 1000000);
    }
    const now = new Date().toISOString();
    const entries = state.items.map(item => ({
      item,
      log: {
        id: uuid(), date: state.date, meal: state.meal, foodId: item.food.id,
        name: item.food.name, qty: item.qty, ...(state.time ? { time: state.time } : {}),
        ...logQuantity(item.food, item.qty), ...scalePortions(item.food, item.qty)
      }
    }));
    await tx(['foodLogs', 'foodItems'], 'readwrite', stores => {
      for (const { item, log } of entries) {
        stores.objectStore('foodLogs').put(log);
        const food = item.isNew
          ? { ...item.food, updatedAt: now, lastUsedAt: now }
          : { ...item.food, lastUsedAt: now };
        stores.objectStore('foodItems').put(food);
      }
    });
    mealDraft = null;
    modal().close();
    await refresh();
  } catch (error) {
    state.saving = false;
    if (saveButton) saveButton.disabled = false;
    throw error;
  }
}

function logQuantity(food, portions) {
  const servingSize = Number(food.servingSize);
  const unit = food.servingUnit || 'porção';
  const hasServing = Number.isFinite(servingSize) && servingSize > 0 && unit !== 'porção';
  const quantity = hasServing ? servingSize * portions : portions;
  return {
    quantity, unit: hasServing ? unit : 'porção',
    ...(hasServing && unit === 'g' ? { weightGrams: quantity } : {})
  };
}

async function lookupBarcode(meal) {
  const date = selectedDate;
  const state = mealDraft;
  await requireOpen(date);
  const code = await scanBarcode();
  if (!code || route() !== 'diet' || selectedDate !== date) return;
  const local = (await all('foodItems')).find(food => food.barcode === code);
  if (local) {
    if (state && mealDraft === state) addLocalFoodToDraft(local);
    else await portionDialog(meal, local);
    return;
  }
  if (!navigator.onLine) {
    const draft = { barcode: code, servingUnit: 'g' };
    if (state && mealDraft === state) builderFoodDialog(draft, null, 'Sem conexão e código não cadastrado neste aparelho. Preencha manualmente; o alimento só será salvo ao gravar a refeição.');
    else await foodDialog(meal, undefined, draft, 'Sem conexão e código não cadastrado neste aparelho. Preencha o alimento manualmente; ele ficará disponível offline.');
    return;
  }
  showDialog('Consultando Open Food Facts', '<p role="status">Buscando produto… Somente o código de barras é enviado.</p>');
  const controller = new AbortController();
  barcodeLookup = controller;
  try {
    const product = await fetchOffProduct(code, { signal: controller.signal });
    if (controller.signal.aborted || !modal().open || route() !== 'diet' || selectedDate !== date) return;
    barcodeLookup = null;
    const draft = { ...product, barcode: code, source: 'openfoodfacts', offFetchedAt: new Date().toISOString() };
    const notice = ['Fonte: Open Food Facts. Confira o rótulo e os valores por porção antes de confirmar.', ...product.warnings].join(' · ');
    if (state && mealDraft === state) builderFoodDialog(draft, null, notice);
    else await foodDialog(meal, undefined, draft, notice);
  } catch (error) {
    if (controller.signal.aborted || !modal().open || route() !== 'diet' || selectedDate !== date) return;
    barcodeLookup = null;
    const draft = { barcode: code, servingUnit: 'g' };
    if (state && mealDraft === state) builderFoodDialog(draft, null, `${error.message} Preencha manualmente; o alimento só será salvo ao gravar a refeição.`);
    else await foodDialog(meal, undefined, draft, `${error.message} Preencha o alimento manualmente; o código será salvo para uso offline.`);
  } finally {
    if (barcodeLookup === controller) barcodeLookup = null;
  }
}

async function foodDialog(meal, id, draft = {}, notice = '') {
  const food = id ? await get('foodItems', id) : draft;
  if (!food) throw new Error('Alimento não encontrado.');
  const confirmation = !id && food.source === 'openfoodfacts';
  showDialog(id ? 'Editar alimento' : confirmation ? 'Conferir produto' : 'Novo alimento', `${notice ? `<p class="orange" role="status">${esc(notice)}</p>` : ''}<form class="stack"><label class="field">Código de barras<input name="barcode" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(food.barcode)}"></label><p id="dietBarcodeWarning" class="orange" role="status"></p><label class="field">Nome<input name="name" value="${esc(food.name)}" maxlength="160" required></label><label class="field">Marca (opcional)<input name="brand" value="${esc(food.brand)}" maxlength="200"></label>${numericField('servingSize', 'Tamanho da porção', food.servingSize)}<label class="field">Unidade<select name="servingUnit">${['g', 'ml', 'un'].map(unit => `<option ${food.servingUnit === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>${numericField('kcal', 'kcal por porção', food.kcal)}${Object.entries(MACROS).map(([key, label]) => numericField(key, `${label} (g) por porção`, food[key])).join('')}<p class="muted">Editar o alimento não altera refeições já registradas.</p><button class="primary">${confirmation ? 'Confirmar alimento' : 'Salvar alimento'}</button></form>`);
  const form = content().querySelector('form');
  const barcodeInput = form.elements.namedItem('barcode');
  const barcodeWarning = () => {
    barcodeInput.value = barcodeInput.value.replace(/\D/g, '');
    content().querySelector('#dietBarcodeWarning').textContent = barcodeInput.value && !isValidEan(barcodeInput.value)
      ? 'Dígito verificador EAN/UPC inválido ou formato não reconhecido. Confira o código; você pode salvar assim mesmo.' : '';
  };
  barcodeInput.oninput = barcodeWarning;
  barcodeWarning();
  form.onsubmit = guard(async event => {
    event.preventDefault();
    const name = form.elements.namedItem('name').value.trim();
    if (!name) throw new Error('Informe o nome do alimento.');
    const now = new Date().toISOString();
    const barcode = barcodeInput.value.trim();
    if (barcode && !/^\d+$/.test(barcode)) throw new Error('O código de barras deve conter somente dígitos.');
    const { warnings, ...fields } = food;
    const saved = { ...fields, id: food.id || uuid(), name, brand: form.elements.namedItem('brand').value.trim(), source: food.source || 'manual', servingSize: readNumber(form, 'servingSize', 0.000001), servingUnit: form.elements.namedItem('servingUnit').value, ...readNutrition(form), barcode: barcode || null, favorite: food.favorite ?? false, lastUsedAt: food.lastUsedAt ?? null, createdAt: food.createdAt || now, updatedAt: now };
    await tx(['foodItems'], 'readwrite', t => t.objectStore('foodItems').put(saved));
    await portionDialog(meal, saved);
  });
}

async function portionDialog(meal, food, log) {
  const date = selectedDate;
  await requireOpen(date);
  // An existing log is its own per-portion snapshot, never the edited food.
  const perPortion = log ? scalePortions(log, 1 / log.qty) : food;
  const quantityPerPortion = log?.quantity != null ? Number(log.quantity) / Number(log.qty) : log ? null : Number(food.servingSize);
  const unit = log?.unit || (log ? 'porção' : food.servingUnit || 'porção');
  showDialog(log ? 'Editar registro' : 'Quantidade', `<form class="stack"><strong>${esc(log?.name || food.name)}</strong>${food ? `<p class="muted">1 porção = ${n(food.servingSize)} ${esc(food.servingUnit)}</p>` : log?.quantity != null ? `<p class="muted">Registro: ${n(log.quantity)} ${esc(log.unit || '')}</p>` : ''}<label class="field">Horário (opcional)<input name="time" type="time" value="${esc(log ? log.time || '' : defaultTimeForDate(date))}"></label>${numericField('qty', 'Quantidade (porções)', log?.qty ?? 1)}<p id="dietPreview" aria-live="polite"></p><button class="primary">Salvar na refeição</button></form>`);
  const form = content().querySelector('form');
  form.oninput = () => {
    const qty = Number(form.elements.namedItem('qty').value.replace(',', '.'));
    const totals = scalePortions(perPortion, qty);
    content().querySelector('#dietPreview').textContent = Number.isFinite(qty) && qty > 0 ? `${n(totals.kcal)} kcal · ${Object.entries(MACROS).map(([key, label]) => `${label}: ${n(totals[key])} g`).join(' · ')}` : 'Informe uma quantidade maior que zero.';
  };
  form.oninput();
  form.onsubmit = guard(async event => {
    event.preventDefault();
    await requireOpen(date);
    const qty = readNumber(form, 'qty', 0.000001);
    const quantity = quantityPerPortion == null ? qty : quantityPerPortion * qty;
    const measurement = log
      ? { quantity, unit, ...(log.weightGrams != null ? { weightGrams: Number(log.weightGrams) / log.qty * qty } : {}) }
      : logQuantity(food, qty);
    const time = form.elements.namedItem('time').value;
    const entry = { id: log?.id || uuid(), date, meal, foodId: log?.foodId || food.id, name: log?.name || food.name, qty, ...measurement, ...(time ? { time } : {}), ...scalePortions(perPortion, qty) };
    const currentFood = await get('foodItems', entry.foodId);
    await tx(['foodLogs', 'foodItems'], 'readwrite', t => {
      t.objectStore('foodLogs').put(entry);
      if (currentFood) t.objectStore('foodItems').put({ ...currentFood, lastUsedAt: new Date().toISOString() });
    });
    modal().close();
    await refresh();
  });
}

async function saveWaterLog(amount, time, date = selectedDate, id = null) {
  await requireOpen(date);
  const record = {
    id: id || uuid(), kind: 'water', date, name: 'Água',
    quantityMl: amount, unit: 'ml', ...(time ? { time } : {})
  };
  await tx(['foodLogs'], 'readwrite', stores => stores.objectStore('foodLogs').put(record));
  modal().close();
  await refresh();
}

async function waterDialog(log = null) {
  const date = log?.date || selectedDate;
  await requireOpen(date);
  const time = log ? log.time || '' : defaultTimeForDate(date);
  showDialog(log ? 'Editar água' : 'Registrar água', `${log ? '' : `<div class="grid two water-presets">${[200, 300, 500, 750].map(amount => `<button type="button" class="ghost" data-diet="water-preset" data-ml="${amount}">${amount} ml</button>`).join('')}</div>`}<form id="waterForm" class="stack"><label class="field">Quantidade de água (ml)<input name="amount" inputmode="decimal" value="${esc(log?.quantityMl ?? '')}" required></label><label class="field">Horário (opcional)<input name="time" type="time" value="${esc(time)}"></label><button class="primary">${log ? 'Salvar alteração' : 'Registrar água'}</button></form>`);
  content().querySelector('#waterForm').onsubmit = guard(async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = readNumber(form, 'amount', 1);
    await saveWaterLog(amount, form.elements.namedItem('time').value, date, log?.id);
  });
}

function balanceLabel(balance) {
  return `${balance > 0 ? '+' : ''}${n(balance)} kcal · ${balance < 0 ? 'déficit' : balance > 0 ? 'superávit' : 'equilíbrio'}`;
}

async function closeDayDialog() {
  const date = selectedDate;
  const { consumed, goals, waterMl } = await dayData(date);
  if (!goals) { toast('Defina suas metas antes de fechar o dia.'); await goalsDialog(); return; }
  const [sessions, activities] = await Promise.all([all('workoutSessions'), all('activityDiary')]);
  const burnedKcal = [...sessions, ...activities].filter(item => item.startedAt ? localDate(item.startedAt) === date : item.date === date).reduce((total, item) => total + Number(item.calories ?? 0), 0);
  const balance = calorieBalance(consumed.kcal, goals.kcal);
  showDialog('Fechar dia', `<p>${esc(date)}</p><p>Consumido / meta: ${n(consumed.kcal)} / ${n(goals.kcal)} kcal</p><p>Água consumida: ${n(waterMl)} ml</p><strong>Saldo: ${balanceLabel(balance)}</strong>${macroBars(consumed, goals)}<p>Gasto em treinos/atividades: ${n(burnedKcal)} kcal (estimado)</p><p class="muted">Gasto apenas informativo; não descontado do saldo (consumido − meta).</p><button class="primary" id="dietConfirmClosure">Confirmar fechamento</button>`);
  content().querySelector('#dietConfirmClosure').onclick = guard(async () => {
    await tx(['dayClosures'], 'readwrite', t => t.objectStore('dayClosures').put({ date, closedAt: new Date().toISOString(), goals, consumed, waterMl, burnedKcal, balance }));
    modal().close();
    await refresh();
  });
}

document.addEventListener('change', guard(async event => {
  if (event.target.id !== 'dietDate') return;
  if (!event.target.value) { toast('Selecione uma data válida.'); event.target.value = selectedDate; return; }
  selectedDate = event.target.value;
  viewingDate = true;
  await refresh();
}));

document.addEventListener('click', guard(async event => {
  const button = event.target.closest('[data-diet]');
  if (!button) return;
  const { diet: action, meal, id, date } = button.dataset;
  if (action === 'dismiss' || action === 'cancel-meal') {
    barcodeLookup?.abort();
    barcodeLookup = null;
    clearTimeout(foodSearchTimer);
    foodSearchController?.abort();
    foodSearchController = null;
    mealDraft = null;
    modal().close();
    return;
  }
  if (action === 'toggle-meal') {
    const panel = button.closest('.diet-meal-card')?.querySelector('.diet-meal-content');
    if (panel) {
      panel.hidden = !panel.hidden;
      button.textContent = panel.hidden ? '+' : '−';
      button.setAttribute('aria-expanded', String(!panel.hidden));
      button.setAttribute('aria-label', `${panel.hidden ? 'Expandir' : 'Recolher'} ${button.closest('.diet-meal-card').querySelector('h3').textContent}`);
    }
    return;
  }
  if (action === 'previous' || action === 'next' || action === 'show-date') {
    selectedDate = date || shiftDate(selectedDate, action === 'previous' ? -1 : 1);
    viewingDate = true;
    await refresh();
  }
  if (action === 'goals') await goalsDialog();
  if (action === 'add-water') await waterDialog();
  if (action === 'water-preset') {
    const time = content().querySelector('#waterForm [name="time"]')?.value || '';
    await saveWaterLog(number(button.dataset.ml, 1, 1000000), time);
  }
  if (action === 'edit-water' || action === 'delete-water') {
    const log = await get('foodLogs', id);
    if (!log || log.kind !== 'water') throw new Error('Registro de água não encontrado.');
    await requireOpen(log.date);
    if (action === 'edit-water') await waterDialog(log);
    else {
      await remove('foodLogs', id);
      await refresh();
    }
  }
  if (action === 'register-meal') {
    await requireOpen(selectedDate);
    mealPickerDialog();
  }
  if (action === 'select-meal') {
    if (!MEALS[meal]) throw new Error('Selecione uma refeição válida.');
    await addDialog(meal);
  }
  if (action === 'add') await addDialog(meal);
  if (action === 'scan') await lookupBarcode(meal);
  if (action === 'builder-manual') builderFoodDialog({ servingUnit: 'g', source: 'manual' });
  if (action === 'builder-return') renderMealBuilder();
  if (action === 'builder-add-local') {
    const food = mealDraft?.localFoods.find(item => item.id === id);
    if (!food) throw new Error('Alimento não encontrado.');
    addLocalFoodToDraft(food);
  }
  if (action === 'builder-edit-local') {
    const food = mealDraft?.localFoods.find(item => item.id === id);
    if (!food) throw new Error('Alimento não encontrado.');
    builderFoodDialog(food, { draftId: uuid(), food, qty: 1, isNew: false });
  }
  if (action === 'builder-favorite') {
    const food = mealDraft?.localFoods.find(item => item.id === id);
    if (!food) throw new Error('Alimento não encontrado.');
    const updated = { ...food, favorite: !food.favorite, updatedAt: new Date().toISOString() };
    await tx(['foodItems'], 'readwrite', stores => stores.objectStore('foodItems').put(updated));
    mealDraft.localFoods = mealDraft.localFoods.map(item => item.id === id ? updated : item)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '') || a.name.localeCompare(b.name));
    renderBuilderResults(mealDraft);
  }
  if (action === 'builder-add-off') {
    const food = mealDraft?.remoteFoods[Number(button.dataset.index)];
    if (!food) throw new Error('Produto não encontrado. Pesquise novamente.');
    builderFoodDialog({ ...food, source: 'openfoodfacts', offFetchedAt: new Date().toISOString() },
      null, ['Fonte: Open Food Facts. Confira o rótulo e os valores por porção.', ...food.warnings].join(' · '));
  }
  if (action === 'builder-edit') {
    const item = mealDraft?.items.find(entry => entry.draftId === id);
    if (!item) throw new Error('Alimento temporário não encontrado.');
    builderFoodDialog(item.food, item);
  }
  if (action === 'builder-remove') {
    if (!mealDraft) return;
    mealDraft.items = mealDraft.items.filter(item => item.draftId !== id);
    renderMealBuilder();
  }
  if (action === 'save-meal') await saveMealDraft();
  if (action === 'new-food' || action === 'edit-food') await foodDialog(meal, id);
  if (action === 'select-food') {
    const food = await get('foodItems', id);
    if (!food) throw new Error('Alimento não encontrado.');
    await portionDialog(meal, food);
  }
  if (action === 'favorite') {
    const food = await get('foodItems', id);
    if (!food) throw new Error('Alimento não encontrado.');
    await tx(['foodItems'], 'readwrite', t => t.objectStore('foodItems').put({ ...food, favorite: !food.favorite, updatedAt: new Date().toISOString() }));
    await addDialog(meal);
  }
  if (action === 'edit-log' || action === 'delete-log') {
    const log = await get('foodLogs', id);
    if (!log) throw new Error('Registro não encontrado.');
    await requireOpen(log.date);
    if (action === 'edit-log') await portionDialog(log.meal, null, log);
    else {
      showDialog('Excluir registro', `<p>Excluir ${esc(log.name)}?</p><button class="danger" id="dietConfirmDelete">Excluir</button>`);
      content().querySelector('#dietConfirmDelete').onclick = guard(async () => {
        await requireOpen(log.date);
        await remove('foodLogs', id);
        modal().close();
        await refresh();
      });
    }
  }
  if (action === 'copy') {
    const targetDate = selectedDate;
    await requireOpen(targetDate);
    const rows = (await all('foodLogs')).filter(item => item.date === shiftDate(targetDate, -1) && item.meal === meal);
    if (!rows.length) { toast('Não há itens nessa refeição de ontem.'); return; }
    showDialog('Copiar refeição de ontem', `<p>Adicionar ${rows.length} item(ns) de ${esc(MEALS[meal] || meal)} a ${esc(targetDate)}? Os itens existentes serão mantidos.</p><button class="primary" id="dietConfirmCopy">Copiar refeição</button>`);
    content().querySelector('#dietConfirmCopy').onclick = guard(async () => {
      await requireOpen(targetDate);
      await tx(['foodLogs'], 'readwrite', t => rows.forEach(item => t.objectStore('foodLogs').put({ ...item, id: uuid(), date: targetDate })));
      modal().close();
      await refresh();
    });
  }
  if (action === 'close-day') await closeDayDialog();
  if (action === 'reopen') {
    await remove('dayClosures', selectedDate);
    await refresh();
  }
}));

window.addEventListener('routechange', () => {
  if (route() !== 'diet') {
    viewingDate = false;
    barcodeLookup?.abort();
    barcodeLookup = null;
    clearTimeout(foodSearchTimer);
    foodSearchController?.abort();
    foodSearchController = null;
    mealDraft = null;
  }
});
modal().addEventListener('cancel', () => {
  barcodeLookup?.abort();
  barcodeLookup = null;
  clearTimeout(foodSearchTimer);
  foodSearchController?.abort();
  foodSearchController = null;
  mealDraft = null;
});
