import type { Route } from "next";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ProblemCreateForm } from "@/components/ProblemCreateForm";
import { ContentPreviewButton } from "@/components/ContentPreviewButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { LibraryReferencePicker } from "@/components/library/LibraryReferencePicker";
import { LiveMarkdownTitleField } from "@/components/LiveMarkdownTitleField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDifficultyField } from "@/components/ProblemDifficultyField";
import { ProblemContentOptions } from "@/components/ProblemContentOptions";
import { ProblemClassificationFields } from "@/components/ProblemClassificationFields";
import { ProblemDetailsDisclosure } from "@/components/ProblemDetailsDisclosure";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { ProblemRelationPicker } from "@/components/ProblemRelationPicker";
import { ProblemVerificationFields } from "@/components/ProblemVerificationFields";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { TranslationCompanionFields } from "@/components/TranslationCompanionFields";
import { requireVerifiedUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { parseProblemTranslationTaskKey } from "@/lib/contribution-tasks";
import { PROBLEM_DOMAINS, translatedDomainOptions } from "@/lib/domains";
import { prisma } from "@/lib/db";
import { requireDraftSession } from "@/lib/draft-session";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { parseActiveContentLanguage } from "@/lib/languages";
import { orderProblemHintsByCanonicalOrder } from "@/lib/problem-hints";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { prepareMarkdownCollectionForTranslation } from "@/lib/translated-markdown";
import { contentLanguageViewHref, nextMissingTranslationLanguage } from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";

export default async function NewProblemPage({
  searchParams
}: {
  searchParams: Promise<{
    playlist?: string;
    exploration?: string;
    listed?: string;
    parent?: string;
    translateOf?: string;
    language?: string;
    draft?: string;
    exercise?: string;
    contest?: string;
    concept?: string;
    task?: string;
    completed?: string;
  }>;
}) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const queryParams = await searchParams;
  const draftSession = requireDraftSession("/problems/new", queryParams);
  const {
    playlist = "",
    exploration = "",
    listed = "1",
    parent = "",
    translateOf = "",
    language = "",
    exercise = "",
    contest = "",
    concept = "",
    task = "",
    completed = ""
  } = queryParams;
  const contributionTask = parseProblemTranslationTaskKey(task);
  const explorationSlug = exploration || playlist;
  const preferredLanguage = await getPreferredContentLanguage();
  const linkedConcept = concept && !translateOf
    ? await prisma.concept.findFirst({
        where: { slug: concept, status: { not: "MISSING" } },
        select: { slug: true, title: true, language: true }
      })
    : null;
  const requestedLanguage = language
    ? parseActiveContentLanguage(language)
    : linkedConcept?.language ?? preferredLanguage;
  const isListedByDefault = listed !== "0";
  const isExerciseByDefault = Boolean(linkedConcept) || exercise === "1" || exercise === "true";
  const parentProblem = parent
    ? await prisma.problem.findUnique({
        where: { slug: parent },
        select: { slug: true, title: true }
      })
    : null;
  const sourceProblem = translateOf
    ? await prisma.problem.findUnique({
        where: { slug: translateOf },
        select: {
          slug: true,
          title: true,
          bodyMarkdown: true,
          language: true,
          translationGroupId: true,
          difficulty: true,
          isExercise: true,
          isConjecture: true,
          styles: true,
          showRelatedProblems: true,
          origin: true,
          originChapter: true,
          originPage: true,
          originNote: true,
          knownSourceId: true,
          libraryReferences: {
            orderBy: { position: "asc" },
            select: { referenceId: true, role: true, locator: true, note: true, isPrimary: true }
          },
          listed: true,
          verificationMode: true,
          verificationPrompt: true,
          verificationAnswer: true,
          domain: true,
          domains: { orderBy: { position: "asc" } },
          hints: {
            where: { proofId: null },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true,
              translationGroupId: true,
              translatedFromHintId: true,
              position: true,
              bodyMarkdown: true
            }
          },
          proofs: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              bodyMarkdown: true,
              author: { select: { username: true, displayName: true } },
              hint: { select: { id: true, bodyMarkdown: true } }
            }
          }
        }
      })
    : null;
  const sourceHintOrderCandidates = sourceProblem?.hints.length
    ? await prisma.problemHint.findMany({
        where: {
          translationGroupId: { in: sourceProblem.hints.map((hint) => hint.translationGroupId) }
        },
        select: {
          id: true,
          translationGroupId: true,
          translatedFromHintId: true,
          position: true
        }
      })
    : [];
  const sourceProblemHints = sourceProblem
    ? orderProblemHintsByCanonicalOrder(sourceProblem.hints, sourceHintOrderCandidates)
    : [];
  const completedProblem = contributionTask && completed
    ? await prisma.problem.findUnique({
        where: { slug: completed },
        select: { language: true, slug: true }
      })
    : null;
  const sourceTranslationLanguages = sourceProblem
    ? await prisma.problem.findMany({
        where: { translationGroupId: sourceProblem.translationGroupId },
        select: { language: true }
      })
    : [];
  const unavailableTranslationLanguages = sourceTranslationLanguages.map((translation) => translation.language);
  const targetTranslationLanguage = sourceProblem
    ? nextMissingTranslationLanguage(sourceProblem.language, sourceTranslationLanguages, requestedLanguage)
    : requestedLanguage;
  const initialLanguage = targetTranslationLanguage ?? requestedLanguage;
  const sourceTranslationMarkdowns = sourceProblem
    ? [
        sourceProblem.bodyMarkdown,
        ...sourceProblemHints.map((hint) => hint.bodyMarkdown),
        ...sourceProblem.proofs.flatMap((proof) => [
          proof.bodyMarkdown,
          ...(proof.hint ? [proof.hint.bodyMarkdown] : [])
        ])
      ]
    : [];
  const preparedTranslationMarkdowns = sourceProblem
    ? await prepareMarkdownCollectionForTranslation(sourceTranslationMarkdowns, initialLanguage)
    : [];
  let preparedTranslationIndex = 0;
  const defaultStatement = sourceProblem
    ? preparedTranslationMarkdowns[preparedTranslationIndex++] ?? sourceProblem.bodyMarkdown
    : "";
  const preparedHints = sourceProblem
    ? sourceProblemHints.map((hint) => ({
        ...hint,
        bodyMarkdown: preparedTranslationMarkdowns[preparedTranslationIndex++] ?? hint.bodyMarkdown
      }))
    : [];
  const preparedProofs = sourceProblem
    ? sourceProblem.proofs.map((proof) => ({
        ...proof,
        bodyMarkdown: preparedTranslationMarkdowns[preparedTranslationIndex++] ?? proof.bodyMarkdown,
        hint: proof.hint
          ? {
              ...proof.hint,
              bodyMarkdown: preparedTranslationMarkdowns[preparedTranslationIndex++] ?? proof.hint.bodyMarkdown
            }
          : null
      }))
    : [];
  const initialDomains = sourceProblem
    ? sourceProblem.domains.length
      ? sourceProblem.domains.map((item) => item.mscCode)
      : [sourceProblem.domain]
    : ["OTHER"];
  const initialDomainSpoilers = sourceProblem
    ? sourceProblem.domains.filter((item) => item.spoiler).map((item) => item.mscCode)
    : [];
  const libraryReferences = await prisma.libraryReference.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { canonicalTitle: "asc" },
    select: { id: true, canonicalTitle: true, referenceType: true }
  });

  return (
    <ForestPageLayout
      title={sourceProblem ? t.contentEditor.translation : isExerciseByDefault ? t.contentEditor.newExercise : t.contentEditor.newProblem}
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      workspaceClassName={sourceProblem ? undefined : "forest-page-workspace-narrow"}
    >
    <div className={sourceProblem ? "translation-compose-page" : ""}>
      <div className="translation-compose-main">
        {sourceProblem && completedProblem && (
          <div className="quality-banner flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {interfaceLocale === "fr"
                ? "Traduction enregistrée. Voici un autre problème à traduire."
                : "Translation saved. Here is another problem to translate."}
            </span>
            <Link
              className="button secondary"
              href={contentLanguageViewHref("/problems", completedProblem.slug, completedProblem.language) as Route}
            >
              {interfaceLocale === "fr" ? "Voir la traduction précédente" : "View the previous translation"}
            </Link>
          </div>
        )}
        <ProblemCreateForm
          labels={{
            keepSameTranslationTitle: t.contentEditor.keepSameTranslationTitle,
            publishAnyway: t.contentEditor.publishAnyway,
            sameTranslationTitleHeading: t.contentEditor.sameTranslationTitleHeading,
            sameTranslationTitleWarning: t.contentEditor.sameTranslationTitleWarning,
            translationLinksHeading: t.contentEditor.translationLinksHeading
          }}
        >
          {explorationSlug && <input type="hidden" name="addToExplorationSlug" value={explorationSlug} />}
          {parentProblem && <input type="hidden" name="parentProblemSlug" value={parentProblem.slug} />}
          {linkedConcept && <input type="hidden" name="linkConceptSlug" value={linkedConcept.slug} />}
          {sourceProblem && <input type="hidden" name="translationGroupId" value={sourceProblem.translationGroupId} />}
          {sourceProblem && <input type="hidden" name="translationSourceSlug" value={sourceProblem.slug} />}
          {sourceProblem && contributionTask && <input type="hidden" name="contributionTask" value={contributionTask} />}
          {contest && <input type="hidden" name="contestSlug" value={contest} />}

          <section className="problem-compose-card">
            <div className="problem-compose-section-title">{t.contentEditor.essentialInformation}</div>
            {explorationSlug && <p className="muted text-sm">{t.contentEditor.creatingForExploration}</p>}
            {parentProblem && <p className="muted text-sm">{t.contentEditor.linkedFrom(parentProblem.title)}</p>}
            {linkedConcept && (
              <p className="muted text-sm">
                {t.contentEditor.creatingExerciseForConcept}{" "}
                <strong><AsyncMarkdownInline markdown={linkedConcept.title} /></strong>
              </p>
            )}
            {contest && (
              <p className="quality-banner text-sm">
                {interfaceLocale === "fr"
                  ? "Ce problème sera proposé au concours hebdomadaire après sa publication."
                  : "This problem will be entered in the weekly contest after publication."}
              </p>
            )}

            <LiveMarkdownTitleField
              contentKind="problem"
              locale={interfaceLocale}
              required
              placeholder={sourceProblem ? t.contentEditor.translationTitlePlaceholder(sourceProblem.title) : undefined}
            />

            <div className="grid gap-2">
              <span className="text-sm font-medium">{t.contentEditor.statement}</span>
              {sourceProblem && (
                <p className="translation-link-note">
                  {t.contentEditor.translationLinksNote}
                </p>
              )}
              <MarkdownEditor
                name="bodyMarkdown"
                initialValue={defaultStatement}
                draftKey={`problem:new:${draftSession}:statement`}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
              <LanguageField
                defaultValue={initialLanguage}
                disabledValues={unavailableTranslationLanguages}
                label={t.languageSelector.label}
                help={
                  sourceProblem
                    ? t.contentEditor.linkedProblemLanguagesHelp
                    : t.contentEditor.independentTranslationHelp
                }
              />
              <ProblemDifficultyField
                defaultValue={sourceProblem?.difficulty}
                help={t.contentEditor.difficultyHelp}
                label={t.contentEditor.difficulty}
              />
            </div>

            <ProblemDomainPicker
              domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
              initialValues={initialDomains}
              initialSpoilers={initialDomainSpoilers}
              labels={t.problems.domainPicker}
              locale={interfaceLocale}
              showSubdomains
            />
          </section>

          {sourceProblem && (
            <TranslationCompanionFields
              draftSession={draftSession}
              hints={preparedHints}
              labels={{
                title: t.contentEditor.accompanyingContent,
                help: t.contentEditor.accompanyingContentHelp,
                alsoTranslate: t.contentEditor.alsoTranslateThis,
                hints: t.contentEditor.translationHints,
                hint: t.contentEditor.translationHint,
                solutions: t.contentEditor.translationSolutions,
                solution: t.contentEditor.translationSolution,
                by: t.contentEditor.translationBy,
                solutionHint: t.contentEditor.translationSolutionHint
              }}
              proofs={preparedProofs.map((proof) => ({
                id: proof.id,
                bodyMarkdown: proof.bodyMarkdown,
                authorName: displayNameForUser(proof.author),
                hint: proof.hint
              }))}
            />
          )}

          <div className="problem-compose-actions">
            <button type="submit" disabled={Boolean(sourceProblem && !targetTranslationLanguage)}>
              {t.contentEditor.publish}
            </button>
            <ContentPreviewButton contentType="problem" locale={interfaceLocale} />
            <ProblemDetailsDisclosure label={t.contentEditor.addDetails}>
                {canUseAdminTools(user) && <LibraryReferencePicker
                  locale={interfaceLocale}
                  allowPrimary
                  options={libraryReferences.map((reference) => ({ id: reference.id, title: reference.canonicalTitle, type: reference.referenceType }))}
                  initial={sourceProblem?.libraryReferences.map((reference) => ({ ...reference, locator: reference.locator ?? "", note: reference.note ?? "" }))}
                />}

                <ProblemClassificationFields
                  initialStyles={sourceProblem?.styles}
                  initialIsConjecture={sourceProblem?.isConjecture}
                  locale={interfaceLocale}
                />

                <section className="problem-compose-subsection">
                  <h2>{t.contentEditor.publishingOptions}</h2>
                  <label className="checkbox-field">
                    <input name="listed" type="checkbox" defaultChecked={sourceProblem?.listed ?? isListedByDefault} />
                    <span>
                      <strong>{t.contentEditor.listed}</strong>
                    </span>
                  </label>
                  <ProblemContentOptions
                    initialIsExercise={sourceProblem?.isExercise ?? isExerciseByDefault}
                    initialShowRelatedProblems={
                      sourceProblem?.showRelatedProblems ?? !isExerciseByDefault
                    }
                    labels={{
                      exercise: t.contentEditor.exercise,
                      exerciseHelp: t.contentEditor.exerciseHelp,
                      showRelatedProblems: t.contentEditor.showRelatedProblems,
                      showRelatedProblemsHelp: t.contentEditor.showRelatedProblemsHelp
                    }}
                  />
                  <ProblemVerificationFields
                    initialMode={sourceProblem?.verificationMode}
                    initialPrompt={sourceProblem?.verificationPrompt ?? ""}
                    initialAnswer={sourceProblem?.verificationAnswer ?? ""}
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
                </section>

                <section className="problem-compose-subsection">
                  <h2>{t.contentEditor.relatedProblems}</h2>
                  <ProblemRelationPicker />
                </section>
            </ProblemDetailsDisclosure>
          </div>

          {sourceProblem && !targetTranslationLanguage && (
            <p className="quality-banner quality-needs-work text-sm" role="status">
              {t.contentEditor.allProblemLanguagesExist}
            </p>
          )}
        </ProblemCreateForm>
      </div>
      {sourceProblem && (
        <TranslationReferencePanel
          href={`/problems/${sourceProblem.slug}`}
          idPrefix="problem-translation-source"
          title={sourceProblem.title}
          language={sourceProblem.language}
          markdown={sourceProblem.bodyMarkdown}
        />
      )}
    </div>
    </ForestPageLayout>
  );
}
