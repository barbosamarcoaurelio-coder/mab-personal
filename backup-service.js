import {
  all,
  DB_VERSION,
  put,
  tx,
  STORES
} from './db.js';
import {
  validateBackup
} from './validators.js';
export async function exportBackup() {
  const data = {};
  for (const s of STORES) data[s] = await all(s);
  const recordCounts = {};
  for (const [k, v] of Object.entries(data)) recordCounts[k] = v.length;
  return {
    metadata: {
      app: 'Controle de Treinos MAB Personal',
      formatVersion: 1,
      databaseVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      recordCounts
    },
    data
  }
}
export function downloadBackup(obj, prefix = 'mab-personal-backup') {
  put('settings', { key: 'lastBackupAt', value: new Date().toISOString() }).catch(() => {});
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export async function importBackup(obj, mode = 'replace') {
  validateBackup(obj);
  const snapshot = await exportBackup();
  const stores = STORES.filter(store => Object.hasOwn(obj.data, store));
  for (const store of stores) {
    if (!Array.isArray(obj.data[store])) throw new Error(`Store inválido no backup: ${store}`);
  }
  const incoming = obj.data;
  let created = 0,
    updated = 0;
  for (const store of stores) {
    const keys = new Set(mode === 'replace' ? [] : snapshot.data[store].map(item => item.id ?? item.key ?? item.date));
    for (const item of incoming[store]) {
      const key = item.id ?? item.key ?? item.date;
      if (keys.has(key)) updated++;
      else created++;
      keys.add(key)
    }
  }
  try {
    await tx(STORES, 'readwrite', transaction => {
      for (const store of stores) {
        const objectStore = transaction.objectStore(store);
        if (mode === 'replace') objectStore.clear();
        if (mode === 'replace' && store === 'settings' && !stores.includes('foodLogs') &&
            !incoming.settings.some(item => item.key === 'nutritionGoals')) {
          const goals = snapshot.data.settings.find(item => item.key === 'nutritionGoals');
          if (goals) objectStore.put(goals);
        }
        for (const item of incoming[store]) objectStore.put(item)
      }
    })
  } catch (error) {
    throw new Error(`Importação cancelada; os dados locais foram preservados. ${error.message}`)
  }
  return {
    created,
    updated
  }
}