import { ForestPageLayout } from "@/components/ForestPageLayout";
import { importMarkdownAction } from "@/lib/actions/import-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { canUseOwnerTools } from "@/lib/permissions";
import type { Route } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requireVerifiedUser();
  const canAuditObsidianVault = canUseOwnerTools(user);

  return (
    <ForestPageLayout
      title="Import Markdown"
      eyebrow="Data tools"
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description="Paste an Obsidian-style Markdown note with optional frontmatter. Wikilinks and LaTeX are preserved."
      workspaceClassName="forest-page-workspace-narrow"
    >
      <form action={importMarkdownAction} className="panel grid gap-4 p-5">
        {canAuditObsidianVault && (
          <div className="rounded-md border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Obsidian migration lab</p>
                <p className="muted">Owner-only local audit for large private vaults.</p>
              </div>
              <Link href={"/import/obsidian" as Route} className="button secondary">
                Open
              </Link>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Import as</span>
            <select name="importType" defaultValue="problem">
              <option value="problem">Problem</option>
              <option value="concept">Concept</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Override title</span>
            <input name="title" placeholder="Optional" />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Markdown</span>
          <textarea
            name="markdown"
            required
            defaultValue={`---\ntype: "problem"\ntitle: "Imported Roots Problem"\ntags: ["polynomials", "roots"]\ndifficulty: 55\norigin: "Unknown"\noriginChapter: ""\noriginPage: ""\noriginNote: ""\n---\n\nLet $P$ be a [[polynomial]] with nonzero roots.\n\nFind a relation involving the inverse roots.`}
          />
        </label>

        <button type="submit">Import</button>
      </form>
    </ForestPageLayout>
  );
}
