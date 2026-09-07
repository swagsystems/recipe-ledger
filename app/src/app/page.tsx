import Link from "next/link";
import { Prisma, RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PantryRecipeCard } from "@/components/ledger";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    protein?: string;
    fiber?: string;
    tag?: string;
    sort?: string;
    q?: string;
  }>;
};

function sortFor(value?: string) {
  if (value === "protein") return { nutrition: { protein: "desc" as const } };
  if (value === "fiber") return { nutrition: { fiber: "desc" as const } };
  if (value === "calories") return { nutrition: { calories: "asc" as const } };
  if (value === "date") return { createdAt: "desc" as const };
  return { createdAt: "desc" as const };
}

export default async function Dashboard({ searchParams: rawSearchParams }: Props) {
  const searchParams = await rawSearchParams;
  await requireUser();

  const minProtein = Number(searchParams?.protein || 0);
  const minFiber = Number(searchParams?.fiber || 0);
  const tag = searchParams?.tag;
  const query = searchParams?.q?.trim() || "";
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

  const recipes = await prisma.recipe.findMany({
    where,
    include: { nutrition: true, tags: { include: { tag: true } }, source: true },
    orderBy: sortFor(searchParams?.sort),
    take: 60
  });

  const featured = recipes[0];
  const rest = recipes.slice(1);

  return (
    <div className="pantry-app space-y-4">
      <section className="pantry-topbar">
        <div>
          <h1 className="pantry-title">Hey, <em>cook.</em></h1>
          <p className="pantry-subtitle">
            {recipes.length ? `${recipes.length} approved recipes ready to browse` : "Your approved recipe feed is waiting for imports"}
          </p>
        </div>
        <Link href="/search" className="pantry-icon-button" aria-label="Search recipes">⌕</Link>
      </section>

      <nav className="pantry-chips" aria-label="Feed shortcuts">
        <Link href="/" className={`pantry-chip ${!hasFilters ? "pantry-chip-active" : ""}`}>Today</Link>
        <Link href="/saved" className="pantry-chip">Saved</Link>
        <Link href="/?sort=protein" className={`pantry-chip ${searchParams?.sort === "protein" ? "pantry-chip-active" : ""}`}>Hi-protein</Link>
        <Link href="/?sort=fiber" className={`pantry-chip ${searchParams?.sort === "fiber" ? "pantry-chip-active" : ""}`}>Fiber</Link>
        <Link href="/search" className="pantry-chip">Filters</Link>
      </nav>

      {featured ? (
        <section className="pantry-feed-grid">
          <PantryRecipeCard recipe={featured} priority />
          {rest.map((recipe) => (
            <PantryRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </section>
      ) : (
        <section className="pantry-panel text-center">
          <h2 className="text-2xl font-extrabold">No approved recipes yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink/60">
            Once recipes pass review, this home tab becomes the image-first feed. Review pending recipes or add more sources from settings.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/review" className="ledger-button ledger-button-primary">Review queue</Link>
            <Link href="/settings" className="ledger-button ledger-button-secondary">Settings</Link>
          </div>
        </section>
      )}
    </div>
  );
}
