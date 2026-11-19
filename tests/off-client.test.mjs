import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, Script } from 'node:vm';

const source = readFileSync(new URL('../off-client.js', import.meta.url), 'utf8');
async function setup(overrides = {}) {
  const context = createContext({ AbortController, setTimeout, clearTimeout, ...overrides });
  const module = new SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace;
}
const { normalizeOffProduct, isValidEan, searchOffProducts } = await setup();
const product = (nutriments, extra = {}) => ({ status: 1, product: { product_name: 'Arroz', brands: 'Marca', nutriments, ...extra } });
const base = { 'energy-kcal_100g': 100, carbohydrates_100g: 20, proteins_100g: 5, fat_100g: 0 };
const plain = value => JSON.parse(JSON.stringify(value));

test('prefers serving values, including zero, without mutating the response', () => {
  const input = product({ ...base, 'energy-kcal_serving': 42, carbohydrates_serving: 8, proteins_serving: 2.5, fat_serving: 0 }, { serving_quantity: 30 });
  const before = structuredClone(input);
  const result = normalizeOffProduct(input);
  assert.equal(result.servingSize, 30);
  assert.equal(result.kcal, 42);
  assert.equal(result.carbs, 8);
  assert.equal(result.protein, 2.5);
  assert.equal(result.fat, 0);
  assert.equal(result.brand, 'Marca');
  assert.deepEqual(input, before);
});

test('scales 100g nutrients to the serving quantity and defaults to 100g', () => {
  const scaled = normalizeOffProduct(product(base, { serving_quantity: 25 }));
  assert.equal(scaled.kcal, 25);
  assert.equal(scaled.carbs, 5);
  assert.equal(scaled.protein, 1.25);
  const fallback = normalizeOffProduct(product(base));
  assert.equal(fallback.servingSize, 100);
  assert.equal(fallback.servingUnit, 'g');
  assert.equal(fallback.kcal, 100);
  assert.deepEqual(plain(fallback.warnings), []);
});

test('converts only supplied kJ to kcal before scaling and supports serving kJ', () => {
  const onlyKj = { ...base, 'energy-kcal_100g': undefined, energy_100g: 418.4 };
  assert.ok(Math.abs(normalizeOffProduct(product(onlyKj, { serving_quantity: 30 })).kcal - 30) < 1e-8);
  assert.ok(Math.abs(normalizeOffProduct(product({ ...onlyKj, energy_serving: 83.68 }, { serving_quantity: 20 })).kcal - 20) < 1e-8);
});

test('missing or invalid nutrients stay empty, not invented from other macros', () => {
  const result = normalizeOffProduct(product({ carbohydrates_100g: 20, proteins_100g: null, fat_100g: -1 }));
  assert.equal(result.kcal, '');
  assert.equal(result.protein, '');
  assert.equal(result.fat, '');
  assert.equal(result.carbs, 20);
  assert.ok(result.warnings.includes('dados incompletos'));
  const empty = normalizeOffProduct(product({ 'energy-kcal_100g': '', carbohydrates_100g: false }));
  assert.equal(empty.kcal, '');
  assert.equal(empty.carbs, '');
});

test('warns above 900 kcal/100g or 100g of macros, including serving-only data', () => {
  const valid = normalizeOffProduct(product({ 'energy-kcal_100g': 900, carbohydrates_100g: 0, proteins_100g: 0, fat_100g: 100 }));
  assert.deepEqual(plain(valid.warnings), []);
  const energy = normalizeOffProduct(product({ 'energy-kcal_100g': 901, carbohydrates_100g: 0, proteins_100g: 0, fat_100g: 100 }));
  assert.ok(energy.warnings.includes('valores suspeitos, confira o rótulo'));
  const mass = normalizeOffProduct(product({ 'energy-kcal_serving': 80.4, carbohydrates_serving: 20.1, proteins_serving: 0, fat_serving: 0 }, { serving_quantity: 20 }));
  assert.ok(mass.warnings.includes('valores suspeitos, confira o rótulo'));
});

test('macro-energy discrepancy warns only above 25 percent', () => {
  const values = { carbohydrates_100g: 25, proteins_100g: 0, fat_100g: 0 };
  assert.deepEqual(plain(normalizeOffProduct(product({ ...values, 'energy-kcal_100g': 125 })).warnings), []);
  assert.ok(normalizeOffProduct(product({ ...values, 'energy-kcal_100g': 125.1 })).warnings.includes('valores suspeitos, confira o rótulo'));
});

test('unknown products fail explicitly', () => {
  assert.throws(() => normalizeOffProduct({ status: 0 }), /Produto não encontrado/);
  assert.throws(() => normalizeOffProduct(null), /Produto não encontrado/);
});

test('validates EAN-13, EAN-8, UPC-A and expanded UPC-E without losing zeros', () => {
  for (const code of ['4006381333931', '96385074', '036000291452', '04252614']) assert.equal(isValidEan(code), true, code);
  for (const code of ['4006381333932', '96385075', '036000291453', '123', '', ' 96385074', 'abcd', 96385074, null]) assert.equal(isValidEan(code), false, String(code));
});

test('fetch sends only the code and fixed field selection with no credentials or referrer', async () => {
  const calls = [];
  const client = await setup({ fetch: async (...args) => { calls.push(args); return { ok: true, json: async () => product(base) }; } });
  assert.equal((await client.fetchOffProduct('036000291452')).kcal, 100);
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, 'https://world.openfoodfacts.org/api/v2/product/036000291452.json?fields=code,product_name,brands,serving_size,serving_quantity,nutriments');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.body, undefined);
  assert.equal(options.redirect, 'error');
  await assert.rejects(client.fetchOffProduct('123/abc'), /somente dígitos/);
  assert.equal(calls.length, 1);
});

test('searches Open Food Facts by text and preserves unknown nutrients', async () => {
  const calls = [];
  const client = await setup({
    fetch: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ products: [
        { product_name: 'Leite integral', code: '123', nutriments: { proteins_100g: 3.2 } },
        { product_name: '', nutriments: base }
      ] }) };
    }
  });
  const results = await client.searchOffProducts('  leite integral  ');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Leite integral');
  assert.equal(results[0].barcode, '123');
  assert.equal(results[0].protein, 3.2);
  assert.equal(results[0].kcal, '');
  assert.ok(results[0].warnings.includes('dados incompletos'));
  const [url, options] = calls[0];
  assert.match(url, /cgi\/search\.pl\?search_terms=leite%20integral/);
  assert.match(url, /page_size=8/);
  assert.equal(options.credentials, 'omit');
  await assert.rejects(client.searchOffProducts(' '), /pelo menos 2 caracteres/);
  assert.equal(calls.length, 1);
});

test('reports non-JSON responses from Open Food Facts clearly', async () => {
  const client = await setup({
    fetch: async () => ({ ok: true, headers: { get: () => 'text/html' }, json: async () => { throw new Error('Unexpected token <'); } })
  });
  await assert.rejects(client.searchOffProducts('leite integral'), /não está em formato JSON/);
});

test('times out at eight seconds, aborts the request and surfaces HTTP errors', async () => {
  let cleared = false;
  const client = await setup({
    setTimeout: (callback, ms) => { assert.equal(ms, 8000); return setImmediate(callback); },
    clearTimeout: handle => { cleared = true; clearImmediate(handle); },
    fetch: async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  });
  await assert.rejects(client.fetchOffProduct('4006381333931'), /excedeu 8 segundos/);
  assert.equal(cleared, true);
  const failed = await setup({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(failed.fetchOffProduct('4006381333931'), /HTTP 503/);
});

test('service worker never intercepts or caches Open Food Facts requests', async () => {
  const handlers = {};
  const script = new Script(readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'));
  script.runInNewContext({
    URL,
    self: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    fetch: () => { throw new Error('OFF must not pass through the service worker'); },
    caches: { open: () => { throw new Error('OFF must not be cached'); } }
  });
  for (const host of ['world.openfoodfacts.org', 'openfoodfacts.org', 'fr.openfoodfacts.org']) {
    let intercepted = false;
    handlers.fetch({ request: { url: `https://${host}/api/v2/product/123.json`, method: 'GET' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
