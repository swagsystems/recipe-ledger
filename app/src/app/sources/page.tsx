import { prisma } from "@/lib/prisma";
import { dateTime, titleCase } from "@/lib/format";
import { saveSource } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { LedgerHero, LedgerSection, LedgerStat } from "@/components/ledger";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  await requireUser();

  const sources = await prisma.scrapeSource.findMany({
    include: { _count: { select: { recipes: true } } },
    orderBy: [{ enabled: "desc" }, { name: "asc" }]
  });

  return (
    <div className="space-y-5">
      <LedgerHero
        eyebrow="RSS sources"
        title="Sources"
        description="Manage RSS feeds and recipe sites used by the 2am scraper."
        stats={
          <>
            <LedgerStat label="sources" value={sources.length} tone="green" />
            <LedgerStat label="enabled" value={sources.filter((source) => source.enabled).length} />
            <LedgerStat label="paused" value={sources.filter((source) => !source.enabled).length} tone="amber" />
            <LedgerStat label="recipes" value={sources.reduce((sum, source) => sum + source._count.recipes, 0)} tone="red" />
          </>
        }
      />

      <form action={saveSource} className="ledger-card grid gap-3 p-4 lg:grid-cols-[1fr_1.5fr_140px_1fr_auto]">
        <input className="ledger-input" name="name" placeholder="Display name" />
        <input className="ledger-input" name="url" placeholder="https://..." />
        <select className="ledger-select" name="type" defaultValue="rss">
          <option value="rss">RSS</option>
          <option value="blog">Blog</option>
        </select>
        <input className="ledger-input" name="defaultTags" placeholder="high-protein, meal-prep" />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="enabled" defaultChecked />
          Enabled
        </label>
        <button className="ledger-button ledger-button-primary lg:col-start-5">Add</button>
      </form>

      <LedgerSection title="Configured feeds" kicker="Scrape ledger">
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-panel text-left text-xs uppercase tracking-[0.12em] text-ink/55">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Last scrape</th>
              <th className="px-4 py-3">Recipes</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sources.map((source) => (
              <tr key={source.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold">{source.name}</div>
                  <div className="max-w-md truncate text-xs text-ink/50">{source.url}</div>
                </td>
                <td className="px-4 py-3">{titleCase(source.type)}</td>
                <td className="px-4 py-3">{source.defaultTags.join(", ") || "-"}</td>
                <td className="px-4 py-3">{dateTime(source.lastScrapedAt)}</td>
                <td className="metric px-4 py-3">{source._count.recipes}</td>
                <td className="px-4 py-3">
                  <span className={`ledger-chip ${source.enabled ? "border-herb/40 bg-herb/10 text-herb" : "border-citrus/40 bg-citrus/10 text-ink/70"}`}>
                    {source.enabled ? "Active" : "Paused"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </LedgerSection>
    </div>
  );
}
