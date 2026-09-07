import { notFound } from "next/navigation";
import { RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { macro, minutes, nutrientAmount, titleCase } from "@/lib/format";
import { setRecipeStatus } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { ingredientItemsFromJson } from "@/lib/ingredients";
import { LedgerButton, LedgerSection } from "@/components/ledger";
import { OptionalMixinMacros } from "@/components/optional-mixins";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function listFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function nutrientsFromJson(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([label, item]) => {
      if (!item || Array.isArray(item) || typeof item !== "object") return null;
      const data = item as { amount?: unknown; unit?: unknown };
      const amount = Number(data.amount);
      if (!Number.isFinite(amount)) return null;
      return {
        label,
        amount,
        unit: typeof data.unit === "string" ? data.unit : null
      };
    })
    .filter((item): item is { label: string; amount: number; unit: string | null } => Boolean(item))
    .sort((a, b) => priority(a.label) - priority(b.label) || a.label.localeCompare(b.label));
}

function priority(label: string) {
  const order = ["Calories", "Protein", "Carbohydrates", "Total fat", "Fiber", "Saturated fat", "Sugars", "Sodium"];
  const index = order.indexOf(label);
  return index === -1 ? order.length : index;
}

export default async function RecipeDetail({ params: rawParams }: Props) {
  const params = await rawParams;
  await requireUser();

  const recipe = await prisma.recipe.findUnique({
    where: { id: params.id },
    include: { nutrition: true, tags: { include: { tag: true } }, source: true }
  });

  if (!recipe) notFound();

  const ingredientContext = {
    title: recipe.title,
    sourceName: recipe.source?.name,
    sourceUrl: recipe.sourceUrl,
    tags: recipe.tags.map(({ tag }) => tag.name)
  };
  const ingredients = ingredientItemsFromJson(recipe.ingredients, ingredientContext);
  const requiredIngredients = ingredients.filter((item) => !item.optional);
  const optionalIngredients = ingredients.filter((item) => item.optional);
  const instructions = listFromJson(recipe.instructions);
  const nutrients = nutrientsFromJson((recipe.nutrition as { nutrients?: unknown } | null)?.nutrients);

  return (
    <div className="space-y-5">
      <LedgerButton href="/" variant="secondary">Back to recipes</LedgerButton>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="ledger-card overflow-hidden">
            {recipe.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={recipe.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
            ) : (
              <div className="ledger-placeholder aspect-[16/9]">Recipe image pending</div>
            )}
          </div>
          <div className="ledger-card p-4">
            <div className="ledger-eyebrow text-herb">
              {recipe.source?.name || titleCase(recipe.sourceType)}
            </div>
            <h1 className="mt-2 max-w-4xl text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">{recipe.title}</h1>
            {recipe.description ? <p className="ledger-copy mt-3 max-w-3xl">{recipe.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {recipe.tags.map(({ tag }) => (
                <span key={tag.id} className="ledger-chip">
                  {titleCase(tag.name)}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-2 border-t border-line pt-3 text-xs font-bold uppercase tracking-[0.08em] text-ink/55 sm:grid-cols-4">
              <span>Servings: <span className="metric text-ink">{recipe.servings || "-"}</span></span>
              <span>Prep: <span className="metric text-ink">{minutes(recipe.prepTime)}</span></span>
              <span>Cook: <span className="metric text-ink">{minutes(recipe.cookTime)}</span></span>
              <span>Nutrition: <span className="text-ink">{recipe.nutrition?.source.replace("_", " ") || "missing"}</span></span>
            </div>
          </div>
          <div className="ledger-card p-4 text-sm">
            <div className="ledger-label">Original site</div>
            <a className="mt-1 block break-all text-herb hover:underline" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              {recipe.sourceUrl}
            </a>
          </div>
          <a className="ledger-button ledger-button-primary" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            Open original recipe
          </a>
        </div>

        <aside className="ledger-card h-fit p-4">
          {optionalIngredients.length ? (
            <OptionalMixinMacros
              baseNutrition={recipe.nutrition}
              optionalIngredients={optionalIngredients}
              servings={recipe.servings}
            />
          ) : (
            <>
              <div className="ledger-eyebrow">Per serving</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2 bg-ink px-4 py-5 text-white">
                  <div className="metric text-6xl font-extrabold leading-none">{macro(recipe.nutrition?.calories, "")}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-white/70">calories</div>
                </div>
                <div className="border border-line bg-herb/10 px-4 py-4">
                  <div className="metric text-3xl font-extrabold">{macro(recipe.nutrition?.protein)}</div>
                  <div className="ledger-stat-label">protein</div>
                </div>
                <div className="border border-line bg-citrus/10 px-4 py-4">
                  <div className="metric text-3xl font-extrabold">{macro(recipe.nutrition?.fiber)}</div>
                  <div className="ledger-stat-label">fiber</div>
                </div>
                <div className="border border-line bg-white px-4 py-4">
                  <div className="metric text-2xl font-extrabold">{macro(recipe.nutrition?.carbs)}</div>
                  <div className="ledger-stat-label">carbs</div>
                </div>
                <div className="border border-line bg-white px-4 py-4">
                  <div className="metric text-2xl font-extrabold">{macro(recipe.nutrition?.fat)}</div>
                  <div className="ledger-stat-label">fat</div>
                </div>
              </div>
            </>
          )}
          <div className="mt-4 flex gap-2">
            {recipe.status !== RecipeStatus.approved ? (
              <form action={setRecipeStatus.bind(null, recipe.id, RecipeStatus.approved)}>
                <button className="ledger-button bg-herb text-white">Approve</button>
              </form>
            ) : null}
            {recipe.status !== RecipeStatus.rejected ? (
              <form action={setRecipeStatus.bind(null, recipe.id, RecipeStatus.rejected)}>
                <button className="ledger-button ledger-button-danger">Reject</button>
              </form>
            ) : null}
          </div>
        </aside>
      </section>

      {nutrients.length ? (
        <LedgerSection title="Nutrition details" kicker="Dense nutrient map">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {nutrients.map((item) => (
              <div key={item.label} className="border border-line bg-white px-4 py-3">
                <div className="metric text-xl font-extrabold">{nutrientAmount(item.amount, item.unit)}</div>
                <div className="ledger-stat-label mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </LedgerSection>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {optionalIngredients.length ? (
          <div className="space-y-4">
            <LedgerSection title="Required ingredients" kicker={`${requiredIngredients.length} items`}>
              <ul className="space-y-2">
                {requiredIngredients.map((item, index) => (
                  <li key={`${item.text}-${index}`} className="border-b border-line pb-2 text-sm">
                    {item.text}
                  </li>
                ))}
              </ul>
            </LedgerSection>
          </div>
        ) : (
          <LedgerSection title="Ingredients" kicker={`${ingredients.length} items`}>
            <ul className="space-y-2">
              {ingredients.map((item, index) => (
                <li key={`${item.text}-${index}`} className="border-b border-line pb-2 text-sm">
                  {item.text}
                </li>
              ))}
            </ul>
          </LedgerSection>
        )}
        <LedgerSection title="Instructions" kicker={`${instructions.length} steps`}>
          <ol className="space-y-4">
            {instructions.map((item, index) => (
              <li key={`${item}-${index}`} className="grid grid-cols-[36px_1fr] gap-3">
                <span className="metric flex h-8 w-8 items-center justify-center bg-ink text-sm font-extrabold text-white">{index + 1}</span>
                <span className="pt-1 text-sm leading-6">{item}</span>
              </li>
            ))}
          </ol>
        </LedgerSection>
      </section>
    </div>
  );
}
