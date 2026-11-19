import { all, get, remove, tx, uuid } from './db.js';
import { route } from './router.js';
import { esc, number } from './validators.js';
import { sumTotals, scalePortions, macroPercentages, calorieBalance, localDate } from './nutrition-calc.js';

const MEALS = {
  cafe: 'Café da manhã', lanche_manha: 'Lanche da manhã', almoco: 'Almoço',
  lanche_tarde: 'Lanche da tarde', jantar: 'Jantar', ceia: 'Ceia'
};
const MACROS = { carbs: 'Carboidratos', protein: 'Proteína', fat: 'Gordura' };
const COLORS = { carbs: '#f58220', protein: '#ffbf80', fat: '#9a6240' };
let selectedDate = localDate();
let viewingDate = false;
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

async function dayData(date) {
  const [logs, setting, closure] = await Promise.all([all('foodLogs'), get('settings', 'nutritionGoals'), get('dayClosures', date)]);
  const items = logs.filter(item => item.date === date);
  return { items, consumed: closure?.consumed ?? sumTotals(items), goals: closure?.goals ?? setting?.value, closure };
}

function progress(value, goal) {
  return `<div class="progress"><i style="width:${goal > 0 ? Math.min(100, value / goal * 100) : 0}%"></i></div>`;
}

function calorieSummary(consumed, goals) {
  return goals
    ? `<strong>${n(consumed.kcal)} / ${n(goals.kcal)} kcal</strong><div class="muted">Consumidas / meta · ${consumed.kcal > goals.kcal ? `excedidas ${n(consumed.kcal - goals.kcal)}` : `restam ${n(goals.kcal - consumed.kcal)}`} kcal</div>${progress(consumed.kcal, goals.kcal)}`
    : `<strong>${n(consumed.kcal)} kcal consumidas</strong><p class="muted">Defina suas metas</p>`;
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
  const { items, consumed, goals, closure } = await dayData(selectedDate);
  const closures = (await all('dayClosures')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  return `<section id="dietView" class="stack">
    <div class="row"><h2>Diário de alimentação</h2><button class="ghost" data-diet="goals">Metas</button></div>
    <div class="row"><button class="ghost" data-diet="previous" aria-label="Dia anterior">‹</button><label class="field">Data<input id="dietDate" type="date" value="${esc(selectedDate)}"></label><button class="ghost" data-diet="next" aria-label="Próximo dia">›</button></div>
    <div class="card stack">${calorieSummary(consumed, goals)}${macroBars(consumed, goals)}${pie(consumed)}<button class="primary" data-diet="${closure ? 'reopen' : 'close-day'}">${closure ? 'Reabrir dia para editar' : 'Fechar dia'}</button>${closure ? `<p>Saldo: ${balanceLabel(closure.balance)}</p><p class="muted">Gasto em treinos/atividades: ${n(closure.burnedKcal)} kcal (estimado). Dia fechado com as metas da época. Reabra para alterar os registros.</p>` : ''}</div>
    ${Object.entries(MEALS).map(([meal, label]) => {
      const rows = items.filter(item => item.meal === meal);
      return `<div class="card stack"><div class="row"><h3>${label}</h3><span>${n(sumTotals(rows).kcal)} kcal</span></div>${rows.map(item => `<div class="diet-food-row stack"><strong>${esc(item.name)}</strong><span class="muted">${n(item.qty)} porções · ${n(item.kcal)} kcal</span>${closure ? '' : `<div class="row"><button class="ghost" data-diet="edit-log" data-id="${esc(item.id)}">Editar</button><button class="ghost" data-diet="delete-log" data-id="${esc(item.id)}">Excluir</button></div>`}</div>`).join('') || '<p class="muted">Nenhum alimento registrado.</p>'}${closure ? '' : `<button class="ghost" data-diet="add" data-meal="${meal}">+ Adicionar</button><button class="ghost" data-diet="copy" data-meal="${meal}">Copiar refeição de ontem</button>`}</div>`;
    }).join('')}
    <div class="card stack"><h3>Últimos 7 dias fechados</h3>${closures.map(day => `<button class="ghost" data-diet="show-date" data-date="${esc(day.date)}">${esc(day.date)} · ${balanceLabel(day.balance)}</button>`).join('') || '<p class="muted">Nenhum dia fechado.</p>'}</div>
  </section>`;
}

async function refresh() {
  if (route() === 'diet') document.querySelector('#app').innerHTML = await dietView();
}

function showDialog(title, html) {
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

async function addDialog(meal) {
  const date = selectedDate;
  await requireOpen(date);
  const foods = (await all('foodItems')).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '') || a.name.localeCompare(b.name));
  showDialog(`Adicionar · ${MEALS[meal]}`, `<label class="field">Buscar alimentos<input id="dietSearch" type="search" placeholder="Nome do alimento"></label><button class="primary" data-diet="new-food" data-meal="${meal}">Novo alimento</button><div id="dietFoods" class="stack"></div>`);
  const renderFoods = () => {
    const search = content().querySelector('#dietSearch').value.toLocaleLowerCase('pt-BR');
    content().querySelector('#dietFoods').innerHTML = foods.filter(food => food.name.toLocaleLowerCase('pt-BR').includes(search)).map(food => `<div class="diet-food-row stack"><strong>${esc(food.name)}</strong><span class="muted">${n(food.servingSize)} ${esc(food.servingUnit)} · ${n(food.kcal)} kcal${food.favorite ? ' · Favorito' : ''}</span><button class="primary" data-diet="select-food" data-meal="${meal}" data-id="${esc(food.id)}">Usar alimento</button><div class="row"><button class="ghost" data-diet="edit-food" data-meal="${meal}" data-id="${esc(food.id)}">Editar alimento</button><button class="ghost" data-diet="favorite" data-meal="${meal}" data-id="${esc(food.id)}">${food.favorite ? 'Desfavoritar' : 'Favoritar'}</button></div></div>`).join('') || '<p class="muted">Nenhum alimento encontrado. Cadastre um novo.</p>';
  };
  content().querySelector('#dietSearch').oninput = renderFoods;
  renderFoods();
}

async function foodDialog(meal, id) {
  const food = id ? await get('foodItems', id) : {};
  if (!food) throw new Error('Alimento não encontrado.');
  showDialog(id ? 'Editar alimento' : 'Novo alimento', `<form class="stack"><label class="field">Nome<input name="name" value="${esc(food.name)}" maxlength="160" required></label>${numericField('servingSize', 'Tamanho da porção', food.servingSize)}<label class="field">Unidade<select name="servingUnit">${['g', 'ml', 'un'].map(unit => `<option ${food.servingUnit === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>${numericField('kcal', 'kcal por porção', food.kcal)}${Object.entries(MACROS).map(([key, label]) => numericField(key, `${label} (g) por porção`, food[key])).join('')}<p class="muted">Editar o alimento não altera refeições já registradas.</p><button class="primary">Salvar alimento</button></form>`);
  const form = content().querySelector('form');
  form.onsubmit = guard(async event => {
    event.preventDefault();
    const name = form.elements.namedItem('name').value.trim();
    if (!name) throw new Error('Informe o nome do alimento.');
    const now = new Date().toISOString();
    const saved = { ...food, id: food.id || uuid(), name, servingSize: readNumber(form, 'servingSize', 0.000001), servingUnit: form.elements.namedItem('servingUnit').value, ...readNutrition(form), barcode: null, favorite: food.favorite ?? false, lastUsedAt: food.lastUsedAt ?? null, createdAt: food.createdAt || now, updatedAt: now };
    await tx(['foodItems'], 'readwrite', t => t.objectStore('foodItems').put(saved));
    await portionDialog(meal, saved);
  });
}

async function portionDialog(meal, food, log) {
  const date = selectedDate;
  await requireOpen(date);
  // An existing log is its own per-portion snapshot, never the edited food.
  const perPortion = log ? scalePortions(log, 1 / log.qty) : food;
  showDialog(log ? 'Editar registro' : 'Quantidade', `<form class="stack"><strong>${esc(log?.name || food.name)}</strong>${food ? `<p class="muted">1 porção = ${n(food.servingSize)} ${esc(food.servingUnit)}</p>` : ''}${numericField('qty', 'Quantidade (porções)', log?.qty ?? 1)}<p id="dietPreview" aria-live="polite"></p><button class="primary">Salvar na refeição</button></form>`);
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
    const entry = { id: log?.id || uuid(), date, meal, foodId: log?.foodId || food.id, name: log?.name || food.name, qty, ...scalePortions(perPortion, qty) };
    const currentFood = await get('foodItems', entry.foodId);
    await tx(['foodLogs', 'foodItems'], 'readwrite', t => {
      t.objectStore('foodLogs').put(entry);
      if (currentFood) t.objectStore('foodItems').put({ ...currentFood, lastUsedAt: new Date().toISOString() });
    });
    modal().close();
    await refresh();
  });
}

function balanceLabel(balance) {
  return `${balance > 0 ? '+' : ''}${n(balance)} kcal · ${balance < 0 ? 'déficit' : balance > 0 ? 'superávit' : 'equilíbrio'}`;
}

async function closeDayDialog() {
  const date = selectedDate;
  const { consumed, goals } = await dayData(date);
  if (!goals) { toast('Defina suas metas antes de fechar o dia.'); await goalsDialog(); return; }
  const [sessions, activities] = await Promise.all([all('workoutSessions'), all('activityDiary')]);
  const burnedKcal = [...sessions, ...activities].filter(item => item.startedAt ? localDate(item.startedAt) === date : item.date === date).reduce((total, item) => total + Number(item.calories ?? 0), 0);
  const balance = calorieBalance(consumed.kcal, goals.kcal);
  showDialog('Fechar dia', `<p>${esc(date)}</p><p>Consumido / meta: ${n(consumed.kcal)} / ${n(goals.kcal)} kcal</p><strong>Saldo: ${balanceLabel(balance)}</strong>${macroBars(consumed, goals)}<p>Gasto em treinos/atividades: ${n(burnedKcal)} kcal (estimado)</p><p class="muted">Gasto apenas informativo; não descontado do saldo (consumido − meta).</p><button class="primary" id="dietConfirmClosure">Confirmar fechamento</button>`);
  content().querySelector('#dietConfirmClosure').onclick = guard(async () => {
    await tx(['dayClosures'], 'readwrite', t => t.objectStore('dayClosures').put({ date, closedAt: new Date().toISOString(), goals, consumed, burnedKcal, balance }));
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
  if (action === 'dismiss') { modal().close(); return; }
  if (action === 'previous' || action === 'next' || action === 'show-date') {
    selectedDate = date || shiftDate(selectedDate, action === 'previous' ? -1 : 1);
    viewingDate = true;
    await refresh();
  }
  if (action === 'goals') await goalsDialog();
  if (action === 'add') await addDialog(meal);
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
    showDialog('Copiar refeição de ontem', `<p>Adicionar ${rows.length} item(ns) de ${MEALS[meal]} a ${esc(targetDate)}? Os itens existentes serão mantidos.</p><button class="primary" id="dietConfirmCopy">Copiar refeição</button>`);
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

window.addEventListener('routechange', () => { if (route() !== 'diet') viewingDate = false; });
