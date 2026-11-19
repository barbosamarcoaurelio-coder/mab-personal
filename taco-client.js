const BASE = 'https://brolesi.github.io/taco/';
let catalog;

async function requestTaco(path, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 8000);
  try {
    const response = await fetch(BASE + path, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(timedOut ? 'A consulta à TACO excedeu 8 segundos.' : `Não foi possível consultar a TACO. ${error.message}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

function normalizedName(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
}

export async function searchTacoFoods(term, { signal } = {}) {
  const query = normalizedName(term);
  if (query.length < 2) throw new Error('Digite pelo menos 2 caracteres do nome do alimento.');
  if (!catalog) {
    const data = await requestTaco('foods.json', signal);
    if (!Array.isArray(data?.foods) || !data.foods.length) throw new Error('Catálogo TACO indisponível ou inválido.');
    catalog = data.foods.filter(food => Number.isSafeInteger(food?.id) && food.id > 0 && typeof food.description === 'string' && food.description.trim())
      .map(food => ({ id: food.id, name: food.description, searchName: normalizedName(food.description) }));
    if (!catalog.length) {
      catalog = undefined;
      throw new Error('Catálogo TACO inválido.');
    }
  }
  const terms = query.split(' ');
  const matches = catalog.filter(food => terms.every(token => food.searchName.includes(token)));
  return matches.sort((a, b) => Number(b.searchName.includes(query)) - Number(a.searchName.includes(query)))
    .slice(0, 8).map(({ id, name }) => ({ id, name }));
}

export async function fetchTacoFood(id, { signal } = {}) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Identificador de alimento TACO inválido.');
  const data = await requestTaco(`foods/${id}.json`, signal);
  if (data?.id !== id || typeof data.description !== 'string' || !data.description.trim()) {
    throw new Error('Ficha do alimento TACO inválida.');
  }
  const food = { name: data.description.trim(), source: 'taco', tacoId: id, servingSize: 100, servingUnit: 'g' };
  for (const [field, key] of Object.entries({ kcal: 'energy_kcal', carbs: 'carbohydrate_g', protein: 'protein_g', fat: 'lipids_g' })) {
    const value = data[key];
    food[field] = Number.isFinite(value) && value >= 0 ? value : '';
  }
  food.warnings = Object.keys(food).some(key => food[key] === '') ? ['Dados incompletos na fonte.'] : [];
  return food;
}
