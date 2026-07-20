import { notFound } from "next/navigation";
import { QualityStatus, SourceType } from "@prisma/client";
import Link from "next/link";
import { DeleteProblemButton } from "@/components/DeleteProblemButton";
import { FieldHelp } from "@/components/FieldHelp";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDifficultyField } from "@/components/ProblemDifficultyField";
import { ProblemDetailsDisclosure } from "@/components/ProblemDetailsDisclosure";
import { ProblemConcurrentEditForm } from "@/components/ProblemConcurrentEditForm";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { ProblemRelationPicker } from "@/components/ProblemRelationPicker";
import { ProblemVerificationFields } from "@/components/ProblemVerificationFields";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import {
  createProblemHintAction,
  deleteProblemAction,
  deleteProblemHintAction,
  updateProblemAction,
  updateProblemHintAction
} from "@/lib/actions/problem-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROBLEM_DOMAINS, translatedDomainOptions } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { canDeleteProblem, canEditProblem, canSetProblemQualityStatus, canUseAdminTools } from "@/lib/permissions";
import { VERIFICATION_MODE_LABELS } from "@/lib/problem-verification";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireVerifiedUser();
  const t = await getTranslations();
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: true } },
      spoilerTags: { include: { tag: true } },
      domains: { orderBy: { position: "asc" } },
      hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      translatedFromProblem: {
        select: { id: true, slug: true, title: true, language: true, bodyMarkdown: true }
      },
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
  const canManageProblemHints = canUseAdminTools(user);
  const canManageFrontPageEligibility = canUseAdminTools(user);
  const canSetCurrentQualityStatus = canSetProblemQualityStatus(user.role, problem.qualityStatus);
  const canSetUnreviewedStatus = canSetProblemQualityStatus(user.role, QualityStatus.UNREVIEWED);
  const canSetNeedsWorkStatus = canSetProblemQualityStatus(user.role, QualityStatus.NEEDS_WORK);
  const canSetGoodStatus = canSetProblemQualityStatus(user.role, QualityStatus.GOOD);
  const canSetExcellentStatus = canSetProblemQualityStatus(user.role, QualityStatus.EXCELLENT);
  if (problem.status === "ARCHIVED" && !canEditArchivedProblem) notFound();
  const [siblingTranslations, sourceRevision] = await Promise.all([
    prisma.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        id: { not: problem.id }
      },
      select: { language: true }
    }),
    problem.translatedFromProblemId
      ? prisma.pageRevision.findFirst({
          where: { pageType: SourceType.PROBLEM, pageId: problem.translatedFromProblemId },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      : null
  ]);
  const staleTranslation = Boolean(
    sourceRevision && problem.translatedFromRevisionId && sourceRevision.id > problem.translatedFromRevisionId
  );

  return (
    <ForestPageLayout
      title="Edit problem"
      eyebrow={problem.title}
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description="Changes create a revision and refresh wikilinks automatically."
      workspaceClassName={problem.translatedFromProblem ? undefined : "forest-page-workspace-narrow"}
      actions={
        <>
          <Link href={`/problems/${problem.slug}`} className="button secondary">
            View problem
          </Link>
          <Link href={`/problems/${problem.slug}/history`} className="button secondary">
            History
          </Link>
        </>
      }
    >
      <div className={problem.translatedFromProblem ? "translation-compose-page" : ""}>
        <div className="translation-compose-main">
          <ProblemConcurrentEditForm
            action={updateProblemAction.bind(null, problem.id)}
            baseVersion={problem.version}
            latestHref={`/problems/${problem.slug}`}
            historyHref={`/problems/${problem.slug}/history`}
          >
            <section className="problem-compose-card">
              <div className="problem-compose-section-title">Essential information</div>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Title</span>
                <input name="title" defaultValue={problem.title} />
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-medium">Statement</span>
                <MarkdownEditor
                  name="bodyMarkdown"
                  initialValue={problem.bodyMarkdown}
                  draftKey={`problem:${problem.id}:statement`}
                  resetSignal={problem.version}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
                <LanguageField
                  defaultValue={problem.language}
                  disabledValues={siblingTranslations.map((translation) => translation.language)}
                  help="Changing this moves the page inside the same translation group."
                />
                <ProblemDifficultyField
                  defaultValue={problem.difficulty}
                  help="A rough 1-100 estimate used for browsing and recommendations."
                />
              </div>
              <ProblemDomainPicker
                domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
                initialValues={problem.domains.length ? problem.domains.map((item) => item.mscCode) : [problem.domain]}
                initialSpoilers={problem.domains.filter((item) => item.spoiler).map((item) => item.mscCode)}
              />
            </section>

            <div className="problem-compose-actions">
              <button type="submit">Save changes</button>
              <ProblemDetailsDisclosure>
                  <section className="problem-compose-subsection">
                    <h2>Origin</h2>
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        Approximate origin
                        <FieldHelp text="Where the problem comes from, if known. Unknown is fine." />
                      </span>
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
                      <span className="field-label-with-help text-sm font-medium">
                        Provenance note
                        <FieldHelp text="Add uncertainty, publication details, or context about the source." />
                      </span>
                      <textarea className="compact-textarea" name="originNote" defaultValue={problem.originNote ?? ""} />
                    </label>
                  </section>

                  <section className="problem-compose-subsection">
                    <h2>Tags</h2>
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        Tags
                        <FieldHelp text="Comma-separated visible tags for search and browsing." />
                      </span>
                      <input
                        name="tags"
                        defaultValue={problem.tags
                          .filter(({ tag }) => tag.slug !== "conjecture")
                          .map(({ tag }) => tag.name)
                          .join(", ")}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        Spoiler tags
                        <FieldHelp text="Tags hidden until the problem is solved." />
                      </span>
                      <input
                        name="spoilerTags"
                        defaultValue={problem.spoilerTags.map(({ tag }) => tag.name).join(", ")}
                        placeholder="Vieta, induction, Cauchy-Schwarz"
                      />
                    </label>
                    <label className="checkbox-field">
                      <input name="conjecture" type="checkbox" defaultChecked={isConjecture} />
                      <span>
                        <strong>Conjecture</strong>
                      </span>
                    </label>
                  </section>

                  <section className="problem-compose-subsection">
                    <h2>Publishing options</h2>
                    <label className="checkbox-field">
                      <input name="listed" type="checkbox" defaultChecked={problem.listed} />
                      <span>
                        <strong>Listed in the problem browser</strong>
                      </span>
                    </label>
                    {canManageFrontPageEligibility && (
                      <label className="checkbox-field">
                        <input name="canAppearOnFrontPage" type="checkbox" defaultChecked={problem.canAppearOnFrontPage} />
                        <span>
                          <strong>Can appear on the front page</strong>
                        </span>
                      </label>
                    )}
                    {canSetCurrentQualityStatus && (
                      <label className="grid gap-2">
                        <span className="field-label-with-help text-sm font-medium">
                          Status
                          <FieldHelp text="Moderation quality state used by trusted users and admins." />
                        </span>
                        <select name="qualityStatus" defaultValue={problem.qualityStatus}>
                          {canSetUnreviewedStatus && <option value="UNREVIEWED">Unreviewed (default)</option>}
                          {canSetNeedsWorkStatus && <option value="NEEDS_WORK">Needs work</option>}
                          {canSetGoodStatus && <option value="GOOD">Good</option>}
                          {canSetExcellentStatus && <option value="EXCELLENT">Excellent</option>}
                        </select>
                      </label>
                    )}
                    {problem.translatedFromProblem && (
                      <label className="checkbox-field">
                        <input name="markTranslationFresh" type="checkbox" defaultChecked={false} />
                        <span>
                          <strong>Mark translation up to date</strong>
                        </span>
                      </label>
                    )}
                    <ProblemVerificationFields
                      initialMode={problem.verificationMode}
                      initialPrompt={problem.verificationPrompt ?? ""}
                      initialAnswer={problem.verificationAnswer ?? ""}
                      modeOptions={Object.entries(VERIFICATION_MODE_LABELS)}
                    />
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        Edit summary
                        <FieldHelp text="A short note shown in history and notifications." />
                      </span>
                      <input name="editSummary" placeholder="Clarified statement, fixed notation..." />
                    </label>
                  </section>

                  <section className="problem-compose-subsection">
                    <h2>Related problems</h2>
                    <ProblemRelationPicker
                      excludeSlug={problem.slug}
                      initialGroups={problem.relatedGroups.map((group) => ({
                        title: group.title,
                        problems: group.relations.map(({ targetProblem }) => targetProblem)
                      }))}
                    />
                  </section>
              </ProblemDetailsDisclosure>
            </div>
          </ProblemConcurrentEditForm>

          {canManageProblemHints && (
            <section className="problem-hint-admin panel mt-6 grid gap-5 p-5">
              <div>
                <h2 className="text-lg font-semibold">Hints before solutions</h2>
              </div>

              {problem.hints.length > 0 && (
                <div className="grid gap-4">
                  {problem.hints.map((hint, index) => (
                    <article key={hint.id} className="problem-hint-admin-card">
                      <form action={updateProblemHintAction.bind(null, hint.id, problem.slug)} className="grid gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="grid gap-2">
                            <span className="text-sm font-medium">Hint {index + 1} order</span>
                            <input name="position" type="number" defaultValue={hint.position} />
                          </label>
                        </div>
                        <div className="grid gap-2">
                          <span className="text-sm font-medium">Hint Markdown</span>
                          <MarkdownEditor
                            name="bodyMarkdown"
                            initialValue={hint.bodyMarkdown}
                            minHeight="8rem"
                            draftKey={`problem:${problem.id}:hint:${hint.id}`}
                          />
                        </div>
                        <button type="submit">Save hint</button>
                      </form>
                      <form action={deleteProblemHintAction.bind(null, hint.id, problem.slug)}>
                        <button type="submit" className="danger">
                          Delete hint
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              )}

              <form action={createProblemHintAction.bind(null, problem.id, problem.slug)} className="problem-hint-admin-card grid gap-3">
                <h3 className="font-semibold">Add hint</h3>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Hint Markdown</span>
                  <MarkdownEditor
                    name="bodyMarkdown"
                    minHeight="8rem"
                    draftKey={`problem:${problem.id}:new-hint`}
                    resetSignal={problem.hints.length}
                  />
                </div>
                <button type="submit" className="secondary">
                  Add hint
                </button>
              </form>
            </section>
          )}

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
        {problem.translatedFromProblem && (
          <TranslationReferencePanel
            basedOnRevisionId={problem.translatedFromRevisionId}
            href={`/problems/${problem.translatedFromProblem.slug}`}
            idPrefix={`problem-${problem.id}-translation-source`}
            latestRevisionId={sourceRevision?.id ?? null}
            markdown={problem.translatedFromProblem.bodyMarkdown}
            language={problem.translatedFromProblem.language}
            stale={staleTranslation}
            title={problem.translatedFromProblem.title}
          />
        )}
      </div>
    </ForestPageLayout>
  );
}
