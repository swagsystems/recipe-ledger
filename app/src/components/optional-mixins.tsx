"use client";

import { useMemo, useState } from "react";
import { estimateOptionalMixins } from "@/lib/actions";
import type { IngredientItem } from "@/lib/ingredients";

type MacroNutrition = {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
};

type EstimateResult = MacroNutrition & {
  matched: number;
};

type Props = {
  baseNutrition: MacroNutrition | null;
  optionalIngredients: IngredientItem[];
  servings?: number | null;
};

const EMPTY_ESTIMATE: EstimateResult = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, matched: 0 };

export function OptionalMixinMacros({ baseNutrition, optionalIngredients, servings }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [cache, setCache] = useState<Record<string, EstimateResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const cacheKey = useMemo(() => selected.slice().sort().join("\n"), [selected]);
  const estimate = cacheKey ? cache[cacheKey] : EMPTY_ESTIMATE;
  const totals = addNutrition(baseNutrition, estimate);
  const selectedCount = selected.length;

  function toggleIngredient(text: string) {
    const next = selected.includes(text) ? selected.filter((item) => item !== text) : [...selected, text];
    const nextKey = next.slice().sort().join("\n");
    setSelected(next);
    setError(null);

    if (!next.length || cache[nextKey]) return;

    setLoadingKey(nextKey);
    estimateOptionalMixins(next, servings)
      .then((result) => {
        setCache((current) => ({ ...current, [nextKey]: result || EMPTY_ESTIMATE }));
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not estimate selected mix-ins");
      })
      .finally(() => {
        setLoadingKey((current) => (current === nextKey ? null : current));
      });
  }

  return (
    <div>
      <div className="ledger-eyebrow">Per serving</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MacroTile className="col-span-2 bg-ink px-4 py-5 text-white" value={totals.calories} label="calories" large suffix="" />
        <MacroTile className="border border-line bg-herb/10 px-4 py-4" value={totals.protein} label="protein" />
        <MacroTile className="border border-line bg-citrus/10 px-4 py-4" value={totals.fiber} label="fiber" />
        <MacroTile className="border border-line bg-white px-4 py-4" value={totals.carbs} label="carbs" compact />
        <MacroTile className="border border-line bg-white px-4 py-4" value={totals.fat} label="fat" compact />
      </div>

      <div className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-ink/55">
        {selectedCount ? `Stored base + ${selectedCount} selected mix-in${selectedCount === 1 ? "" : "s"}` : "Stored base macros"}
      </div>
      {!baseNutrition ? (
        <p className="ledger-copy mt-2 text-xs">No stored base macros yet; selected mix-ins show as an add-on estimate.</p>
      ) : null}
      {loadingKey === cacheKey ? <p className="ledger-copy mt-2 text-xs">Estimating selected mix-ins...</p> : null}
      {error ? <p className="mt-2 text-xs font-bold text-danger">{error}</p> : null}
      {selectedCount && estimate ? (
        <div className="mt-2 text-xs text-ink/60">
          Selected add-on: {macroText(estimate.calories, "")} cal, {macroText(estimate.protein)} protein,{" "}
          {macroText(estimate.fiber)} fiber
        </div>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <div className="ledger-eyebrow">Optional mix-ins</div>
        <div className="mt-3 space-y-2">
          {optionalIngredients.map((item, index) => (
            <label key={`${item.text}-${index}`} className="flex cursor-pointer items-start gap-3 border-b border-line pb-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-herb"
                checked={selected.includes(item.text)}
                onChange={() => toggleIngredient(item.text)}
              />
              <span className="min-w-0">
                <span className="block">{item.text}</span>
                {item.reason ? (
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink/45">{item.reason}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function MacroTile({
  className,
  value,
  label,
  suffix = "g",
  large = false,
  compact = false
}: {
  className: string;
  value?: number | null;
  label: string;
  suffix?: string;
  large?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={className}>
      <div className={`metric font-extrabold ${large ? "text-6xl leading-none" : compact ? "text-2xl" : "text-3xl"}`}>
        {macroText(value, suffix)}
      </div>
      <div className={large ? "mt-1 text-xs font-bold uppercase tracking-[0.12em] text-white/70" : "ledger-stat-label"}>
        {label}
      </div>
    </div>
  );
}

function addNutrition(base: MacroNutrition | null, estimate?: MacroNutrition | null): MacroNutrition {
  return {
    calories: add(base?.calories, estimate?.calories),
    protein: add(base?.protein, estimate?.protein),
    carbs: add(base?.carbs, estimate?.carbs),
    fat: add(base?.fat, estimate?.fat),
    fiber: add(base?.fiber, estimate?.fiber)
  };
}

function add(left?: number | null, right?: number | null) {
  if (left === null || left === undefined) return right ?? null;
  return Math.round((left + (right || 0)) * 10) / 10;
}

function macroText(value?: number | null, suffix = "g") {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value)}${suffix}`;
}
