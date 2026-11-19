import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

const source = readFileSync(new URL('../nutrition-calc.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source, { context: createContext({ Date }) });
await module.link(() => {});
await module.evaluate();
const { sumTotals, scalePortions, macroPercentages, calorieBalance, localDate } = module.namespace;
const plain = value => JSON.parse(JSON.stringify(value));

test('sums snapshots, including empty and fractional meals, without mutation', () => {
  const rows = [{ kcal: 100.5, carbs: 10, protein: 4, fat: 5 }, { kcal: 49.5, carbs: 2.5 }];
  const before = structuredClone(rows);
  assert.deepEqual(plain(sumTotals(rows)), { kcal: 150, carbs: 12.5, protein: 4, fat: 5 });
  assert.deepEqual(plain(sumTotals([])), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
  assert.deepEqual(rows, before);
});

test('scales only nutritional values by fractional or multiple portions', () => {
  const food = { name: 'Arroz', kcal: 120, carbs: 25, protein: 3, fat: 0.4 };
  assert.deepEqual(plain(scalePortions(food, 0.5)), { kcal: 60, carbs: 12.5, protein: 1.5, fat: 0.2 });
  assert.equal(scalePortions(food, 2).kcal, 240);
  assert.equal(food.kcal, 120);
});

test('uses 4/4/9 kcal per gram, not the declared calories, and handles zero', () => {
  assert.deepEqual(plain(macroPercentages({ kcal: 999, carbs: 9, protein: 9, fat: 8 })), { carbs: 25, protein: 25, fat: 50 });
  assert.deepEqual(plain(macroPercentages({})), { carbs: 0, protein: 0, fat: 0 });
  const values = macroPercentages({ carbs: 3, protein: 11, fat: 7 });
  assert.ok(Math.abs(values.carbs + values.protein + values.fat - 100) < 1e-10);
});

test('balance is consumed minus goal, never adjusted by exercise', () => {
  assert.equal(calorieBalance(1500, 2000), -500);
  assert.equal(calorieBalance(2300, 2000), 300);
  assert.equal(calorieBalance(2000, 2000), 0);
});

test('local dates keep the calendar day before and after 21h and at midnight', () => {
  assert.equal(localDate(new Date(2026, 10, 18, 23, 59)), '2026-11-18');
  assert.equal(localDate(new Date(2026, 10, 19, 0, 0)), '2026-11-19');
  assert.equal(localDate(new Date(2026, 0, 2, 1, 0)), '2026-01-02');
  assert.equal(localDate(), localDate(new Date()));
  assert.throws(() => localDate('invalid'), /Data inválida/);
});

test('BRT timestamps after 21h do not advance to the next UTC day', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Sao_Paulo';
    assert.equal(localDate('2026-11-19T02:59:00Z'), '2026-11-18');
    assert.equal(localDate('2026-11-19T03:00:00Z'), '2026-11-19');
  } finally {
    if (previous == null) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
