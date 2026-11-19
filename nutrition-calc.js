const KEYS = ['kcal', 'carbs', 'protein', 'fat'];
const NUTRITIONAL_KINDS = new Set(['water', 'meal-feedback']);

export const MEALS = {
  pre_treino: 'Pré-treino', cafe: 'Café da manhã', lanche_manha: 'Lanche da manhã',
  almoco: 'Almoço', lanche_tarde: 'Lanche da tarde', jantar: 'Jantar', ceia: 'Ceia', outra: 'Outra'
};
export const TOLERANCE = {
  good: 'Bem',
  comfortable: 'Satisfeito, mas confortável',
  uncomfortable: 'Desconfortável ou muito cheio'
};

export function isNutritionItem(item) {
  return !NUTRITIONAL_KINDS.has(item.kind);
}

export function dayNutrition(logs, closure) {
  const items = logs.filter(isNutritionItem);
  const waterLogs = logs.filter(item => item.kind === 'water');
  return {
    items, waterLogs,
    toleranceByMeal: Object.fromEntries(logs.filter(item => item.kind === 'meal-feedback').map(item => [item.meal, item.tolerance])),
    waterMl: closure?.waterMl ?? sumWater(waterLogs),
    consumed: closure?.consumed ?? sumTotals(items)
  };
}

export function sumTotals(items) {
  return items.filter(isNutritionItem).reduce((total, item) => {
    for (const key of KEYS) total[key] += Number(item[key] ?? 0);
    return total;
  }, { kcal: 0, carbs: 0, protein: 0, fat: 0 });
}

export function macroCalories({ carbs = 0, protein = 0, fat = 0 }) {
  return Number(carbs) * 4 + Number(protein) * 4 + Number(fat) * 9;
}

export function sumWater(items) {
  return items.reduce((total, item) => total + (item.kind === 'water' ? Number(item.quantityMl ?? 0) : 0), 0);
}

export function mealCount(items) {
  return new Set(items.filter(item => isNutritionItem(item) && item.meal).map(item => item.meal)).size;
}

export function proteinByMeal(items) {
  return items.reduce((totals, item) => {
    if (isNutritionItem(item) && item.meal) totals[item.meal] = (totals[item.meal] || 0) + Number(item.protein ?? 0);
    return totals;
  }, {});
}

export function scalePortions(food, qty) {
  return Object.fromEntries(KEYS.map(key => [key, Number(food[key] ?? 0) * qty]));
}

export function macroPercentages({ carbs = 0, protein = 0, fat = 0 }) {
  const calories = { carbs: carbs * 4, protein: protein * 4, fat: fat * 9 };
  const total = macroCalories({ carbs, protein, fat });
  return Object.fromEntries(Object.entries(calories).map(([key, value]) => [key, total ? value / total * 100 : 0]));
}

export function calorieBalance(consumed, goal) {
  return consumed - goal;
}

export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Data inválida.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function workoutLocalDate(session) {
  if (!session.startedAt || !Number.isFinite(Date.parse(session.startedAt))) return null;
  return localDate(session.startedAt);
}
