const KEYS = ['kcal', 'carbs', 'protein', 'fat'];
const NUTRITIONAL_KINDS = new Set(['water', 'meal-feedback']);

export function isNutritionItem(item) {
  return !NUTRITIONAL_KINDS.has(item.kind);
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
