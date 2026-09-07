import Link from "next/link";
import type { ReactNode } from "react";
import { macro, minutes, titleCase } from "@/lib/format";

type Tone = "neutral" | "green" | "amber" | "red";

export function LedgerShell({ children }: { children: ReactNode }) {
  return <div className="ledger-shell">{children}</div>;
}

export function LedgerHero({
  eyebrow,
  title,
  description,
  actions,
  stats
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <section className="ledger-hero">
      <div className="min-w-0">
        {eyebrow ? <div className="ledger-eyebrow">{eyebrow}</div> : null}
        <h1 className="ledger-title">{title}</h1>
        {description ? <p className="ledger-copy mt-3 max-w-3xl">{description}</p> : null}
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {stats ? <div className="ledger-stat-grid">{stats}</div> : null}
    </section>
  );
}

export function LedgerStat({ label, value, tone = "neutral" }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className={`ledger-stat ledger-stat-${tone}`}>
      <div className="ledger-stat-value metric">{value}</div>
      <div className="ledger-stat-label">{label}</div>
    </div>
  );
}

export function LedgerSection({
  title,
  kicker,
  action,
  children
}: {
  title: ReactNode;
  kicker?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ledger-section">
      <div className="ledger-section-head">
        <div className="min-w-0">
          {kicker ? <div className="ledger-eyebrow">{kicker}</div> : null}
          <h2 className="ledger-section-title">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function LedgerButton({
  href,
  children,
  variant = "primary"
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const cls = `ledger-button ledger-button-${variant}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return <span className={cls}>{children}</span>;
}

type RecipeCardData = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  sourceType: string;
  prepTime?: number | null;
  cookTime?: number | null;
  servings?: number | null;
  source?: { name: string } | null;
  nutrition?: {
    calories?: number | null;
    protein?: number | null;
    fat?: number | null;
    carbs?: number | null;
    fiber?: number | null;
  } | null;
  tags?: { tag: { id: string; name: string } }[];
};

export function PantryMacros({ recipe, dense = false }: { recipe: RecipeCardData; dense?: boolean }) {
  return (
    <div className={`pantry-macros${dense ? " pantry-macros-dense" : ""}`}>
      <div className="pantry-macro pantry-macro-cal">
        <span className="metric">{macro(recipe.nutrition?.calories, "")}</span>
        <span>cal</span>
      </div>
      <div className="pantry-macro">
        <span className="metric">{macro(recipe.nutrition?.protein)}</span>
        <span>protein</span>
      </div>
      <div className="pantry-macro">
        <span className="metric">{macro(recipe.nutrition?.fat)}</span>
        <span>fat</span>
      </div>
      <div className="pantry-macro">
        <span className="metric">{macro(recipe.nutrition?.carbs)}</span>
        <span>carbs</span>
      </div>
    </div>
  );
}

export function PantryRecipeCard({ recipe, priority = false }: { recipe: RecipeCardData; priority?: boolean }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className={`pantry-card group${priority ? " pantry-card-featured" : ""}`}>
      <div className="pantry-photo">
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="ledger-placeholder h-full">Recipe photo</div>
        )}
        <span className="pantry-source">{recipe.source?.name || titleCase(recipe.sourceType)}</span>
        <span className="pantry-save-mark" aria-hidden="true">♡</span>
      </div>
      <div className="pantry-card-body">
        <h2 className="pantry-card-title">{recipe.title}</h2>
        <div className="pantry-meta">
          <span>{minutes(recipe.prepTime || recipe.cookTime)}</span>
          <span>{recipe.servings ? `${recipe.servings} servings` : "servings -"}</span>
          {recipe.nutrition ? <span className="text-herb">nutrition</span> : null}
        </div>
        <PantryMacros recipe={recipe} />
        {recipe.tags?.length ? (
          <div className="pantry-tag-row">
            {recipe.tags.slice(0, 4).map(({ tag }) => (
              <span key={tag.id} className="pantry-chip">
                {titleCase(tag.name)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function PantryRecipeRow({ recipe }: { recipe: RecipeCardData }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="pantry-row group">
      <div className="pantry-row-photo">
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="ledger-placeholder h-full">Recipe</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="pantry-row-source">{recipe.source?.name || titleCase(recipe.sourceType)}</div>
        <div className="pantry-row-title">{recipe.title}</div>
        <div className="pantry-meta mt-1">
          <span>{minutes(recipe.prepTime || recipe.cookTime)}</span>
          <span>{recipe.servings ? `${recipe.servings} serv` : "serv -"}</span>
        </div>
        <PantryMacros recipe={recipe} dense />
      </div>
    </Link>
  );
}
