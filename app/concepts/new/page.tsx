import { createConceptAction } from "@/lib/actions/concept-actions";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { MATH_DOMAINS } from "@/lib/domains";

export default async function NewConceptPage({
  searchParams
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const { title = "" } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">New concept</h1>
      <p className="muted mb-5">
        A stub can be useful: name the idea, add a link, cite one source.
      </p>

      <form action={createConceptAction} className="panel grid gap-4 p-5">
        <div className="growth-note">
          <strong>Start small.</strong>
          <span>
            A definition, one example, or one reliable reference is enough for a first version.
          </span>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={title} placeholder="Vieta Relations" />
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
            <span className="text-sm font-medium">Aliases</span>
            <input name="aliases" placeholder="Vieta's formulas, Viète relations" />
          </label>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Content</span>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={
              "## Intuitive definition\n\nTo be completed.\n\n## Formal definition\n\nTo be completed with LaTeX.\n\n## Examples\n\n- Example linked to [[polynomial]]."
            }
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">References</span>
          <textarea
            name="references"
            placeholder={"Reference title | https://example.org/source | Optional note\nBook title | | Chapter 3"}
          />
        </label>
        <button type="submit">Create concept</button>
      </form>
    </div>
  );
}
