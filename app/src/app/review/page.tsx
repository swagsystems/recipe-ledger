import Link from "next/link";
import { RecipeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { macro, titleCase } from "@/lib/format";
import { getApprovalSettings } from "@/lib/settings";
import { approveAllPendingRecipes, checkRecipeWithUsda, rejectAllPendingRecipes, setRecipeStatus } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { LedgerHero, LedgerSection, LedgerStat } from "@/components/ledger";

export const dynamic = "force-dynamic";

export default async function ReviewQueue() {
  await requireUser();

  const [recipes, settings] = await Promise.all([
    prisma.recipe.findMany({
      where: { status: RecipeStatus.pending },
      include: { nutrition: true, tags: { include: { tag: true } }, source: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    getApprovalSettings()
  ]);

  return (
    <div className="space-y-5">
      <LedgerHero
        eyebrow="Approval queue"
        title="Review queue"
        description={`${recipes.length} pending recipes missed ${settings.protein_g}g protein and ${settings.fiber_g}g fiber, or need nutrition cleanup.`}
        stats={
          <>
            <LedgerStat label="pending" value={recipes.length} tone="amber" />
            <LedgerStat label="protein gate" value={`${settings.protein_g}g`} tone="green" />
            <LedgerStat label="fiber gate" value={`${settings.fiber_g}g`} />
            <LedgerStat label="batch" value="100" tone="red" />
          </>
        }
        actions={
          <>
          <form action={approveAllPendingRecipes}>
            <button className="ledger-button bg-herb text-white">Approve all pending</button>
          </form>
          <form action={rejectAllPendingRecipes}>
            <button className="ledger-button ledger-button-danger">Deny all pending</button>
          </form>
          </>
        }
      />

      <LedgerSection title="Pending recipes" kicker="Oldest controls preserved">
        <div className="space-y-3">
          {recipes.map((recipe) => (
          <article key={recipe.id} className="ledger-card grid gap-4 p-3 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <div className="ledger-eyebrow">{recipe.source?.name || titleCase(recipe.sourceType)}</div>
              <Link href={`/recipes/${recipe.id}`} className="mt-1 block text-2xl font-extrabold leading-tight hover:text-herb">
                {recipe.title}
              </Link>
              {recipe.reviewReason ? (
                <p className="mt-2 max-w-3xl border border-citrus/30 bg-citrus/10 px-3 py-2 text-sm font-medium text-ink">
                  {recipe.reviewReason}
                </p>
              ) : null}
              <p className="mt-2 max-w-3xl text-sm text-ink/65">{recipe.description || "No description available."}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[0.08em] text-ink/50">
                <a className="font-semibold text-herb hover:underline" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                  Original recipe
                </a>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {recipe.tags.map(({ tag }) => (
                  <span key={tag.id} className="ledger-chip">
                    {titleCase(tag.name)}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_132px]">
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-line bg-white px-3 py-2 text-center">
                  <div className="metric text-xl font-extrabold">{macro(recipe.nutrition?.protein)}</div>
                  <div className="ledger-stat-label">protein</div>
                </div>
                <div className="border border-line bg-white px-3 py-2 text-center">
                  <div className="metric text-xl font-extrabold">{macro(recipe.nutrition?.fiber)}</div>
                  <div className="ledger-stat-label">fiber</div>
                </div>
                <div className="border border-line bg-white px-3 py-2 text-center">
                  <div className="metric text-xl font-extrabold">{macro(recipe.nutrition?.calories, "")}</div>
                  <div className="ledger-stat-label">cal</div>
                </div>
              </div>
              <div className="flex gap-2 sm:flex-col">
                <form action={setRecipeStatus.bind(null, recipe.id, RecipeStatus.approved)}>
                  <button className="ledger-button w-full bg-herb text-white">Approve</button>
                </form>
                <form action={checkRecipeWithUsda.bind(null, recipe.id)}>
                  <button className="ledger-button ledger-button-secondary w-full">USDA check</button>
                </form>
                <form action={setRecipeStatus.bind(null, recipe.id, RecipeStatus.rejected)}>
                  <button className="ledger-button ledger-button-danger w-full">Reject</button>
                </form>
              </div>
            </div>
          </article>
          ))}
        </div>

        {recipes.length === 0 ? <div className="bg-white/60 p-8 text-center text-ink/60">No pending recipes.</div> : null}
      </LedgerSection>
    </div>
  );
}
