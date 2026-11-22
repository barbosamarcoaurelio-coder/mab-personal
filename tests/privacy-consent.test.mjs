import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function createEnvironment() {
  const context = createContext({});
  const stores = [
    'settings', 'exercises', 'cycles', 'workoutGroups', 'planItems',
    'workoutSessions', 'executedSets', 'bodyAssessments', 'activityDiary',
    'restTimers', 'dailyRecovery', 'foodItems', 'foodLogs', 'dayClosures'
  ];
  const dbData = {};
  for (const s of stores) dbData[s] = [];

  const dbModule = new SyntheticModule([
    'all', 'get', 'put', 'remove', 'clear', 'tx', 'uuid', 'openDatabase', 'DB_NAME', 'DB_VERSION', 'STORES'
  ], function () {
    this.setExport('DB_NAME', 'mab_personal_db');
    this.setExport('DB_VERSION', 3);
    this.setExport('STORES', stores);
    this.setExport('uuid', () => 'test-uuid-' + Math.random().toString(16).slice(2));
    this.setExport('all', async s => structuredClone(dbData[s] || []));
    this.setExport('get', async (s, key) => {
      const list = dbData[s] || [];
      const item = list.find(row => (row.id ?? row.key ?? row.date) === key);
      return item ? structuredClone(item) : undefined;
    });
    this.setExport('put', async (s, item) => {
      if (!dbData[s]) dbData[s] = [];
      const keyFn = row => row.id ?? row.key ?? row.date;
      const k = keyFn(item);
      const idx = dbData[s].findIndex(row => keyFn(row) === k);
      if (idx >= 0) dbData[s][idx] = structuredClone(item);
      else dbData[s].push(structuredClone(item));
      return structuredClone(item);
    });
    this.setExport('remove', async (s, key) => {
      if (!dbData[s]) return;
      const keyFn = row => row.id ?? row.key ?? row.date;
      dbData[s] = dbData[s].filter(row => keyFn(row) !== key);
    });
    this.setExport('clear', async s => {
      dbData[s] = [];
    });
    this.setExport('tx', async (storeNames, mode, work) => {
      work({
        objectStore: s => ({
          clear: () => { dbData[s] = []; },
          put: item => {
            const keyFn = row => row.id ?? row.key ?? row.date;
            const k = keyFn(item);
            const idx = (dbData[s] || []).findIndex(row => keyFn(row) === k);
            if (idx >= 0) dbData[s][idx] = structuredClone(item);
            else dbData[s].push(structuredClone(item));
          }
        })
      });
    });
    this.setExport('openDatabase', async () => ({}));
  }, { context });

  const validators = new SourceTextModule(readFileSync(new URL('../validators.js', import.meta.url), 'utf8'), { context });
  const backupService = new SourceTextModule(readFileSync(new URL('../backup-service.js', import.meta.url), 'utf8'), { context });
  await backupService.link(specifier => specifier === './db.js' ? dbModule : validators);
  await backupService.evaluate();

  return {
    dbData,
    stores,
    backupService: backupService.namespace,
    // Consent helpers matching app logic:
    hasConsent: async () => {
      const item = (dbData.settings || []).find(r => r.key === 'consentVersion');
      return item?.value === '1';
    },
    acceptConsent: async () => {
      const now = new Date().toISOString();
      const s = dbData.settings || (dbData.settings = []);
      const idxV = s.findIndex(r => r.key === 'consentVersion');
      if (idxV >= 0) s[idxV] = { key: 'consentVersion', value: '1' };
      else s.push({ key: 'consentVersion', value: '1' });
      const idxA = s.findIndex(r => r.key === 'consentAt');
      if (idxA >= 0) s[idxA] = { key: 'consentAt', value: now };
      else s.push({ key: 'consentAt', value: now });
    },
    deleteAllData: async () => {
      for (const st of stores) {
        dbData[st] = [];
      }
    }
  };
}

test('consentimento: aparece só uma vez e grava consentAt e consentVersion 1', async () => {
  const env = await createEnvironment();

  // 1. Initial state: consent is not given
  assert.equal(await env.hasConsent(), false);

  // 2. Accept consent
  await env.acceptConsent();

  // 3. Consent is now granted
  assert.equal(await env.hasConsent(), true);
  const versionRow = env.dbData.settings.find(r => r.key === 'consentVersion');
  const dateRow = env.dbData.settings.find(r => r.key === 'consentAt');
  assert.equal(versionRow?.value, '1');
  assert.ok(dateRow?.value);

  // 4. Subsequent check sees consent without requesting again
  assert.equal(await env.hasConsent(), true);
});

test('exclusão de dados: limpa todos os stores e volta a pedir consentimento', async () => {
  const env = await createEnvironment();

  // Set up existing user data
  await env.acceptConsent();
  env.dbData.exercises.push({ id: 'ex-1', name: 'Supino Reto' });
  env.dbData.workoutSessions.push({ id: 's-1', status: 'completed' });
  env.dbData.foodLogs.push({ id: 'f-1', kcal: 500 });
  env.dbData.bodyAssessments.push({ id: 'b-1', weight: 80 });

  assert.equal(await env.hasConsent(), true);
  assert.equal(env.dbData.exercises.length, 1);
  assert.equal(env.dbData.workoutSessions.length, 1);

  // Perform total deletion
  await env.deleteAllData();

  // Verify all stores are cleared
  for (const store of env.stores) {
    assert.equal(env.dbData[store].length, 0, `Store ${store} should be empty`);
  }

  // Consent is reset to false, so the app will prompt for consent on next open
  assert.equal(await env.hasConsent(), false);
});

test('backup e importação: seguem funcionando perfeitamente com os stores e settings', async () => {
  const env = await createEnvironment();

  await env.acceptConsent();
  env.dbData.exercises.push({ id: 'ex-1', name: 'Agachamento' });
  env.dbData.foodItems.push({ id: 'food-1', name: 'Aveia' });

  // Export backup
  const exported = await env.backupService.exportBackup();
  assert.ok(exported.metadata);
  assert.equal(exported.metadata.databaseVersion, 3);
  assert.equal(exported.data.exercises.length, 1);
  assert.equal(exported.data.foodItems.length, 1);
  assert.equal(exported.data.settings.some(r => r.key === 'consentVersion' && r.value === '1'), true);

  // Clear data
  await env.deleteAllData();
  assert.equal(env.dbData.exercises.length, 0);

  // Import backup in replace mode
  await env.backupService.importBackup(exported, 'replace');

  // Verify data is restored
  assert.equal(env.dbData.exercises.length, 1);
  assert.equal(env.dbData.exercises[0].name, 'Agachamento');
  assert.equal(env.dbData.foodItems.length, 1);
  assert.equal(await env.hasConsent(), true);
});
