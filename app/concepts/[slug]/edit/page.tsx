import { notFound, redirect } from "next/navigation";
import { DeleteConceptButton } from "@/components/DeleteConceptButton";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ConceptContributorGuideLink } from "@/components/ConceptContributorGuideLink";
import { FieldHelp } from "@/components/FieldHelp";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { LiveMarkdownTitleField } from "@/components/LiveMarkdownTitleField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ContentPreviewButton } from "@/components/ContentPreviewButton";
import { OrderedProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { deleteConceptAction, updateConceptAction } from "@/lib/actions/concept-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { canPublishConceptEditForConcept } from "@/lib/concept-edit-access";
import { MAX_CONCEPT_EXERCISES } from "@/lib/concept-exercises";
import { prisma } from "@/lib/db";
import { PROBLEM_DOMAINS, translatedDomainLabel, translatedDomainOptions } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canDeleteConcept, canProposeConceptEdit, canUseAdminTools } from "@/lib/permissions";
import { renderInlineMarkdown } from "@/lib/markdown";
import { latestConceptTextRevisionId } from "@/lib/translation-freshness";

export const dynamic = "force-dynamic";

export default async function EditConceptPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ conflict?: string }>;
}) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      aliases: true,
      practiceExercises: {
        orderBy: { position: "asc" },
        select: {
          problem: {
            select: {
              id: true,
              title: true,
              slug: true,
              domain: true,
              difficulty: true
            }
          }
        }
      },
      references: { orderBy: { position: "asc" } },
      translatedFromConcept: {
        select: { id: true, slug: true, title: true, language: true, bodyMarkdown: true }
      }
    }
  });

  if (!concept) {
    const merged = await prisma.conceptRedirect.findUnique({
      where: { sourceSlug: slug },
      include: { targetConcept: true }
    });
    if (merged) redirect(`/concepts/${merged.targetConcept.slug}/edit`);
    notFound();
  }
  if (!canProposeConceptEdit(user)) notFound();
  const publishesImmediately = await canPublishConceptEditForConcept(user, concept);
  const canFeatureConcept = publishesImmediately && canUseAdminTools(user);
  const canDeleteCurrentConcept = publishesImmediately && canDeleteConcept(user, concept);
  const pendingProposal = publishesImmediately
    ? null
    : await prisma.conceptEditProposal.findFirst({
        where: { conceptId: concept.id, proposerId: user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { editSummary: true }
      });
  const [siblingTranslations, sourceRevisionId] = await Promise.all([
    prisma.concept.findMany({
      where: {
        translationGroupId: concept.translationGroupId,
        id: { not: concept.id }
      },
      select: { language: true }
    }),
    concept.translatedFromConceptId
      ? latestConceptTextRevisionId(concept.translatedFromConceptId)
      : null
  ]);
  const staleTranslation = Boolean(
    sourceRevisionId && concept.translatedFromRevisionId && sourceRevisionId > concept.translatedFromRevisionId
  );
  const initialExercises: TipPickerProblem[] = await Promise.all(
    concept.practiceExercises.map(async ({ problem }) => ({
      id: problem.id,
      title: problem.title,
      titleHtml: await renderInlineMarkdown(problem.title),
      slug: problem.slug,
      domainLabel: translatedDomainLabel(problem.domain, t.home.domainLabels),
      difficulty: problem.difficulty
    }))
  );

  return (
    <ForestPageLayout
      title={publishesImmediately ? t.contentEditor.editConcept : t.contentEditor.proposeEdit}
      eyebrow={<AsyncMarkdownInline markdown={concept.title} />}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={publishesImmediately ? t.contentEditor.editDescription : t.contentEditor.proposalDescription}
      workspaceClassName={concept.translatedFromConcept ? undefined : "forest-page-workspace-narrow"}
    >
      <div className={concept.translatedFromConcept ? "translation-compose-page" : ""}>
      <div className="translation-compose-main">
      {pendingProposal && (
        <section className="quality-banner quality-unreviewed mb-4" role="status">
          <strong>{t.contentEditor.pendingProposal}</strong>{" "}
          {t.contentEditor.pendingProposalHelp}
          {pendingProposal.editSummary ? ` ${t.contentEditor.currentSummary(pendingProposal.editSummary)}` : ""}
        </section>
      )}
      {query.conflict === "1" && (
        <section className="quality-banner quality-needs-work mb-4" role="alert">
          {t.contentEditor.conceptProposalConflict}
        </section>
      )}
      <form action={updateConceptAction.bind(null, concept.id)} className="panel grid gap-4 p-5">
        {!publishesImmediately && (
          <input type="hidden" name="baseUpdatedAt" value={concept.updatedAt.toISOString()} />
        )}
        <LiveMarkdownTitleField
          defaultValue={concept.title}
          locale={interfaceLocale}
          required
        />
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.concepts.kind}</span>
          <select name="kind" defaultValue={concept.kind}>
            <option value="DEFINITION">{t.concepts.kinds.DEFINITION}</option>
            <option value="THEOREM">{t.concepts.kinds.THEOREM}</option>
            <option value="INTUITIVE_NOTION">{t.concepts.kinds.INTUITIVE_NOTION}</option>
            <option value="NOTATION">{t.concepts.kinds.NOTATION}</option>
          </select>
        </label>
        <LanguageField
          defaultValue={concept.language}
          disabledValues={siblingTranslations.map((translation) => translation.language)}
          label={t.languageSelector.label}
          help={t.contentEditor.languageMoveHelp}
        />
        {publishesImmediately && concept.translatedFromConcept && (
          <label className="checkbox-field">
            <input name="markTranslationFresh" type="checkbox" defaultChecked={false} />
            <span>
              <strong>{t.contentEditor.markTranslationFresh}</strong>
              <small>
                Source: <AsyncMarkdownInline markdown={concept.translatedFromConcept.title} />
                {staleTranslation ? ` / ${t.contentEditor.newerRevision(sourceRevisionId)}` : ` / ${t.contentEditor.noNewerSource}`}
              </small>
            </span>
          </label>
        )}
        <div className="grid gap-4">
          <ProblemDomainPicker
            domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
            helpText={t.problems.domainPicker.chooseOne}
            initialValues={[concept.domainCode]}
            inputName="domain"
            label={t.problems.domainPicker.domain}
            labels={t.problems.domainPicker}
            locale={interfaceLocale}
            maxDomains={1}
            showSubdomains
            showSpoilerToggle={false}
          />
          <label className="grid gap-2">
            <span className="field-label-with-help text-sm font-medium">
              {t.contentEditor.aliases}
              <FieldHelp text={t.contentEditor.aliasesHelp} />
            </span>
            <textarea
              name="aliases"
              rows={3}
              defaultValue={concept.aliases.map((alias) => alias.alias).join("\n")}
            />
          </label>
        </div>
        <div className="grid gap-2">
          <div className="content-editor-section-heading">
            <span className="text-sm font-medium">{t.contentEditor.content}</span>
            {canUseAdminTools(user) && (
              <ConceptContributorGuideLink label={t.conceptGuide.openGuide} />
            )}
          </div>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={concept.bodyMarkdown}
            draftKey={`concept:${concept.id}:body`}
            resetSignal={concept.updatedAt.getTime()}
            sourceUpdatedAt={concept.updatedAt.getTime()}
          />
        </div>
        <details className="concept-linked-exercises-editor">
          <summary>
            <span>{t.contentEditor.linkedExercises}</span>
          </summary>
          <div className="concept-linked-exercises-editor-body">
            <p className="muted text-sm">
              {t.contentEditor.exerciseQueueHelp}
            </p>
            <OrderedProblemPicker
              createHref="/problems/new?exercise=1"
              createLabel={t.contentEditor.addExercise}
              createInNewTab
              initialProblems={initialExercises}
              inputName="exerciseIds"
              maxProblems={MAX_CONCEPT_EXERCISES}
              searchParams="exercise=1"
              labels={{
                empty: t.contentEditor.noExercises,
                maximumSelected: t.contentEditor.maximumExercises,
                noMatches: t.contentEditor.noMatchingExercises,
                remove: t.contentEditor.removeExercise,
                search: t.contentEditor.searchExercises,
                searchPlaceholder: t.contentEditor.searchExercisesPlaceholder,
                searching: t.contentEditor.searchingExercises
              }}
            />
          </div>
        </details>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.contentEditor.references}</span>
          <textarea
            name="references"
            defaultValue={concept.references
              .map((reference) => [reference.title, reference.url ?? "", reference.note ?? ""].join(" | "))
              .join("\n")}
          />
        </label>
        {canFeatureConcept && (
          <label className="checkbox-field">
            <input
              name="canAppearInConceptBrowser"
              type="checkbox"
              defaultChecked={concept.canAppearInConceptBrowser}
            />
            <span>
              <strong>{t.contentEditor.featureConcept}</strong>
              <small>{t.contentEditor.featureConceptHelp}</small>
            </span>
          </label>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.contentEditor.editSummary}</span>
          <input name="editSummary" placeholder={t.contentEditor.editSummaryPlaceholder} />
        </label>
        <div className="content-editor-actions">
          <button type="submit">
            {publishesImmediately ? t.contentEditor.saveChanges : t.contentEditor.submitProposal}
          </button>
          <ContentPreviewButton contentType="concept" locale={interfaceLocale} />
        </div>
      </form>

      {canDeleteCurrentConcept && (
        <section className="danger-zone mt-6">
          <div>
            <h2>{t.contentEditor.deleteConcept}</h2>
            <p>{t.contentEditor.deleteConceptHelp}</p>
          </div>
          <form action={deleteConceptAction.bind(null, concept.id)}>
            <DeleteConceptButton title={concept.title} />
          </form>
        </section>
      )}
      </div>
      {concept.translatedFromConcept && (
        <TranslationReferencePanel
          basedOnRevisionId={concept.translatedFromRevisionId}
          href={`/concepts/${concept.translatedFromConcept.slug}`}
          idPrefix={`concept-${concept.id}-translation-source`}
          latestRevisionId={sourceRevisionId}
          markdown={concept.translatedFromConcept.bodyMarkdown}
          language={concept.translatedFromConcept.language}
          stale={staleTranslation}
          title={concept.translatedFromConcept.title}
        />
      )}
      </div>
    </ForestPageLayout>
  );
}
