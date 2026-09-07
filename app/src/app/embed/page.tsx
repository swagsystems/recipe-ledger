import Link from "next/link";
import { RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { macro, minutes, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    tag?: string;
    limit?: string;
  }>;
};

export default async function EmbedPage({ searchParams: rawSearchParams }: Props) {
  const searchParams = await rawSearchParams;
  const limit = Math.min(Number(searchParams?.limit || 8), 24);
  const tag = searchParams?.tag;
  const recipes = await prisma.recipe.findMany({
    where: {
      status: RecipeStatus.approved,
      ...(tag ? { tags: { some: { tag: { name: tag } } } } : {})
    },
    include: { nutrition: true, tags: { include: { tag: true } }, source: true },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return (
    <div className="embed-surface space-y-4">
      <style>{`header,.ledger-mobile-nav{display:none}.ledger-shell{max-width:none;padding:12px}`}</style>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="ledger-eyebrow">Embedded feed</div>
          <h1 className="text-2xl font-extrabold">Recipes</h1>
          <p className="text-sm text-ink/60">{tag ? titleCase(tag) : "Latest approved"} recipes</p>
        </div>
        <Link href="/" target="_blank" className="ledger-button ledger-button-secondary">
          Open
        </Link>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {recipes.map((recipe) => (
          <Link key={recipe.id} href={`/recipes/${recipe.id}`} target="_blank" className="ledger-card overflow-hidden">
            <div className="aspect-[4/3] bg-line">
              {recipe.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="ledger-placeholder h-full">No image</div>
              )}
            </div>
            <div className="space-y-3 p-3">
              <div>
                <div className="ledger-eyebrow truncate">{recipe.source?.name || titleCase(recipe.sourceType)}</div>
                <h2 className="line-clamp-2 text-base font-extrabold leading-tight">{recipe.title}</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="border border-line bg-herb/10 px-2 py-2">
                  <div className="metric font-extrabold">{macro(recipe.nutrition?.protein)}</div>
                  <div className="ledger-stat-label">protein</div>
                </div>
                <div className="border border-line bg-citrus/10 px-2 py-2">
                  <div className="metric font-extrabold">{macro(recipe.nutrition?.fiber)}</div>
                  <div className="ledger-stat-label">fiber</div>
                </div>
                <div className="border border-line bg-panel px-2 py-2">
                  <div className="metric font-extrabold">{minutes(recipe.prepTime || recipe.cookTime)}</div>
                  <div className="ledger-stat-label">time</div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
