import Link from "next/link";
import { Prisma, RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PantryRecipeRow } from "@/components/ledger";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    q?: string;
    protein?: string;
    fiber?: string;
    tag?: string;
    sort?: string;
  }>;
};

function sortFor(value?: string) {
  if (value === "protein") return { nutrition: { protein: "desc" as const } };
  if (value === "fiber") return { nutrition: { fiber: "desc" as const } };
  if (value === "calories") return { nutrition: { calories: "asc" as const } };
  return { createdAt: "desc" as const };
}

export default async function SearchPage({ searchParams: rawSearchParams }: Props) {
  const searchParams = await rawSearchParams;
  await requireUser();

  const query = searchParams?.q?.trim() || "";
  const minProtein = Number(searchParams?.protein || 0);
  const minFiber = Number(searchParams?.fiber || 0);
  const tag = searchParams?.tag || "";
  const hasFilters = Boolean(query || minProtein || minFiber || tag || searchParams?.sort);

  const where: Prisma.RecipeWhereInput = {
    status: RecipeStatus.approved,
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { sourceUrl: { contains: query, mode: "insensitive" } },
            { source: { is: { name: { contains: query, mode: "insensitive" } } } },
            { tags: { some: { tag: { name: { contains: query, mode: "insensitive" } } } } },
            { ingredients: { string_contains: query } },
            { instructions: { string_contains: query } }
          ]
        }
      : {}),
    nutrition: {
      ...(minProtein ? { protein: { gte: minProtein } } : {}),
      ...(minFiber ? { fiber: { gte: minFiber } } : {})
    }
  };

  const [recipes, tags] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: { nutrition: true, tags: { include: { tag: true } }, source: true },
      orderBy: sortFor(searchParams?.sort),
      take: 80
    }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, take: 48 })
  ]);

  return (
    <div className="pantry-app space-y-4">
      <section className="pantry-topbar">
        <div>
          <h1 className="pantry-title">Search</h1>
          <p className="pantry-subtitle">Find recipes by title, source, tag, ingredients, macros, or instructions.</p>
        </div>
      </section>

      <form className="space-y-3">
        <label className="pantry-search">
          <span aria-hidden="true">⌕</span>
          <input name="q" type="search" placeholder="harissa, eggplant, quick..." defaultValue={query} />
        </label>
        <div className="grid gap-2 rounded-[var(--pantry-radius)] bg-white/70 p-3 sm:grid-cols-4">
          <label className="ledger-label">
            Protein
            <input className="ledger-input mt-1 text-sm normal-case tracking-normal" name="protein" type="number" min="0" placeholder="30" defaultValue={searchParams?.protein} />
          </label>
          <label className="ledger-label">
            Fiber
            <input className="ledger-input mt-1 text-sm normal-case tracking-normal" name="fiber" type="number" min="0" placeholder="8" defaultValue={searchParams?.fiber} />
          </label>
          <label className="ledger-label">
            Tag
            <select className="ledger-select mt-1 text-sm normal-case tracking-normal" name="tag" defaultValue={tag}>
              <option value="">Any tag</option>
              {tags.map((item) => (
                <option key={item.id} value={item.name}>{titleCase(item.name)}</option>
              ))}
            </select>
          </label>
          <label className="ledger-label">
            Sort
            <select className="ledger-select mt-1 text-sm normal-case tracking-normal" name="sort" defaultValue={searchParams?.sort || "date"}>
              <option value="date">Newest</option>
              <option value="protein">Protein</option>
              <option value="fiber">Fiber</option>
              <option value="calories">Calories</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button className="ledger-button ledger-button-primary">Search recipes</button>
          {hasFilters ? <Link href="/search" className="ledger-button ledger-button-secondary">Clear</Link> : null}
        </div>
      </form>

      <nav className="pantry-chips" aria-label="Quick search filters">
        <Link href="/search?sort=protein" className="pantry-chip">Hi-protein</Link>
        <Link href="/search?sort=fiber" className="pantry-chip">Fiber</Link>
        <Link href="/search?protein=30" className="pantry-chip">30g protein</Link>
        <Link href="/saved" className="pantry-chip">Saved shelf</Link>
      </nav>

      <section className="space-y-2">
        <div className="pantry-section-title">
          <span>{hasFilters ? "Results" : "Latest recipes"}</span>
          <span>{recipes.length}</span>
        </div>
        {recipes.map((recipe) => (
          <PantryRecipeRow key={recipe.id} recipe={recipe} />
        ))}
      </section>

      {recipes.length === 0 ? (
        <section className="pantry-panel text-center">
          <h2 className="text-2xl font-extrabold">No recipes match</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink/60">
            Try a broader ingredient, remove a macro threshold, or clear the tag filter.
          </p>
        </section>
      ) : null}
    </div>
  );
}
