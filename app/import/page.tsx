import { importMarkdownAction } from "@/lib/actions/import-actions";
import { requireVerifiedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireVerifiedUser();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Import Markdown</h1>
      <p className="muted mb-5">
        Paste an Obsidian-style Markdown note with optional frontmatter. Wikilinks and LaTeX are preserved.
      </p>

      <form action={importMarkdownAction} className="panel grid gap-4 p-5">
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
    </div>
  );
}
