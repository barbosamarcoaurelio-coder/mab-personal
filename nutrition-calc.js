const KEYS = ['kcal', 'carbs', 'protein', 'fat'];

export function sumTotals(items) {
  return items.reduce((total, item) => {
    for (const key of KEYS) total[key] += Number(item[key] ?? 0);
    return total;
  }, { kcal: 0, carbs: 0, protein: 0, fat: 0 });
}

export function scalePortions(food, qty) {
  return Object.fromEntries(KEYS.map(key => [key, Number(food[key] ?? 0) * qty]));
}

export function macroPercentages({ carbs = 0, protein = 0, fat = 0 }) {
  const calories = { carbs: carbs * 4, protein: protein * 4, fat: fat * 9 };
  const total = calories.carbs + calories.protein + calories.fat;
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
