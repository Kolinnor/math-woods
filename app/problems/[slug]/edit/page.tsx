import { notFound } from "next/navigation";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { updateProblemAction } from "@/lib/actions/problem-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MATH_DOMAINS } from "@/lib/domains";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: { tags: { include: { tag: true } } }
  });

  if (!problem) notFound();
  const isConjecture = problem.tags.some(({ tag }) => tag.slug === "conjecture");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Edit problem</h1>
      <p className="muted mb-5">Changes create a revision and refresh wikilinks automatically.</p>

      <form action={updateProblemAction.bind(null, problem.id)} className="panel grid gap-4 p-5">
        <input type="hidden" name="license" value={problem.license} />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={problem.title} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Statement</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={problem.bodyMarkdown} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Domain</span>
            <select name="domain" defaultValue={problem.domain}>
              {MATH_DOMAINS.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Difficulty (1–100)</span>
            <input name="difficulty" type="number" min="1" max="100" defaultValue={problem.difficulty ?? ""} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Status</span>
            <select name="qualityStatus" defaultValue={problem.qualityStatus}>
              <option value="UNREVIEWED">Unreviewed (default)</option>
              <option value="NEEDS_WORK">Needs work</option>
              {(user.role === "MODERATOR" || user.role === "ADMIN") && <option value="GOOD">Good</option>}
              {(user.role === "MODERATOR" || user.role === "ADMIN") && <option value="EXCELLENT">Excellent</option>}
            </select>
          </label>
        </div>
        <fieldset className="origin-fields grid gap-4">
          <legend className="font-semibold">Problem origin</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Approximate origin</span>
            <input name="origin" defaultValue={problem.origin} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Chapter or section</span>
              <input name="originChapter" defaultValue={problem.originChapter ?? ""} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Page or problem number</span>
              <input name="originPage" defaultValue={problem.originPage ?? ""} />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Provenance note</span>
            <textarea
              className="compact-textarea"
              name="originNote"
              defaultValue={problem.originNote ?? ""}
              placeholder="It seems this problem first appeared in..."
            />
          </label>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Tags</span>
          <input
            name="tags"
            defaultValue={problem.tags.filter(({ tag }) => tag.slug !== "conjecture").map(({ tag }) => tag.name).join(", ")}
          />
        </label>
        <label className="checkbox-field">
          <input name="listed" type="checkbox" defaultChecked={problem.listed} />
          <span>
            <strong>Listed in the public problem index</strong>
            <small>
              Keep this on for reusable problems. Turn it off for steps that only make sense inside a playlist.
            </small>
          </span>
        </label>
        <label className="checkbox-field">
          <input name="conjecture" type="checkbox" defaultChecked={isConjecture} />
          <span>
            <strong>Conjecture</strong>
            <small>No proof is currently known or supplied.</small>
          </span>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Edit summary</span>
          <input name="editSummary" placeholder="Clarified statement, fixed notation..." />
        </label>
        <button type="submit">Save changes</button>
      </form>
    </div>
  );
}
