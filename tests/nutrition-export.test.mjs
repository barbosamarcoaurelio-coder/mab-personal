import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

const context = createContext({ Date, Intl });
const load = name => new SourceTextModule(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'), { context });
const exporter = load('nutrition-export.js');
const calc = load('nutrition-calc.js');
await exporter.link(path => path === './nutrition-calc.js' ? calc : load('timer-service.js'));
await exporter.evaluate();
const { buildDietCsv } = exporter.namespace;
const { dayNutrition } = calc.namespace;
const options = { from: '2026-11-18', to: '2026-11-20', version: '4.9.0', exportedAt: new Date('2026-11-21T00:00:00Z') };
const empty = () => ({ foodLogs: [], dayClosures: [], dailyRecovery: [], workoutSessions: [], activityDiary: [] });

function parse(csv) {
  assert.equal(csv[0], '\uFEFF');
  const records = [...csv.slice(1).matchAll(/((?:"(?:[^"]|"")*"|[^;"\r\n]*))(;|\r\n)/g)];
  assert.equal(records.map(record => record[0]).join(''), csv.slice(1));
  const rows = [[]];
  for (const [, cell, separator] of records) {
    rows.at(-1).push(cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell);
    if (separator === '\r\n') rows.push([]);
  }
  rows.pop();
  for (const row of rows) assert.equal(row.length, rows[1].length);
  return rows;
}

test('CSV export preserves food details, excludes water and feedback, and matches the closed-day summary', () => {
  const data = empty();
  const date = '2026-11-19';
  data.foodLogs = [
    { date, time: '08:05', meal: 'cafe', name: 'Pão; "artesanal"\ncom grãos', quantity: 45.5, unit: 'g', weightGrams: 45.5, protein: 4.5, carbs: 22, fat: 0, kcal: 106 },
    { date, meal: 'almoco', name: 'Feijão', qty: 2, protein: 8, carbs: 13, kcal: 84 },
    { date, kind: 'water', quantityMl: 300 },
    { date, kind: 'meal-feedback', meal: 'cafe', tolerance: 'comfortable' },
    { date, kind: 'meal-feedback', meal: 'almoco', tolerance: 'good' },
    { date: '2026-11-21', name: 'Fora do período' }
  ];
  data.dayClosures = [{ date, consumed: { kcal: 200, protein: 13, carbs: 37, fat: 0 }, waterMl: 400 }];
  data.dailyRecovery = [{ date, digestionQuality: 4, wellbeingNotes: '  =texto anotado' }];
  const before = structuredClone(data);
  const [food, summary] = buildDietCsv(data, options);
  const [meta, , ...foods] = parse(food.csv);
  assert.deepEqual(meta.slice(0, 8), ['Data de exportação (UTC)', '2026-11-21T00:00:00.000Z', 'Versão do aplicativo', '4.9.0', 'Início do período', options.from, 'Fim do período', options.to]);
  assert.deepEqual(foods, [
    [date, '08:05', 'Café da manhã', 'Pão; "artesanal"\ncom grãos', '45,5', 'g', '45,5', '4,5', '22', '0', '106'],
    [date, '', 'Almoço', 'Feijão', '2', 'porção', '', '8', '13', '', '84']
  ]);
  const [, , first, daily, last] = parse(summary.csv);
  assert.deepEqual(first.slice(0, 7), ['2026-11-18', '', '', '', '', '', '0']);
  const visible = dayNutrition(data.foodLogs.filter(row => row.date === date), data.dayClosures[0]);
  assert.deepEqual(daily.slice(0, 7), [date, ...[visible.consumed.kcal, visible.consumed.protein, visible.consumed.carbs, visible.consumed.fat, visible.waterMl, 2].map(String)]);
  assert.deepEqual(JSON.parse(daily[7]), [{ refeicao: 'Café da manhã', proteina_g: 4.5 }, { refeicao: 'Almoço', proteina_g: 8 }]);
  assert.deepEqual(JSON.parse(daily[13]).map(row => row.tolerancia), ['Satisfeito, mas confortável', 'Bem']);
  assert.deepEqual(daily.slice(8, 13), ['', '', '4', '', '']);
  assert.equal(daily[14], "'  =texto anotado");
  assert.equal(daily[15], '');
  assert.equal(last[0], '2026-11-20');
  assert.deepEqual(data, before);
});

test('daily export keeps multiple activities and their scores together, including activity-only days', () => {
  const data = empty();
  const date = '2026-11-19';
  const startedAt = new Date(2026, 10, 19, 23, 40);
  data.workoutSessions = [{ startedAt: startedAt.toISOString(), finishedAt: new Date(+startedAt + 45 * 60_000).toISOString(),
    groupCode: 'A', dispositionDuring: 5, wellbeingNotes: 'Boa recuperação' }];
  data.activityDiary = [
    { date, modality: 'Bicicleta', durationMinutes: 32.5, time: '09:20', recoveryAfter: 3 },
    { date, modality: 'Pilates', notes: 'Sessão leve' }
  ];
  const [food, summary] = buildDietCsv(data, { ...options, from: date, to: date });
  assert.equal(parse(food.csv).length, 2);
  const [, , row] = parse(summary.csv);
  assert.deepEqual(row.slice(0, 7), [date, '', '', '', '', '', '0']);
  assert.deepEqual(JSON.parse(row[15]), [
    { modalidade: 'Musculação', treino: 'A', horario: '23:40', duracao_min: 45, disposicao_durante: 5, recuperacao_apos: null, observacoes: null, observacoes_avaliacao: 'Boa recuperação' },
    { modalidade: 'Bicicleta', horario: '09:20', duracao_min: 32.5, disposicao_durante: null, recuperacao_apos: 3, observacoes: null },
    { modalidade: 'Pilates', horario: null, duracao_min: null, disposicao_durante: null, recuperacao_apos: null, observacoes: 'Sessão leve' }
  ]);
});

test('invalid or reversed date ranges are not exported', () => {
  for (const from of ['2026-02-30', '2026-11-21', '']) {
    assert.throws(() => buildDietCsv(empty(), { ...options, from }), /período de exportação válido/);
  }
});
