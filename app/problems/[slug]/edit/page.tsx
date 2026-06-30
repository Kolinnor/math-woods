import { notFound } from "next/navigation";
import { QualityStatus } from "@prisma/client";
import Link from "next/link";
import { DeleteProblemButton } from "@/components/DeleteProblemButton";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { ProblemRelationPicker } from "@/components/ProblemRelationPicker";
import { deleteProblemAction, updateProblemAction } from "@/lib/actions/problem-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROBLEM_DOMAINS } from "@/lib/domains";
import { canDeleteProblem, canEditProblem, canSetProblemQualityStatus } from "@/lib/permissions";
import { VERIFICATION_MODE_LABELS } from "@/lib/problem-verification";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: true } },
      spoilerTags: { include: { tag: true } },
      domains: { orderBy: { position: "asc" } },
      relatedGroups: {
        include: {
          relations: {
            include: {
              targetProblem: {
                select: { title: true, slug: true, difficulty: true, listed: true, language: true }
              }
            },
            orderBy: { position: "asc" }
          }
        },
        orderBy: { position: "asc" }
      }
    }
  });

  if (!problem) notFound();
  const isConjecture = problem.tags.some(({ tag }) => tag.slug === "conjecture");
  const canEditArchivedProblem = canEditProblem(user, problem);
  const canDeleteCurrentProblem = canDeleteProblem(user, problem);
  const canSetCurrentQualityStatus = canSetProblemQualityStatus(user.role, problem.qualityStatus);
  const canSetUnreviewedStatus = canSetProblemQualityStatus(user.role, QualityStatus.UNREVIEWED);
  const canSetNeedsWorkStatus = canSetProblemQualityStatus(user.role, QualityStatus.NEEDS_WORK);
  const canSetGoodStatus = canSetProblemQualityStatus(user.role, QualityStatus.GOOD);
  const canSetExcellentStatus = canSetProblemQualityStatus(user.role, QualityStatus.EXCELLENT);
  if (problem.status === "ARCHIVED" && !canEditArchivedProblem) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-2xl font-bold">Edit problem</h1>
          <p className="muted">Changes create a revision and refresh wikilinks automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/problems/${problem.slug}`} className="button secondary">
            View problem
          </Link>
          <Link href={`/problems/${problem.slug}/history`} className="button secondary">
            History
          </Link>
        </div>
      </div>

      <form action={updateProblemAction.bind(null, problem.id)} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={problem.title} />
        </label>
        <LanguageField
          defaultValue={problem.language}
          help="Changing this moves the page to another language inside the same translation group."
        />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Statement</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={problem.bodyMarkdown} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProblemDomainPicker
            domains={PROBLEM_DOMAINS}
            initialValues={problem.domains.length ? problem.domains.map((item) => item.mscCode) : [problem.domain]}
            initialSpoilers={problem.domains.filter((item) => item.spoiler).map((item) => item.mscCode)}
          />
          <label className="problem-difficulty-field grid gap-2">
            <span className="text-sm font-medium">Difficulty (1–100)</span>
            <input name="difficulty" type="number" min="1" max="100" defaultValue={problem.difficulty ?? ""} />
          </label>
          {canSetCurrentQualityStatus && (
            <label className="grid gap-2">
              <span className="text-sm font-medium">Status</span>
              <select name="qualityStatus" defaultValue={problem.qualityStatus}>
                {canSetUnreviewedStatus && <option value="UNREVIEWED">Unreviewed (default)</option>}
                {canSetNeedsWorkStatus && <option value="NEEDS_WORK">Needs work</option>}
                {canSetGoodStatus && <option value="GOOD">Good</option>}
                {canSetExcellentStatus && <option value="EXCELLENT">Excellent</option>}
              </select>
            </label>
          )}
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
        <label className="grid gap-2">
          <span className="text-sm font-medium">Spoiler tags</span>
          <input
            name="spoilerTags"
            defaultValue={problem.spoilerTags.map(({ tag }) => tag.name).join(", ")}
            placeholder="Vieta, induction, Cauchy-Schwarz"
          />
          <small className="muted">
            Hidden until a user marks the problem solved. They can still be searched from the problem browser.
          </small>
        </label>
        <label className="checkbox-field">
          <input name="listed" type="checkbox" defaultChecked={problem.listed} />
          <span>
            <strong>Listed in the problem browser</strong>
            <small>
              Keep this on for problems that are reusable on their own. Turn it off for local steps or variations tied to a playlist or another problem.
            </small>
          </span>
        </label>
        <label className="checkbox-field">
          <input name="conjecture" type="checkbox" defaultChecked={isConjecture} />
          <span>
            <strong>Conjecture</strong>
            <small>No solution is currently known or supplied.</small>
          </span>
        </label>
        <ProblemRelationPicker
          excludeSlug={problem.slug}
          initialGroups={problem.relatedGroups.map((group) => ({
            title: group.title,
            problems: group.relations.map(({ targetProblem }) => targetProblem)
          }))}
        />
        <fieldset className="origin-fields grid gap-4">
          <legend className="font-semibold">Solve verification</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Verification mode</span>
            <select name="verificationMode" defaultValue={problem.verificationMode}>
              {Object.entries(VERIFICATION_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Verification question</span>
            <input
              name="verificationPrompt"
              defaultValue={problem.verificationPrompt ?? ""}
              placeholder="For example: What is the last letter of the answer?"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Expected short answer</span>
            <input
              name="verificationAnswer"
              defaultValue={problem.verificationAnswer ?? ""}
              placeholder="Used only for short answer check"
            />
          </label>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Edit summary</span>
          <input name="editSummary" placeholder="Clarified statement, fixed notation..." />
        </label>
        <button type="submit">Save changes</button>
      </form>

      {canDeleteCurrentProblem && (
        <section className="danger-zone mt-6">
          <div>
            <h2>Delete problem</h2>
            <p>This archives the problem and removes it from public problem lists and concept backlinks.</p>
          </div>
          <form action={deleteProblemAction.bind(null, problem.id)}>
            <DeleteProblemButton title={problem.title} />
          </form>
        </section>
      )}
    </div>
  );
}
