export type IngredientItem = {
  text: string;
  optional: boolean;
  reason?: string | null;
};

export type IngredientContext = {
  title?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  tags?: string[] | null;
};

const EXPLICIT_OPTIONAL_PATTERNS: Array<[string, RegExp]> = [
  ["optional", /\boptional\b|\(optional\)/i],
  ["to taste", /\bto taste\b/i],
  ["serving", /\bfor serving\b|\bplus more for serving\b/i],
  ["topping", /\bfor toppings?\b|\btoppings?\b|\byour favorite toppings\b/i],
  ["garnish", /\bgarnish\b|\bfor garnish\b/i],
  ["substitution", /\bor substitute\b|\bor use\b|\balternatively\b|\bsubstitute\b|\bswap\b|\bchoice of\b/i]
];

const SMOOTHIE_CONTEXT_PATTERN = /\bsmoothie(?:[-\s]?bowl)?\b|\bacai\b/i;
const SMOOTHIE_MIXIN_PATTERNS: Array<[string, RegExp]> = [
  ["mix-in", /\bprotein powder\b/i],
  ["mix-in", /\b(?:nut|peanut|almond|cashew) butter\b/i],
  ["mix-in", /\b(?:hemp|chia|flax) seeds?\b|\bground flax\b/i],
  ["topping", /\bcacao nibs?\b|\bgranola\b|\bcoconut flakes?\b/i]
];

export function ingredientItemsFromJson(value: unknown, context: IngredientContext = {}): IngredientItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? ingredientItem(text, false, null, context) : null;
      }

      if (!item || Array.isArray(item) || typeof item !== "object") return null;
      const data = item as { text?: unknown; optional?: unknown; reason?: unknown };
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) return null;

      return ingredientItem(text, data.optional === true, typeof data.reason === "string" ? data.reason : null, context);
    })
    .filter((item): item is IngredientItem => Boolean(item));
}

export function ingredientTextsFromJson(
  value: unknown,
  options: { includeOptional?: boolean; context?: IngredientContext } = {}
) {
  return ingredientItemsFromJson(value, options.context)
    .filter((item) => options.includeOptional || !item.optional)
    .map((item) => item.text);
}

function ingredientItem(text: string, alreadyOptional: boolean, existingReason: string | null, context: IngredientContext): IngredientItem {
  const reason = optionalIngredientReason(text, context) || existingReason;
  return {
    text,
    optional: alreadyOptional || Boolean(reason),
    reason
  };
}

function optionalIngredientReason(text: string, context: IngredientContext) {
  for (const [reason, pattern] of EXPLICIT_OPTIONAL_PATTERNS) {
    if (pattern.test(text)) return reason;
  }

  if (!isSmoothieContext(context)) return null;
  for (const [reason, pattern] of SMOOTHIE_MIXIN_PATTERNS) {
    if (pattern.test(text)) return reason;
  }

  return null;
}

function isSmoothieContext(context: IngredientContext) {
  return SMOOTHIE_CONTEXT_PATTERN.test(
    [context.title, context.sourceName, context.sourceUrl, ...(context.tags || [])].filter(Boolean).join(" ")
  );
}
