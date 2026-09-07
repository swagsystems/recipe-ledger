import os
import re
from collections import defaultdict

import requests


SCRAPED_NUTRIENT_LABELS = {
    "calories": "Calories",
    "calories_value": "Calories",
    "proteinContent": "Protein",
    "protein": "Protein",
    "carbohydrateContent": "Carbohydrates",
    "carbohydrates": "Carbohydrates",
    "fatContent": "Total fat",
    "fat": "Total fat",
    "fiberContent": "Fiber",
    "fiber": "Fiber",
    "saturatedFatContent": "Saturated fat",
    "transFatContent": "Trans fat",
    "cholesterolContent": "Cholesterol",
    "sodiumContent": "Sodium",
    "sugarContent": "Sugars",
    "unsaturatedFatContent": "Unsaturated fat",
}

USDA_NUTRIENT_ALIASES = {
    "energy": "Calories",
    "protein": "Protein",
    "carbohydrate": "Carbohydrates",
    "total lipid (fat)": "Total fat",
    "fiber": "Fiber",
}


KNOWN = {
    "chicken breast": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0},
    "greek yogurt": {"calories": 59, "protein": 10, "carbs": 3.6, "fat": 0.4, "fiber": 0},
    "cottage cheese": {"calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "fiber": 0},
    "egg": {"calories": 72, "protein": 6.3, "carbs": 0.4, "fat": 5, "fiber": 0},
    "oats": {"calories": 389, "protein": 17, "carbs": 66, "fat": 7, "fiber": 10.6},
    "beans": {"calories": 127, "protein": 8.7, "carbs": 22.8, "fat": 0.5, "fiber": 6.4},
    "lentils": {"calories": 116, "protein": 9, "carbs": 20, "fat": 0.4, "fiber": 7.9},
    "broccoli": {"calories": 34, "protein": 2.8, "carbs": 6.6, "fat": 0.4, "fiber": 2.6},
    "protein powder": {"calories": 390, "protein": 78, "carbs": 8, "fat": 6, "fiber": 3},
}

UNITS_TO_GRAMS = {
    "g": 1,
    "gram": 1,
    "grams": 1,
    "kg": 1000,
    "oz": 28.35,
    "ounce": 28.35,
    "ounces": 28.35,
    "lb": 453.59,
    "pound": 453.59,
    "pounds": 453.59,
    "cup": 140,
    "cups": 140,
    "tbsp": 14,
    "tablespoon": 14,
    "tablespoons": 14,
    "tsp": 5,
    "teaspoon": 5,
    "teaspoons": 5,
}


def scraped_nutrition(scraper, servings):
    try:
        nutrients = scraper.nutrients() or {}
    except Exception:
        return None

    detailed = {}

    def parsed(value):
        match = re.search(r"(\d+(?:\.\d+)?)\s*([a-zA-Zµ%]*)", str(value).replace(",", ""))
        if not match:
            return None
        return {"amount": float(match.group(1)), "unit": match.group(2) or None}

    for key, value in nutrients.items():
        item = parsed(value)
        if not item:
            continue
        label = SCRAPED_NUTRIENT_LABELS.get(key) or _label_from_key(key)
        detailed[label] = item

    def pick(*keys):
        for key in keys:
            item = parsed(nutrients.get(key))
            if item:
                return item["amount"]
        return None

    data = {
        "calories": pick("calories", "calories_value"),
        "protein": pick("proteinContent", "protein"),
        "carbs": pick("carbohydrateContent", "carbohydrates"),
        "fat": pick("fatContent", "fat"),
        "fiber": pick("fiberContent", "fiber"),
    }
    if not any(value is not None for value in data.values()):
        return None

    if detailed:
        data["nutrients"] = detailed
    return data


def estimate_from_ingredients(ingredients, servings):
    totals = defaultdict(float)
    matched = 0
    servings = max(int(servings or 1), 1)

    for raw in ingredients:
        line = raw.lower()
        grams = _extract_grams(line)
        for name, macros in KNOWN.items():
            if re.search(rf"\b{re.escape(name)}\b", line):
                matched += 1
                factor = grams / 100
                for key, value in macros.items():
                    totals[key] += value * factor
                break

    if not matched:
        return usda_estimate(ingredients, servings)

    data = {key: round(value / servings, 1) for key, value in totals.items()}
    data["nutrients"] = _detail_from_macro_totals(data)
    return data


def usda_estimate(ingredients, servings):
    api_key = os.environ.get("USDA_API_KEY")
    if not api_key:
        return None

    totals = defaultdict(float)
    matched = 0
    servings = max(int(servings or 1), 1)

    for raw in ingredients[:20]:
        query = re.sub(r"^[\d./\s]+(?:cups?|tbsp|tsp|g|kg|oz|lb|pounds?)?\s+", "", raw, flags=re.I)
        try:
            response = requests.get(
                "https://api.nal.usda.gov/fdc/v1/foods/search",
                params={"api_key": api_key, "query": query, "pageSize": 1},
                timeout=15,
            )
            response.raise_for_status()
            foods = response.json().get("foods", [])
        except Exception:
            continue
        if not foods:
            continue

        matched += 1
        grams = _extract_grams(raw.lower())
        factor = grams / 100
        for nutrient in foods[0].get("foodNutrients", []):
            name = nutrient.get("nutrientName", "").lower()
            unit = nutrient.get("unitName") or nutrient.get("unit") or ""
            value = float(nutrient.get("value") or 0) * factor
            label = _usda_label(name)
            if label and value:
                totals[f"nutrient:{label}:{unit}"] += value
            if "energy" in name:
                totals["calories"] += value
            elif "protein" in name:
                totals["protein"] += value
            elif "carbohydrate" in name:
                totals["carbs"] += value
            elif name == "total lipid (fat)":
                totals["fat"] += value
            elif "fiber" in name:
                totals["fiber"] += value

    if not matched:
        return None
    data = {}
    detailed = {}
    for key, value in totals.items():
        per_serving = round(value / servings, 1)
        if key.startswith("nutrient:"):
            _, label, unit = key.split(":", 2)
            detailed[label] = {"amount": per_serving, "unit": unit.lower() or None}
        else:
            data[key] = per_serving
    if detailed:
        data["nutrients"] = detailed
    return data


def _detail_from_macro_totals(macros):
    labels = {
        "calories": ("Calories", ""),
        "protein": ("Protein", "g"),
        "carbs": ("Carbohydrates", "g"),
        "fat": ("Total fat", "g"),
        "fiber": ("Fiber", "g"),
    }
    detailed = {}
    for key, (label, unit) in labels.items():
        value = macros.get(key)
        if value is not None:
            detailed[label] = {"amount": value, "unit": unit}
    return detailed


def _label_from_key(key):
    label = re.sub(r"Content$", "", str(key))
    label = re.sub(r"([a-z])([A-Z])", r"\1 \2", label)
    return label[:1].upper() + label[1:]


def _usda_label(name):
    if not name:
        return None
    for needle, label in USDA_NUTRIENT_ALIASES.items():
        if needle in name:
            return label
    return name[:1].upper() + name[1:]


def _extract_grams(line):
    match = re.search(r"(\d+(?:\.\d+)?|\d+/\d+)\s*(g|grams?|kg|oz|ounces?|lb|pounds?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b", line)
    if not match:
        return 100
    amount = _number(match.group(1))
    unit = match.group(2)
    return amount * UNITS_TO_GRAMS.get(unit, 100)


def _number(value):
    if "/" in value:
        top, bottom = value.split("/", 1)
        return float(top) / float(bottom)
    return float(value)
