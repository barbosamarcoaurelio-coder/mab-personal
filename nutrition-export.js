import { dayNutrition, localDate, MEALS, TOLERANCE, mealCount, proteinByMeal, workoutLocalDate } from './nutrition-calc.js';
import { sessionTimes } from './timer-service.js';

export const DIET_CSV_STORES = ['foodLogs', 'dayClosures', 'dailyRecovery', 'workoutSessions', 'activityDiary'];
const NUTRIENTS = ['protein', 'carbs', 'fat', 'kcal'];
const WELLBEING = ['generalDisposition', 'mealSatiety', 'digestionQuality', 'dayHunger', 'trainingEnergy'];
const decimal = new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 12 });
const mealLabel = meal => Object.hasOwn(MEALS, meal) ? MEALS[meal] : meal;
const toleranceLabel = value => Object.hasOwn(TOLERANCE, value) ? TOLERANCE[value] : value;

const FOOD_HEADERS = ['Data', 'Horário', 'Refeição', 'Alimento', 'Quantidade', 'Unidade', 'Peso (g)',
  'Proteínas (g)', 'Carboidratos (g)', 'Gorduras (g)', 'Calorias (kcal)'];
const DAY_HEADERS = ['Data', 'Calorias totais (kcal)', 'Proteínas totais (g)', 'Carboidratos totais (g)',
  'Gorduras totais (g)', 'Água consumida (ml)', 'Refeições registradas', 'Proteína por refeição (JSON)',
  'Disposição geral (1–5)', 'Saciedade após refeições (1–5)', 'Qualidade da digestão (1–5)',
  'Fome ao longo do dia (1–5)', 'Energia durante os treinos (1–5)', 'Tolerância alimentar (JSON)',
  'Observações de bem-estar', 'Atividades físicas e avaliações (JSON)'];

function measured(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return decimal.format(value);
  const text = String(value);
  // Não permita que texto digitado pelo usuário seja interpretado como fórmula.
  const literal = /^\s*[=+\-@]|^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(literal) ? `"${literal.replaceAll('"', '""')}"` : literal;
}

function serialize(headers, rows, { from, to, version, exportedAt }) {
  const metadata = ['Data de exportação (UTC)', exportedAt.toISOString(), 'Versão do aplicativo', version,
    'Início do período', from, 'Fim do período', to];
  const records = [headers.map((_, index) => metadata[index]), headers, ...rows];
  return '\uFEFF' + records.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

function isoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+day) && day.toISOString().slice(0, 10) === value ? day : null;
}

function activityTime(timestamp) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function activityDetails(record, workout = false) {
  const seconds = workout ? sessionTimes(record).total : null;
  return {
    modalidade: workout ? 'Musculação' : record.modality || null,
    ...(workout && record.groupCode ? { treino: record.groupCode } : {}),
    horario: record.time || activityTime(record.startedAt),
    duracao_min: workout ? (seconds == null ? null : Number((seconds / 60).toFixed(4))) : measured(record.durationMinutes),
    disposicao_durante: measured(record.dispositionDuring),
    recuperacao_apos: measured(record.recoveryAfter),
    observacoes: record.notes || null,
    ...(workout && record.wellbeingNotes ? { observacoes_avaliacao: record.wellbeingNotes } : {})
  };
}

const jsonList = list => list.length ? JSON.stringify(list) : null;
const reportedTotal = (value, rows, key) => {
  const total = measured(value);
  return total !== 0 || rows.some(row => measured(row[key]) != null) ? total : null;
};

export function buildDietCsv(data, { from, to, version, exportedAt = new Date() }) {
  const start = isoDay(from), end = isoDay(to);
  if (!start || !end || start > end) throw new Error('Selecione um período de exportação válido.');
  const buckets = new Map();
  for (const store of DIET_CSV_STORES) {
    for (const record of data[store]) {
      const date = store === 'workoutSessions' ? workoutLocalDate(record) : record.date;
      if (!date || date < from || date > to) continue;
      if (!buckets.has(date)) buckets.set(date, {});
      const day = buckets.get(date);
      (day[store] ??= []).push(record);
    }
  }

  const foodRows = [], dayRows = [];
  for (const day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const records = buckets.get(date) ?? {};
    const { items, consumed, waterLogs, waterMl, toleranceByMeal } = dayNutrition(records.foodLogs ?? [], records.dayClosures?.[0]);
    const recovery = records.dailyRecovery?.[0];
    for (const food of items) {
      const quantity = measured(food.quantity);
      const portions = measured(food.qty);
      foodRows.push([date, food.time, mealLabel(food.meal), food.name, quantity ?? portions,
        quantity != null ? food.unit : portions != null ? 'porção' : null,
        measured(food.weightGrams), ...NUTRIENTS.map(key => measured(food[key]))]);
    }
    const proteins = Object.entries(proteinByMeal(items.filter(item => measured(item.protein) != null)))
      .map(([meal, grams]) => ({ refeicao: mealLabel(meal), proteina_g: grams }));
    const tolerances = Object.entries(toleranceByMeal).filter(([, value]) => value)
      .map(([meal, value]) => ({ refeicao: mealLabel(meal), tolerancia: toleranceLabel(value) }));
    const activities = [...(records.workoutSessions ?? []).map(session => activityDetails(session, true)),
      ...(records.activityDiary ?? []).map(activity => activityDetails(activity))];
    dayRows.push([date, ...['kcal', 'protein', 'carbs', 'fat'].map(key => reportedTotal(consumed[key], items, key)),
      reportedTotal(waterMl, waterLogs, 'quantityMl'), mealCount(items), jsonList(proteins),
      ...WELLBEING.map(key => measured(recovery?.[key])), jsonList(tolerances), recovery?.wellbeingNotes, jsonList(activities)]);
  }
  const metadata = { from, to, version, exportedAt };
  return [
    { name: 'MAB_Diario_Alimentar.csv', label: 'Baixar diário alimentar', csv: serialize(FOOD_HEADERS, foodRows, metadata) },
    { name: 'MAB_Resumo_Diario.csv', label: 'Baixar resumo diário', csv: serialize(DAY_HEADERS, dayRows, metadata) }
  ];
}
