import { notFound } from "next/navigation";
import { QualityStatus } from "@prisma/client";
import Link from "next/link";
import { ContentPreviewButton } from "@/components/ContentPreviewButton";
import { DeleteProblemButton } from "@/components/DeleteProblemButton";
import { FieldHelp } from "@/components/FieldHelp";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDifficultyField } from "@/components/ProblemDifficultyField";
import { ProblemContentOptions } from "@/components/ProblemContentOptions";
import { ProblemClassificationFields } from "@/components/ProblemClassificationFields";
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
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import {
  canDeleteProblem,
  canEditProblem,
  canSetProblemQualityStatus,
  canUseAdminTools
} from "@/lib/permissions";
import { canPublishProblemEditForProblem } from "@/lib/problem-edit-access";
import { renderInlineMarkdown } from "@/lib/markdown";
import { latestProblemTextRevisionId } from "@/lib/translation-freshness";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
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
  const canEditArchivedProblem = canEditProblem(user, problem);
  const canDeleteCurrentProblem = canDeleteProblem(user, problem);
  const canManageFrontPageEligibility = canUseAdminTools(user);
  const publishesImmediately = await canPublishProblemEditForProblem(user, problem);
  const canManageProblemHints = publishesImmediately;
  const pendingProposal = publishesImmediately
    ? null
    : await prisma.problemEditProposal.findFirst({
        where: { problemId: problem.id, proposerId: user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, editSummary: true }
      });
  const canSetCurrentQualityStatus = publishesImmediately && canSetProblemQualityStatus(user.role, problem.qualityStatus);
  const canSetUnreviewedStatus = canSetProblemQualityStatus(user.role, QualityStatus.UNREVIEWED);
  const canSetNeedsWorkStatus = canSetProblemQualityStatus(user.role, QualityStatus.NEEDS_WORK);
  const canKeepReviewedStatus =
    problem.qualityStatus === QualityStatus.REVIEWED &&
    canSetProblemQualityStatus(user.role, QualityStatus.REVIEWED);
  if (problem.status === "ARCHIVED" && !canEditArchivedProblem) notFound();
  const [siblingTranslations, sourceRevisionId] = await Promise.all([
    prisma.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        id: { not: problem.id }
      },
      select: { language: true }
    }),
    problem.translatedFromProblemId
      ? latestProblemTextRevisionId(problem.translatedFromProblemId)
      : null
  ]);
  const staleTranslation = Boolean(
    sourceRevisionId && problem.translatedFromRevisionId && sourceRevisionId > problem.translatedFromRevisionId
  );
  const relatedGroups = await Promise.all(problem.relatedGroups.map(async (group) => ({
    title: group.title,
    problems: await Promise.all(group.relations.map(async ({ targetProblem }) => ({
      ...targetProblem,
      titleHtml: await renderInlineMarkdown(targetProblem.title)
    })))
  })));

  return (
    <ForestPageLayout
      title={publishesImmediately ? t.contentEditor.editProblem : t.contentEditor.proposeEdit}
      eyebrow={problem.title}
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description={publishesImmediately
        ? t.contentEditor.editProblemDescription
        : t.contentEditor.proposalDescription}
      workspaceClassName={problem.translatedFromProblem ? undefined : "forest-page-workspace-narrow"}
      actions={
        <>
          <Link href={`/problems/${problem.slug}`} className="button secondary">
            {t.contentEditor.viewProblem}
          </Link>
          <Link href={`/problems/${problem.slug}/history`} className="button secondary">
            {t.contentEditor.history}
          </Link>
        </>
      }
    >
      <div className={problem.translatedFromProblem ? "translation-compose-page" : ""}>
        <div className="translation-compose-main">
          {pendingProposal && (
            <section className="quality-banner quality-unreviewed mb-4" role="status">
              <strong>{t.contentEditor.pendingProposal}</strong>{" "}
              {t.contentEditor.pendingProposalHelp}
              {pendingProposal.editSummary ? ` ${t.contentEditor.currentSummary(pendingProposal.editSummary)}` : ""}
            </section>
          )}
          <ProblemConcurrentEditForm
            action={updateProblemAction.bind(null, problem.id)}
            baseVersion={problem.version}
            latestHref={`/problems/${problem.slug}`}
            historyHref={`/problems/${problem.slug}/history`}
            locale={interfaceLocale}
          >
            <section className="problem-compose-card">
              <div className="problem-compose-section-title">
                {publishesImmediately ? t.contentEditor.essentialInformation : t.contentEditor.proposeEdit}
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium">{t.contentEditor.title}</span>
                <input name="title" defaultValue={problem.title} />
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-medium">{t.contentEditor.statement}</span>
                <MarkdownEditor
                  name="bodyMarkdown"
                  initialValue={problem.bodyMarkdown}
                  draftKey={`problem:${problem.id}:statement`}
                  resetSignal={problem.version}
                  sourceUpdatedAt={problem.updatedAt.getTime()}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
                <LanguageField
                  defaultValue={problem.language}
                  disabledValues={siblingTranslations.map((translation) => translation.language)}
                  help={t.contentEditor.languageMoveHelp}
                  label={t.languageSelector.label}
                />
                <ProblemDifficultyField
                  defaultValue={problem.difficulty}
                  help={t.contentEditor.difficultyHelp}
                  label={t.contentEditor.difficulty}
                />
              </div>
              <ProblemDomainPicker
                domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
                initialValues={problem.domains.length ? problem.domains.map((item) => item.mscCode) : [problem.domain]}
                initialSpoilers={problem.domains.filter((item) => item.spoiler).map((item) => item.mscCode)}
                labels={t.problems.domainPicker}
                locale={interfaceLocale}
                showSubdomains
              />
            </section>

            <div className="problem-compose-actions">
              <button type="submit">{publishesImmediately ? t.contentEditor.saveChanges : t.contentEditor.submitForReview}</button>
              <ContentPreviewButton contentType="problem" locale={interfaceLocale} />
              <ProblemDetailsDisclosure label={t.contentEditor.addDetails}>
                  <section className="problem-compose-subsection">
                    <h2>{t.contentEditor.origin}</h2>
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        {t.contentEditor.approximateOrigin}
                        <FieldHelp text={t.contentEditor.originHelp} />
                      </span>
                      <input name="origin" defaultValue={problem.origin} />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-medium">{t.contentEditor.chapter}</span>
                        <input name="originChapter" defaultValue={problem.originChapter ?? ""} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-medium">{t.contentEditor.pageNumber}</span>
                        <input name="originPage" defaultValue={problem.originPage ?? ""} />
                      </label>
                    </div>
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        {t.contentEditor.provenanceNote}
                        <FieldHelp text={t.contentEditor.provenanceHelp} />
                      </span>
                      <textarea className="compact-textarea" name="originNote" defaultValue={problem.originNote ?? ""} />
                    </label>
                  </section>

                  <ProblemClassificationFields
                    initialStyles={problem.styles}
                    initialIsConjecture={problem.isConjecture}
                    locale={interfaceLocale}
                  />

                  <section className="problem-compose-subsection">
                    <h2>{t.contentEditor.publishingOptions}</h2>
                    <label className="checkbox-field">
                      <input name="listed" type="checkbox" defaultChecked={problem.listed} />
                      <span>
                        <strong>{t.contentEditor.listed}</strong>
                      </span>
                    </label>
                    <ProblemContentOptions
                      initialIsExercise={problem.isExercise}
                      initialShowRelatedProblems={problem.showRelatedProblems}
                      labels={{
                        exercise: t.contentEditor.exercise,
                        exerciseHelp: t.contentEditor.exerciseHelp,
                        showRelatedProblems: t.contentEditor.showRelatedProblems,
                        showRelatedProblemsHelp: t.contentEditor.showRelatedProblemsHelp
                      }}
                    />
                    {canManageFrontPageEligibility && (
                      <label className="checkbox-field">
                        <input name="canAppearOnFrontPage" type="checkbox" defaultChecked={problem.canAppearOnFrontPage} />
                        <span>
                          <strong>{t.contentEditor.featureProblem}</strong>
                        </span>
                      </label>
                    )}
                    {canSetCurrentQualityStatus && (
                      <label className="grid gap-2">
                        <span className="field-label-with-help text-sm font-medium">
                          {t.contentEditor.status}
                          <FieldHelp text={t.contentEditor.qualityStatusHelp} />
                        </span>
                        <select name="qualityStatus" defaultValue={problem.qualityStatus}>
                          {canSetUnreviewedStatus && <option value="UNREVIEWED">{t.contentEditor.unreviewedDefault}</option>}
                          {canSetNeedsWorkStatus && <option value="NEEDS_WORK">{t.contentEditor.needsWork}</option>}
                          {canKeepReviewedStatus && <option value="REVIEWED">{t.contentEditor.reviewed}</option>}
                        </select>
                      </label>
                    )}
                    {publishesImmediately && problem.translatedFromProblem && (
                      <label className="checkbox-field">
                        <input name="markTranslationFresh" type="checkbox" defaultChecked={false} />
                        <span>
                          <strong>{t.contentEditor.markTranslationFresh}</strong>
                        </span>
                      </label>
                    )}
                    {publishesImmediately && (
                      <ProblemVerificationFields
                        initialMode={problem.verificationMode}
                        initialPrompt={problem.verificationPrompt ?? ""}
                        initialAnswer={problem.verificationAnswer ?? ""}
                        modeOptions={Object.entries(t.contentEditor.verificationModes)}
                        labels={{
                          title: t.contentEditor.solveVerification,
                          mode: t.contentEditor.verificationMode,
                          question: t.contentEditor.verificationQuestion,
                          questionPlaceholder: t.contentEditor.verificationQuestionPlaceholder,
                          answer: t.contentEditor.expectedAnswer,
                          answerPlaceholder: t.contentEditor.expectedAnswerPlaceholder
                        }}
                      />
                    )}
                    <label className="grid gap-2">
                      <span className="field-label-with-help text-sm font-medium">
                        {t.contentEditor.editSummary}
                        <FieldHelp text={t.contentEditor.editSummaryHelp} />
                      </span>
                      <input name="editSummary" placeholder={t.contentEditor.problemEditSummaryPlaceholder} />
                    </label>
                  </section>

                  <section id="related-problems-editor" className="problem-compose-subsection">
                    <h2>{t.contentEditor.relatedProblems}</h2>
                    <ProblemRelationPicker
                      excludeSlug={problem.slug}
                      initialGroups={relatedGroups}
                    />
                  </section>
              </ProblemDetailsDisclosure>
            </div>
          </ProblemConcurrentEditForm>

          {canManageProblemHints && publishesImmediately && (
            <section className="problem-hint-admin panel mt-6 grid gap-5 p-5">
              <div>
                <h2 className="text-lg font-semibold">{t.contentEditor.hintsBeforeSolutions}</h2>
              </div>

              {problem.hints.length > 0 && (
                <div className="grid gap-4">
                  {problem.hints.map((hint, index) => (
                    <article key={hint.id} className="problem-hint-admin-card">
                      <form action={updateProblemHintAction.bind(null, hint.id, problem.slug)} className="grid gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="grid gap-2">
                            <span className="text-sm font-medium">{t.contentEditor.hintOrder(index + 1)}</span>
                            <input name="position" type="number" defaultValue={hint.position} />
                          </label>
                        </div>
                        <div className="grid gap-2">
                          <span className="text-sm font-medium">{t.contentEditor.hintMarkdown}</span>
                          <MarkdownEditor
                            name="bodyMarkdown"
                            initialValue={hint.bodyMarkdown}
                            minHeight="8rem"
                            draftKey={`problem:${problem.id}:hint:${hint.id}`}
                          />
                        </div>
                        <button type="submit">{t.contentEditor.saveHint}</button>
                      </form>
                      <form action={deleteProblemHintAction.bind(null, hint.id, problem.slug)}>
                        <button type="submit" className="danger">
                          {t.contentEditor.deleteHint}
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              )}

              <form action={createProblemHintAction.bind(null, problem.id, problem.slug)} className="problem-hint-admin-card grid gap-3">
                <h3 className="font-semibold">{t.contentEditor.addHint}</h3>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">{t.contentEditor.hintMarkdown}</span>
                  <MarkdownEditor
                    name="bodyMarkdown"
                    minHeight="8rem"
                    draftKey={`problem:${problem.id}:new-hint`}
                    resetSignal={problem.hints.length}
                  />
                </div>
                <button type="submit" className="secondary">
                  {t.contentEditor.addHint}
                </button>
              </form>
            </section>
          )}

          {canDeleteCurrentProblem && (
            <section className="danger-zone mt-6">
              <div>
                <h2>{t.contentEditor.deleteProblem}</h2>
                <p>{t.contentEditor.deleteProblemHelp}</p>
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
            latestRevisionId={sourceRevisionId}
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
