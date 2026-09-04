import { ConceptCreateForm, ConceptSubmitButton } from "@/components/ConceptCreateForm";
import { ConceptDuplicateSuggestions } from "@/components/ConceptDuplicateSuggestions";
import { ConceptContributorGuideLink } from "@/components/ConceptContributorGuideLink";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentPreviewButton } from "@/components/ContentPreviewButton";
import { FieldHelp } from "@/components/FieldHelp";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { LiveMarkdownTitleField } from "@/components/LiveMarkdownTitleField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { LibraryReferencePicker } from "@/components/library/LibraryReferencePicker";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { requireVerifiedUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { requireDraftSession } from "@/lib/draft-session";
import { CREATION_SUBMISSION_FIELD } from "@/lib/creation-submission";
import { PROBLEM_DOMAINS, translatedDomainOptions } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { parseActiveContentLanguage } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { prepareMarkdownForTranslation } from "@/lib/translated-markdown";
import { nextMissingTranslationLanguage } from "@/lib/translation-routing";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";

export default async function NewConceptPage({
  searchParams
}: {
  searchParams: Promise<{ title?: string; translateOf?: string; language?: string; draft?: string }>;
}) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const queryParams = await searchParams;
  const { title = "", translateOf = "", language = "" } = queryParams;
  if (!user.conceptGuideAcknowledgedAt) {
    const returnToParams = new URLSearchParams();
    if (title) returnToParams.set("title", title);
    if (translateOf) returnToParams.set("translateOf", translateOf);
    if (language) returnToParams.set("language", language);
    if (queryParams.draft) returnToParams.set("draft", queryParams.draft);
    const returnTo = `/concepts/new${returnToParams.size ? `?${returnToParams}` : ""}`;
    redirect(`/contributing/guides/concepts?required=1&returnTo=${encodeURIComponent(returnTo)}`);
  }
  const draftSession = requireDraftSession("/concepts/new", queryParams);
  const preferredLanguage = await getPreferredContentLanguage();
  const requestedLanguage = language ? parseActiveContentLanguage(language) : preferredLanguage;
  const sourceConcept = translateOf
    ? await prisma.concept.findUnique({
        where: { slug: translateOf },
        select: {
          slug: true,
          title: true,
          bodyMarkdown: true,
          domainCode: true,
          kind: true,
          language: true,
          translationGroupId: true,
          libraryReferences: {
            orderBy: { position: "asc" },
            select: { referenceId: true, role: true, locator: true, note: true }
          },
          practiceExercises: {
            orderBy: { position: "asc" },
            select: {
              problem: {
                select: { slug: true, title: true, language: true, translationGroupId: true }
              }
            }
          }
        }
      })
    : null;
  const sourceTranslationLanguages = sourceConcept
    ? await prisma.concept.findMany({
        where: { translationGroupId: sourceConcept.translationGroupId },
        select: { language: true }
      })
    : [];
  const unavailableTranslationLanguages = sourceTranslationLanguages.map((translation) => translation.language);
  const targetTranslationLanguage = sourceConcept
    ? nextMissingTranslationLanguage(sourceConcept.language, sourceTranslationLanguages, requestedLanguage)
    : requestedLanguage;
  const initialLanguage = targetTranslationLanguage ?? requestedLanguage;
  const translatedExercises =
    sourceConcept && targetTranslationLanguage && sourceConcept.practiceExercises.length > 0
      ? await prisma.problem.findMany({
          where: {
            translationGroupId: {
              in: sourceConcept.practiceExercises.map(({ problem }) => problem.translationGroupId)
            },
            language: targetTranslationLanguage
          },
          select: { slug: true, translationGroupId: true }
        })
      : [];
  const translatedExerciseByGroup = new Map(
    translatedExercises.map((exercise) => [exercise.translationGroupId, exercise.slug])
  );
  const defaultContent = sourceConcept
    ? await prepareMarkdownForTranslation(sourceConcept.bodyMarkdown, initialLanguage)
    : t.contentEditor.defaultConceptContent;
  const libraryReferences = await prisma.libraryReference.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { canonicalTitle: "asc" },
    select: { id: true, canonicalTitle: true, referenceType: true }
  });

  return (
    <ForestPageLayout
      title={sourceConcept ? t.contentEditor.translation : t.contentEditor.newConcept}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={sourceConcept ? undefined : t.contentEditor.conceptStubDescription}
      workspaceClassName={sourceConcept ? undefined : "forest-page-workspace-narrow"}
    >
    <div className={sourceConcept ? "translation-compose-page" : ""}>
      <div className="translation-compose-main">
        <ConceptCreateForm
          labels={{
            duplicateTitleHeading: t.contentEditor.duplicateConceptTitleHeading,
            duplicateTitleWarning: t.contentEditor.duplicateConceptTitleWarning,
            keepSameTranslationTitle: t.contentEditor.keepSameTranslationTitle,
            publishing: t.contentEditor.publishing,
            publishAnyway: t.contentEditor.publishAnyway,
            rateLimitHeading: t.contentEditor.creationRateLimitHeading,
            rateLimitMessage: t.contentEditor.creationRateLimitMessage,
            sameTranslationTitleHeading: t.contentEditor.sameTranslationTitleHeading,
            sameTranslationTitleWarning: t.contentEditor.sameTranslationTitleWarning,
            translationLinksHeading: t.contentEditor.translationLinksHeading
          }}
        >
        <input type="hidden" name={CREATION_SUBMISSION_FIELD} value={draftSession} />
        {sourceConcept && <input type="hidden" name="translationGroupId" value={sourceConcept.translationGroupId} />}
        {sourceConcept && <input type="hidden" name="translationSourceSlug" value={sourceConcept.slug} />}
        <LiveMarkdownTitleField
          defaultValue={sourceConcept ? "" : title}
          locale={interfaceLocale}
          required
          placeholder={sourceConcept ? t.contentEditor.translationTitlePlaceholder(sourceConcept.title) : undefined}
        />
        {!sourceConcept && <ConceptDuplicateSuggestions initialTitle={title} locale={interfaceLocale} />}
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t.concepts.kind}</span>
          <select name="kind" defaultValue={sourceConcept?.kind ?? "DEFINITION"}>
            <option value="DEFINITION">{t.concepts.kinds.DEFINITION}</option>
            <option value="THEOREM">{t.concepts.kinds.THEOREM}</option>
            <option value="INTUITIVE_NOTION">{t.concepts.kinds.INTUITIVE_NOTION}</option>
            <option value="NOTATION">{t.concepts.kinds.NOTATION}</option>
          </select>
        </label>
        <LanguageField
          defaultValue={initialLanguage}
          disabledValues={unavailableTranslationLanguages}
          label={t.languageSelector.label}
          help={
            sourceConcept
              ? t.contentEditor.linkedConceptLanguagesHelp
              : t.contentEditor.independentConceptTranslationHelp
          }
        />
        <div className="grid gap-4">
          <ProblemDomainPicker
            domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
            helpText={null}
            initialValues={[sourceConcept?.domainCode ?? "other"]}
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
            <textarea name="aliases" rows={3} />
          </label>
        </div>
        <div className="grid gap-2">
          <div className="content-editor-section-heading">
            <span className="text-sm font-medium">{t.contentEditor.content}</span>
            <ConceptContributorGuideLink label={t.conceptGuide.openGuide} />
          </div>
          {sourceConcept && (
            <p className="translation-link-note">
              {t.contentEditor.translationLinksNote}
            </p>
          )}
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={defaultContent}
            draftKey={`concept:new:${draftSession}:body`}
          />
        </div>
        {sourceConcept && targetTranslationLanguage && sourceConcept.practiceExercises.length > 0 && (
          <section className="translation-exercise-options">
            <div>
              <h2>{t.contentEditor.linkedExercises}</h2>
              <p className="muted text-sm">
                {t.contentEditor.linkedExercisesTranslationHelp}
              </p>
            </div>
            <div className="translation-exercise-list">
              {sourceConcept.practiceExercises.map(({ problem }) => {
                const translatedSlug = translatedExerciseByGroup.get(problem.translationGroupId);
                const href = translatedSlug
                  ? `/problems/${translatedSlug}`
                  : `/problems/new?translateOf=${encodeURIComponent(problem.slug)}&language=${encodeURIComponent(initialLanguage)}`;
                return (
                  <div key={problem.translationGroupId} className="translation-exercise-item">
                    <div>
                      <strong><AsyncMarkdownInline markdown={problem.title} /></strong>
                      <span className="meta">{t.contentEditor.sourceLanguage(problem.language.toUpperCase())}</span>
                    </div>
                    <Link href={href as never} target="_blank" rel="noreferrer" className="button secondary">
                      {translatedSlug ? t.contentEditor.openLanguageVersion(initialLanguage.toUpperCase()) : t.contentEditor.translateExercise}
                      <ExternalLink size={15} aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {canUseAdminTools(user) && <LibraryReferencePicker
          locale={interfaceLocale}
          options={libraryReferences.map((reference) => ({ id: reference.id, title: reference.canonicalTitle, type: reference.referenceType }))}
          initial={sourceConcept?.libraryReferences.map((reference) => ({ ...reference, locator: reference.locator ?? "", note: reference.note ?? "", isPrimary: false }))}
        />}
          {sourceConcept && !targetTranslationLanguage && (
            <p className="quality-banner quality-needs-work text-sm" role="status">
              {t.contentEditor.allConceptLanguagesExist}
            </p>
          )}
          <div className="content-editor-actions">
            <ConceptSubmitButton
              disabled={Boolean(sourceConcept && !targetTranslationLanguage)}
              pendingLabel={t.contentEditor.publishing}
            >
              {sourceConcept ? t.contentEditor.createTranslation : t.contentEditor.createConcept}
            </ConceptSubmitButton>
            <ContentPreviewButton contentType="concept" locale={interfaceLocale} />
          </div>
        </ConceptCreateForm>
      </div>
      {sourceConcept && (
        <TranslationReferencePanel
          href={`/concepts/${sourceConcept.slug}`}
          idPrefix="concept-translation-source"
          title={sourceConcept.title}
          language={sourceConcept.language}
          markdown={sourceConcept.bodyMarkdown}
        />
      )}
    </div>
    </ForestPageLayout>
  );
}
