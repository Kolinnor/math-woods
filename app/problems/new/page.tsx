import { createProblemAction } from "@/lib/actions/problem-actions";
import { FieldHelp } from "@/components/FieldHelp";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDifficultyField } from "@/components/ProblemDifficultyField";
import { ProblemDetailsDisclosure } from "@/components/ProblemDetailsDisclosure";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { ProblemRelationPicker } from "@/components/ProblemRelationPicker";
import { ProblemVerificationFields } from "@/components/ProblemVerificationFields";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { requireVerifiedUser } from "@/lib/auth";
import { PROBLEM_DOMAINS, translatedDomainOptions } from "@/lib/domains";
import { prisma } from "@/lib/db";
import { requireDraftSession } from "@/lib/draft-session";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { parseContentLanguage } from "@/lib/languages";
import { VERIFICATION_MODE_LABELS } from "@/lib/problem-verification";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { nextMissingTranslationLanguage } from "@/lib/translation-routing";

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
  }>;
}) {
  await requireVerifiedUser();
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
    exercise = ""
  } = queryParams;
  const explorationSlug = exploration || playlist;
  const preferredLanguage = await getPreferredContentLanguage();
  const requestedLanguage = language ? parseContentLanguage(language) : preferredLanguage;
  const isListedByDefault = listed !== "0";
  const isExerciseByDefault = exercise === "1" || exercise === "true";
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
          domain: true,
          domains: { orderBy: { position: "asc" } }
        }
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
  const defaultStatement = sourceProblem?.bodyMarkdown ?? "";
  const initialDomains = sourceProblem
    ? sourceProblem.domains.length
      ? sourceProblem.domains.map((item) => item.mscCode)
      : [sourceProblem.domain]
    : ["OTHER"];
  const initialDomainSpoilers = sourceProblem
    ? sourceProblem.domains.filter((item) => item.spoiler).map((item) => item.mscCode)
    : [];

  return (
    <ForestPageLayout
      title={sourceProblem ? "Translation" : "New problem"}
      eyebrow={sourceProblem ? undefined : "Problem"}
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description={
        sourceProblem
          ? undefined
          : "A clear statement and an honest difficulty estimate are enough for a first version."
      }
      workspaceClassName={sourceProblem ? undefined : "forest-page-workspace-narrow"}
    >
    <div className={sourceProblem ? "translation-compose-page" : ""}>
      <div className="translation-compose-main">
        <form action={createProblemAction} className="problem-compose-form">
          {explorationSlug && <input type="hidden" name="addToExplorationSlug" value={explorationSlug} />}
          {parentProblem && <input type="hidden" name="parentProblemSlug" value={parentProblem.slug} />}
          {sourceProblem && <input type="hidden" name="translationGroupId" value={sourceProblem.translationGroupId} />}
          {sourceProblem && <input type="hidden" name="translationSourceSlug" value={sourceProblem.slug} />}

          <section className="problem-compose-card">
            <div className="problem-compose-section-title">Essential information</div>
            {explorationSlug && <p className="muted text-sm">Creating for an exploration.</p>}
            {parentProblem && <p className="muted text-sm">Linked from "{parentProblem.title}".</p>}

            <label className="grid gap-2">
              <span className="text-sm font-medium">Title</span>
              <input name="title" defaultValue={sourceProblem?.title ?? ""} placeholder="Roots and coefficients" />
            </label>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Statement</span>
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
                help={
                  sourceProblem
                    ? "Languages already linked to this problem are disabled."
                    : "Each translation is its own page."
                }
              />
              <ProblemDifficultyField defaultValue={sourceProblem?.difficulty} />
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

          <div className="problem-compose-actions">
            <button type="submit" disabled={Boolean(sourceProblem && !targetTranslationLanguage)}>
              Publish
            </button>
            <ProblemDetailsDisclosure>
                <section className="problem-compose-subsection">
                  <h2>Origin</h2>
                  <label className="grid gap-2">
                    <span className="field-label-with-help text-sm font-medium">
                      Approximate origin
                      <FieldHelp text="Where the problem comes from, if known. Unknown is fine." />
                    </span>
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
                    <span className="field-label-with-help text-sm font-medium">
                      Provenance note
                      <FieldHelp text="Add uncertainty, publication details, or context about the source." />
                    </span>
                    <textarea className="compact-textarea" name="originNote" />
                  </label>
                </section>

                <section className="problem-compose-subsection">
                  <h2>Tags</h2>
                  <label className="grid gap-2">
                    <span className="field-label-with-help text-sm font-medium">
                      Tags
                      <FieldHelp text="Comma-separated visible tags for search and browsing." />
                    </span>
                    <input name="tags" placeholder="polynomials, roots, algebra" />
                  </label>
                  <label className="grid gap-2">
                    <span className="field-label-with-help text-sm font-medium">
                      Spoiler tags
                      <FieldHelp text="Tags hidden until the problem is solved." />
                    </span>
                    <input name="spoilerTags" placeholder="induction, Cauchy-Schwarz" />
                  </label>
                  <label className="checkbox-field">
                    <input name="conjecture" type="checkbox" />
                    <span>
                      <strong>Conjecture</strong>
                    </span>
                  </label>
                </section>

                <section className="problem-compose-subsection">
                  <h2>Publishing options</h2>
                  <label className="checkbox-field">
                    <input name="listed" type="checkbox" defaultChecked={isListedByDefault} />
                    <span>
                      <strong>Listed in the problem browser</strong>
                    </span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      name="isExercise"
                      type="checkbox"
                      defaultChecked={sourceProblem?.isExercise ?? isExerciseByDefault}
                    />
                    <div className="field-label-with-help">
                      <strong>Exercise</strong>
                      <FieldHelp text="Exercises are designed to practise a specific concept. They appear on linked concept pages and are hidden from the default problem-browser view, while remaining available through the Exercises filter." />
                    </div>
                  </label>
                  <ProblemVerificationFields modeOptions={Object.entries(VERIFICATION_MODE_LABELS)} />
                </section>

                <section className="problem-compose-subsection">
                  <h2>Related problems</h2>
                  <ProblemRelationPicker />
                </section>
            </ProblemDetailsDisclosure>
          </div>

          {sourceProblem && !targetTranslationLanguage && (
            <p className="quality-banner quality-needs-work text-sm" role="status">
              All supported languages already exist for this problem.
            </p>
          )}
        </form>
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
