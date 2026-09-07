import Link from "next/link";
import { RecipeStatus } from "@prisma/client";
import { getApprovalSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { saveApprovalSettings } from "@/lib/actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();

  const [settings, tags, pendingCount, sourceCount] = await Promise.all([
    getApprovalSettings(),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.recipe.count({ where: { status: RecipeStatus.pending } }),
    prisma.scrapeSource.count()
  ]);

  return (
    <div className="pantry-app space-y-4">
      <section className="pantry-topbar">
        <div>
          <h1 className="pantry-title">Settings</h1>
          <p className="pantry-subtitle">Feed preferences, approval thresholds, sources, and admin links.</p>
        </div>
      </section>

      <div className="pantry-settings-grid">
        <section className="pantry-panel">
          <div className="pantry-section-title">
            <span>Feed preferences</span>
            <span>browse</span>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">⇅</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Default feed sort</div>
              <div className="pantry-setting-subtitle">Newest first on Home, with quick protein and fiber shortcuts.</div>
            </div>
            <Link href="/?sort=date" className="text-sm font-extrabold text-herb">Open</Link>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">⌕</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Search and filters</div>
              <div className="pantry-setting-subtitle">Macro, tag, and full-text controls moved out of the feed hero.</div>
            </div>
            <Link href="/search" className="text-sm font-extrabold text-herb">Search</Link>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">♡</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Saved shelf</div>
              <div className="pantry-setting-subtitle">Derived from approved recipes with photos and nutrition until favorites persist.</div>
            </div>
            <Link href="/saved" className="text-sm font-extrabold text-herb">Saved</Link>
          </div>
        </section>

        <section className="pantry-panel">
          <div className="pantry-section-title">
            <span>Admin</span>
            <span>tools</span>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">✓</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Review queue</div>
              <div className="pantry-setting-subtitle">{pendingCount} pending recipes need approval or nutrition cleanup.</div>
            </div>
            <Link href="/review" className="text-sm font-extrabold text-herb">Review</Link>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">RSS</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Recipe sources</div>
              <div className="pantry-setting-subtitle">{sourceCount} configured feeds and recipe sites.</div>
            </div>
            <Link href="/sources" className="text-sm font-extrabold text-herb">Sources</Link>
          </div>
          <div className="pantry-setting-row">
            <div className="pantry-setting-icon">↗</div>
            <div className="min-w-0 flex-1">
              <div className="pantry-setting-title">Public embed</div>
              <div className="pantry-setting-subtitle">Small recipe card feed for iframe surfaces.</div>
            </div>
            <Link href="/embed?limit=4" className="text-sm font-extrabold text-herb">Embed</Link>
          </div>
        </section>
      </div>

      <section className="pantry-panel">
        <div className="pantry-section-title">
          <span>Auto approval</span>
          <span>thresholds</span>
        </div>
        <form action={saveApprovalSettings} className="grid gap-4 sm:grid-cols-2">
          <label className="ledger-label">
            Protein threshold, grams
            <input className="ledger-input mt-1 text-sm normal-case tracking-normal" name="protein_g" type="number" min="0" step="1" defaultValue={settings.protein_g} />
          </label>
          <label className="ledger-label">
            Fiber threshold, grams
            <input className="ledger-input mt-1 text-sm normal-case tracking-normal" name="fiber_g" type="number" min="0" step="1" defaultValue={settings.fiber_g} />
          </label>
          <button className="ledger-button ledger-button-primary sm:col-span-2">Save thresholds</button>
        </form>
      </section>

      <section className="pantry-panel">
        <div className="pantry-section-title">
          <span>Tags</span>
          <span>{tags.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag.id} className="pantry-chip">
              {tag.name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
