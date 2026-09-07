import Link from "next/link";
import { RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PantryRecipeRow } from "@/components/ledger";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  await requireUser();

  const recipes = await prisma.recipe.findMany({
    where: {
      status: RecipeStatus.approved,
      imageUrl: { not: null },
      nutrition: { isNot: null }
    },
    include: { nutrition: true, tags: { include: { tag: true } }, source: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 50
  });

  return (
    <div className="pantry-app space-y-4">
      <section className="pantry-topbar">
        <div>
          <h1 className="pantry-title">Saved</h1>
          <p className="pantry-subtitle">
            {recipes.length ? `${recipes.length} curated recipes from the approved library` : "No saved-style recipes are ready yet"}
          </p>
        </div>
        <Link href="/search" className="pantry-icon-button" aria-label="Filter saved recipes">⌕</Link>
      </section>

      <div className="pantry-panel flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-herb text-sm font-extrabold text-white metric">
          {recipes.length}
        </div>
        <div>
          <div className="font-extrabold">Derived saved shelf</div>
          <p className="text-sm text-ink/55">
            Real favorites are not stored yet, so this tab acts as a saved destination using approved recipes with photos and nutrition.
          </p>
        </div>
      </div>

      <nav className="pantry-chips" aria-label="Saved filters">
        <span className="pantry-chip pantry-chip-active">All · {recipes.length}</span>
        <Link href="/?sort=protein" className="pantry-chip">Hi-protein</Link>
        <Link href="/?sort=fiber" className="pantry-chip">Fiber</Link>
        <Link href="/search" className="pantry-chip">Search library</Link>
      </nav>

      <section className="space-y-2">
        <div className="pantry-section-title">
          <span>Saved recipes</span>
          <span>latest</span>
        </div>
        {recipes.map((recipe) => (
          <PantryRecipeRow key={recipe.id} recipe={recipe} />
        ))}
      </section>

      {recipes.length === 0 ? (
        <section className="pantry-panel text-center">
          <h2 className="text-2xl font-extrabold">Nothing on the shelf</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink/60">
            Approve recipes with images and nutrition, then they will appear here until a persistent favorites model is added.
          </p>
          <Link href="/review" className="ledger-button ledger-button-primary mt-4">Open review</Link>
        </section>
      ) : null}
    </div>
  );
}
