import { createProblemAction } from "@/lib/actions/problem-actions";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { MATH_DOMAINS } from "@/lib/domains";

export default async function NewProblemPage({
  searchParams
}: {
  searchParams: Promise<{ playlist?: string; listed?: string }>;
}) {
  const { playlist = "", listed = "1" } = await searchParams;
  const isListedByDefault = listed !== "0";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">New problem</h1>
      <p className="muted mb-5">
        A short, clear statement is enough.
      </p>

      <form action={createProblemAction} className="panel grid gap-4 p-5">
        {playlist && <input type="hidden" name="addToPlaylistSlug" value={playlist} />}
        <div className="growth-note">
          <strong>Start small.</strong>
          <span>
            Add what you know. Mark what is uncertain. Others can discuss, edit, report, or add proofs.
          </span>
        </div>
        {playlist && (
          <div className="playlist-context-note">
            <strong>Creating for a playlist.</strong>
            <span>
              This problem will be added to the playlist. Keep it listed if it can stand alone. Unlist it if it needs
              this playlist's context.
            </span>
          </div>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required placeholder="Roots and coefficients" />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Statement</span>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={
              "Let $P \\in \\mathbb{C}[X]$ be a [[polynomial]] of degree $n$, with nonzero roots.\n\nExpress the sum of the inverses of the roots in terms of the coefficients of $P$.\n\nSee also: [[Vieta relations]], [[multiple root]]."
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Domain</span>
            <select name="domain" defaultValue="OTHER">
              {MATH_DOMAINS.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Difficulty (1–100)</span>
            <input name="difficulty" type="number" min="1" max="100" placeholder="50" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Status</span>
            <select name="qualityStatus" defaultValue="UNREVIEWED">
              <option value="UNREVIEWED">Unreviewed (default)</option>
              <option value="NEEDS_WORK">Needs work</option>
            </select>
          </label>
        </div>
        <label className="checkbox-field">
          <input name="listed" type="checkbox" defaultChecked={isListedByDefault} />
          <span>
            <strong>Listed in the public problem index</strong>
            <small>
              Use this for problems that make sense outside one playlist.
            </small>
          </span>
        </label>
        <fieldset className="origin-fields grid gap-4">
          <legend className="font-semibold">Problem origin</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Approximate origin</span>
            <input name="origin" defaultValue="Unknown" placeholder="Unknown, IMO 1988, a textbook..." />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Chapter or section</span>
              <input name="originChapter" placeholder="Chapter 4, Algebra" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Page or problem number</span>
              <input name="originPage" placeholder="p. 127, Problem 6" />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Provenance note</span>
            <textarea
              className="compact-textarea"
              name="originNote"
              placeholder="It seems this problem first appeared in..."
            />
          </label>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Tags</span>
          <input name="tags" placeholder="polynomials, roots, algebra" />
        </label>
        <label className="checkbox-field">
          <input name="conjecture" type="checkbox" />
          <span>
            <strong>Conjecture</strong>
            <small>No proof is currently known or supplied.</small>
          </span>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Initial proof (optional)</span>
          <MarkdownEditor name="proofMarkdown" initialValue="" minHeight="11rem" />
        </label>
        <p className="muted text-sm">
          Make sure you can share this wording.{" "}
          <a href="/about#creating-problems" className="help-link" aria-label="Read problem creation guidance">
            ?
          </a>
        </p>
        <button type="submit">Publish</button>
      </form>
    </div>
  );
}
