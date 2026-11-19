function nutrient(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validChecksum(code) {
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === check;
}

export function isValidEan(code) {
  if (typeof code !== 'string' || !/^(?:\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  if (validChecksum(code)) return true;
  if (code.length !== 8 || !/^[01]/.test(code)) return false;
  // UPC-E carries the checksum of its expanded UPC-A representation.
  const [system, a, b, c, d, e, last, check] = code;
  const expanded = Number(last) <= 2 ? `${system}${a}${b}${last}0000${c}${d}${e}${check}`
    : last === '3' ? `${system}${a}${b}${c}00000${d}${e}${check}`
    : last === '4' ? `${system}${a}${b}${c}${d}00000${e}${check}`
    : `${system}${a}${b}${c}${d}${e}0000${last}${check}`;
  return validChecksum(expanded);
}

export function normalizeOffProduct(json) {
  const product = json?.product;
  if (json?.status === 0 || !product || typeof product !== 'object') throw new Error('Produto não encontrado na Open Food Facts.');
  const nutriments = product.nutriments || {};
  const servingSize = nutrient(product.serving_quantity) || 100;
  const factor = servingSize / 100;
  const per100 = {};
  const result = {
    name: typeof product.product_name === 'string' ? product.product_name.trim() : '',
    brand: typeof product.brands === 'string' ? product.brands.trim() : '',
    barcode: typeof product.code === 'string' ? product.code.trim() : '',
    servingSize, servingUnit: 'g'
  };
  for (const [key, offKey] of Object.entries({ kcal: 'energy-kcal', carbs: 'carbohydrates', protein: 'proteins', fat: 'fat' })) {
    let serving = nutrient(nutriments[`${offKey}_serving`]);
    let hundred = nutrient(nutriments[`${offKey}_100g`]);
    if (key === 'kcal') {
      if (serving == null && nutrient(nutriments.energy_serving) != null) serving = nutrient(nutriments.energy_serving) / 4.184;
      if (hundred == null && nutrient(nutriments.energy_100g) != null) hundred = nutrient(nutriments.energy_100g) / 4.184;
    }
    result[key] = serving ?? (hundred == null ? '' : hundred * factor);
    per100[key] = serving == null ? hundred : serving / factor;
  }
  const incomplete = ['kcal', 'carbs', 'protein', 'fat'].some(key => result[key] === '');
  const macroKcal = result.carbs === '' || result.protein === '' || result.fat === ''
    ? null : result.carbs * 4 + result.protein * 4 + result.fat * 9;
  const macroMass = [per100.carbs, per100.protein, per100.fat].every(value => value != null)
    ? per100.carbs + per100.protein + per100.fat : null;
  const suspicious = per100.kcal > 900 || macroMass > 100 ||
    (result.kcal !== '' && macroKcal != null && Math.abs(result.kcal - macroKcal) > macroKcal * 0.25);
  result.warnings = [];
  if (incomplete) result.warnings.push('dados incompletos');
  if (suspicious) result.warnings.push('valores suspeitos, confira o rótulo');
  return result;
}

async function requestOffJson(url, { signal } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error'
    });
    if (!response.ok) throw new Error(`Open Food Facts indisponível (HTTP ${response.status}).`);
    const contentType = response.headers?.get?.('content-type');
    if (contentType && !contentType.includes('json')) throw new Error('A resposta da Open Food Facts não está em formato JSON.');
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new Error('A consulta à Open Food Facts excedeu 8 segundos.');
    throw new Error(`Não foi possível consultar a Open Food Facts. ${error.message}`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

const OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';

export async function fetchOffProduct(code, options = {}) {
  if (!/^\d+$/.test(code)) throw new Error('O código de barras deve conter somente dígitos.');
  const json = await requestOffJson(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`,
    options
  );
  return normalizeOffProduct(json);
}

export async function searchOffProducts(term, options = {}) {
  const query = typeof term === 'string' ? term.trim() : '';
  if (query.length < 2) throw new Error('Digite pelo menos 2 caracteres para pesquisar.');
  const fields = OFF_FIELDS;
  const json = await requestOffJson(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=${fields}`,
    options
  );
  return (Array.isArray(json?.products) ? json.products : [])
    .filter(product => typeof product?.product_name === 'string' && product.product_name.trim())
    .map(product => normalizeOffProduct({ status: 1, product }));
}
