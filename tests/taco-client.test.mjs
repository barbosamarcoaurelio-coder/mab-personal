import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

async function setup(fetch) {
  const module = new SourceTextModule(readFileSync(new URL('../taco-client.js', import.meta.url), 'utf8'), {
    context: createContext({ fetch, AbortController, setTimeout, clearTimeout })
  });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace;
}

test('matches food and preparation locally across accents and word order; never sends the search term', async () => {
  const urls = [];
  const client = await setup(async (url, options) => {
    urls.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return { ok: true, json: async () => ({ foods: [
      { id: 1, description: 'Arroz, integral, cozido' },
      { id: 2, description: 'Arroz, integral, cru' },
      { id: 3, description: 'Feijão, carioca, cozido' }
    ] }) };
  });
  assert.equal((await client.searchTacoFoods('cozido arroz integral'))[0].id, 1);
  assert.equal((await client.searchTacoFoods('feijao cozido'))[0].name, 'Feijão, carioca, cozido');
  assert.equal((await client.searchTacoFoods('7891234567890')).length, 0);
  assert.deepEqual(urls, ['https://brolesi.github.io/taco/foods.json']);
});

test('loads the selected food per 100 g and distinguishes missing nutrients from actual zero', async () => {
  const client = await setup(async url => {
    assert.match(url, /\/foods\/1\.json$/);
    return { ok: true, json: async () => ({
      id: 1, description: 'Arroz, integral, cozido', energy_kcal: 123.53, carbohydrate_g: 25.81, protein_g: null, lipids_g: 0
    }) };
  });
  const food = await client.fetchTacoFood(1);
  assert.deepEqual([food.servingSize, food.servingUnit, food.kcal, food.carbs, food.protein, food.fat], [100, 'g', 123.53, 25.81, '', 0]);
  assert.equal(food.warnings.length, 1);
  await assert.rejects(client.fetchTacoFood('1/2'), /Identificador/);
});

test('surfaces a network failure and allows a later retry', async () => {
  let attempts = 0;
  const client = await setup(async () => ++attempts === 1 ? { ok: false, status: 503 } : {
    ok: true, json: async () => ({ foods: [{ id: 1, description: 'Arroz' }] })
  });
  await assert.rejects(client.searchTacoFoods('arroz'), /HTTP 503/);
  assert.equal((await client.searchTacoFoods('arroz')).length, 1);
});
