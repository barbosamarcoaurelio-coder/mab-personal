import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function setup() {
  const context = createContext({});
  const stores = ['settings', 'foodItems', 'foodLogs', 'dayClosures'];
  const data = {
    settings: [{ key: 'nutritionGoals', value: { kcal: 2000 } }, { key: 'old', value: true }],
    foodItems: [{ id: 'food', name: 'Arroz' }],
    foodLogs: [{ id: 'log', kcal: 120 }],
    dayClosures: [{ date: '2026-11-18', balance: -100 }]
  };
  const db = new SyntheticModule(['all', 'DB_VERSION', 'put', 'tx', 'STORES'], function () {
    this.setExport('all', async store => structuredClone(data[store]));
    this.setExport('DB_VERSION', 3);
    this.setExport('STORES', stores);
    this.setExport('put', () => {});
    this.setExport('tx', async (names, mode, work) => {
      const next = structuredClone(data);
      work({ objectStore: store => ({
        clear: () => { next[store] = []; },
        put: item => {
          const key = row => row.id ?? row.key ?? row.date;
          const index = next[store].findIndex(row => key(row) === key(item));
          if (index < 0) next[store].push(item);
          else next[store][index] = item;
        }
      }) });
      Object.assign(data, next);
    });
  }, { context });
  const validators = new SourceTextModule(readFileSync(new URL('../validators.js', import.meta.url), 'utf8'), { context });
  const service = new SourceTextModule(readFileSync(new URL('../backup-service.js', import.meta.url), 'utf8'), { context });
  await service.link(specifier => specifier === './db.js' ? db : validators);
  await service.evaluate();
  const backup = contents => ({ metadata: { app: 'Controle de Treinos MAB Personal', formatVersion: 1 }, data: contents });
  return { ...service.namespace, data, backup };
}

test('replace with an old backup preserves missing stores and nutrition goals', async () => {
  const app = await setup();
  const before = structuredClone(app.data);
  await app.importBackup(app.backup({ settings: [{ key: 'theme', value: 'dark' }] }));
  for (const store of ['foodItems', 'foodLogs', 'dayClosures']) assert.deepEqual(app.data[store], before[store]);
  assert.deepEqual(app.data.settings.find(row => row.key === 'nutritionGoals'), before.settings[0]);
  assert.equal(app.data.settings.some(row => row.key === 'old'), false);
});

test('explicit empty stores are cleared and day closures merge by date', async () => {
  const app = await setup();
  await app.importBackup(app.backup({ dayClosures: [{ date: '2026-11-18', balance: 50 }] }), 'merge');
  assert.equal(app.data.dayClosures.length, 1);
  assert.equal(app.data.dayClosures[0].balance, 50);
  await app.importBackup(app.backup({ foodLogs: [] }));
  assert.equal(app.data.foodLogs.length, 0);
  assert.equal(app.data.foodItems.length, 1);
});

test('invalid supplied store fails explicitly before changing data', async () => {
  const app = await setup();
  const before = structuredClone(app.data);
  await assert.rejects(app.importBackup(app.backup({ foodLogs: null })), /Store inválido/);
  assert.deepEqual(app.data, before);
  const exported = await app.exportBackup();
  assert.equal(exported.metadata.databaseVersion, 3);
  assert.equal(exported.data.foodLogs[0].id, 'log');
});

test('barcode provenance fields survive export and replace without affecting legacy foods', async () => {
  const app = await setup();
  const scanned = { id: 'scanned', name: 'Produto', barcode: '036000291452', brand: 'Marca', source: 'openfoodfacts', offFetchedAt: '2026-11-18T12:00:00Z' };
  app.data.foodItems.push(scanned);
  const backup = await app.exportBackup();
  app.data.foodItems = [];
  await app.importBackup(backup);
  assert.deepEqual(app.data.foodItems.find(item => item.id === 'scanned'), scanned);
  assert.deepEqual(app.data.foodItems.find(item => item.id === 'food'), { id: 'food', name: 'Arroz' });
});

test('new meal measurements, times, and water records survive backup without changing legacy logs', async () => {
  const app = await setup();
  const measured = {
    id: 'measured', date: '2026-11-19', time: '08:30', meal: 'cafe', name: 'Leite',
    qty: 1.5, quantity: 300, unit: 'ml', kcal: 180, protein: 9, carbs: 15, fat: 9
  };
  const weighed = {
    id: 'weighed', date: '2026-11-19', time: '08:35', meal: 'cafe', name: 'Pão',
    qty: 1.5, quantity: 75, unit: 'g', weightGrams: 75, kcal: 200, protein: 6, carbs: 36, fat: 2
  };
  const water = { id: 'water', kind: 'water', date: '2026-11-19', time: '09:00', quantityMl: 250, unit: 'ml' };
  app.data.foodLogs.push(measured, weighed, water);
  const backup = await app.exportBackup();
  app.data.foodLogs = [];
  await app.importBackup(backup);
  assert.deepEqual(app.data.foodLogs.find(item => item.id === 'measured'), measured);
  assert.deepEqual(app.data.foodLogs.find(item => item.id === 'weighed'), weighed);
  assert.deepEqual(app.data.foodLogs.find(item => item.id === 'water'), water);
  assert.deepEqual(app.data.foodLogs.find(item => item.id === 'log'), { id: 'log', kcal: 120 });
});
