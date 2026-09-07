const UNITS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.59,
  pound: 453.59,
  pounds: 453.59,
  cup: 140,
  cups: 140,
  tbsp: 14,
  tablespoon: 14,
  tablespoons: 14,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5
};

type Nutrition = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  nutrients?: Record<string, { amount: number; unit?: string | null }>;
};

export async function estimateNutritionFromUsda(ingredients: string[], servings?: number | null) {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    throw new Error("USDA_API_KEY is not configured for recipe-tracker-app");
  }

  const totals: Required<Omit<Nutrition, "nutrients">> = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const nutrients = new Map<string, { amount: number; unit?: string | null }>();
  let matched = 0;
  const divisor = Math.max(Number(servings || 1), 1);

  for (const ingredient of ingredients.slice(0, 20)) {
    const query = cleanIngredientQuery(ingredient);
    if (!query) continue;

    const params = new URLSearchParams({ api_key: apiKey, query, pageSize: "1" });
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`, {
      cache: "no-store"
    });
    if (!response.ok) continue;

    const data = (await response.json()) as { foods?: Array<{ foodNutrients?: Array<{ nutrientName?: string; value?: number }> }> };
    const food = data.foods?.[0];
    if (!food) continue;

    matched += 1;
    const factor = extractGrams(ingredient) / 100;
    for (const nutrient of food.foodNutrients || []) {
      const name = String(nutrient.nutrientName || "").toLowerCase();
      const value = Number(nutrient.value || 0) * factor;
      const unit = String((nutrient as { unitName?: string; unit?: string }).unitName || (nutrient as { unitName?: string; unit?: string }).unit || "").toLowerCase();
      const label = nutrientLabel(name);
      if (label && value) {
        const current = nutrients.get(label);
        nutrients.set(label, { amount: (current?.amount || 0) + value, unit: current?.unit || unit || null });
      }
      if (name.includes("energy")) totals.calories += value;
      else if (name.includes("protein")) totals.protein += value;
      else if (name.includes("carbohydrate")) totals.carbs += value;
      else if (name === "total lipid (fat)") totals.fat += value;
      else if (name.includes("fiber")) totals.fiber += value;
    }
  }

  if (!matched) return null;

  return {
    matched,
    nutrition: {
      calories: round(totals.calories / divisor),
      protein: round(totals.protein / divisor),
      carbs: round(totals.carbs / divisor),
      fat: round(totals.fat / divisor),
      fiber: round(totals.fiber / divisor),
      nutrients: Object.fromEntries(
        [...nutrients.entries()]
          .map(([label, item]) => [label, { amount: round(item.amount / divisor), unit: item.unit }])
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
      )
    }
  };
}

function nutrientLabel(name: string) {
  if (!name) return null;
  if (name.includes("energy")) return "Calories";
  if (name.includes("protein")) return "Protein";
  if (name.includes("carbohydrate")) return "Carbohydrates";
  if (name === "total lipid (fat)") return "Total fat";
  if (name.includes("fiber")) return "Fiber";
  return name.replace(/^\w/, (letter) => letter.toUpperCase());
}

function cleanIngredientQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/^[\d./\s]+(?:cups?|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|oz|ounces?|lb|pounds?)?\s+/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(chopped|diced|minced|sliced|fresh|frozen|cooked|raw|optional|divided)\b/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGrams(value: string) {
  const match = value
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?|\d+\/\d+)\s*(g|grams?|kg|oz|ounces?|lb|pounds?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/);
  if (!match) return 100;
  return numberValue(match[1]) * (UNITS_TO_GRAMS[match[2]] || 100);
}

function numberValue(value: string) {
  if (value.includes("/")) {
    const [top, bottom] = value.split("/", 2);
    return Number(top) / Number(bottom);
  }
  return Number(value);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
