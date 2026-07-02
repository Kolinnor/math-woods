import { createConceptAction } from "@/lib/actions/concept-actions";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireDraftSession } from "@/lib/draft-session";
import { PROBLEM_DOMAINS } from "@/lib/domains";
import { contentLanguageLabel, parseContentLanguage } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function NewConceptPage({
  searchParams
}: {
  searchParams: Promise<{ title?: string; translateOf?: string; language?: string; draft?: string }>;
}) {
  await requireVerifiedUser();
  const queryParams = await searchParams;
  const draftSession = requireDraftSession("/concepts/new", queryParams);
  const { title = "", translateOf = "", language = "" } = queryParams;
  const preferredLanguage = await getPreferredContentLanguage();
  const initialLanguage = language ? parseContentLanguage(language) : preferredLanguage;
  const sourceConcept = translateOf
    ? await prisma.concept.findUnique({
        where: { slug: translateOf },
        select: { slug: true, title: true, bodyMarkdown: true, language: true, translationGroupId: true }
      })
    : null;
  const defaultContent =
    sourceConcept?.bodyMarkdown ??
    "## Intuitive definition\n\nTo be completed.\n\n## Formal definition\n\nTo be completed with LaTeX.\n\n## Examples\n\n- Example linked to [[polynomial]].";

  return (
    <div className={sourceConcept ? "translation-compose-page" : "mx-auto max-w-3xl"}>
      <div className="translation-compose-main">
        <h1 className="mb-2 text-2xl font-bold">New concept</h1>
        <p className="muted mb-5">
          A stub can be useful: name the idea, add a link, cite one source.
        </p>

        <form action={createConceptAction} className="panel grid gap-4 p-5">
        {sourceConcept && <input type="hidden" name="translationGroupId" value={sourceConcept.translationGroupId} />}
        <div className="growth-note">
          <strong>Start small.</strong>
          <span>
            A definition, one example, or one reliable reference is enough for a first version.
          </span>
        </div>
        {sourceConcept && (
          <div className="playlist-context-note">
            <strong>Translating from {contentLanguageLabel(sourceConcept.language)}.</strong>
            <span>
              This will create a separate {contentLanguageLabel(initialLanguage)} page linked to "{sourceConcept.title}".
            </span>
          </div>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={sourceConcept?.title ?? title} placeholder="Vieta Relations" />
        </label>
        <LanguageField
          defaultValue={initialLanguage}
          help="Each translation is its own page. Missing translations are not shown as existing pages."
        />
        <div className="grid gap-4">
          <ProblemDomainPicker
            domains={PROBLEM_DOMAINS}
            helpText={null}
            initialValues={["OTHER"]}
            inputName="domain"
            label="Domain"
            maxDomains={1}
            showSpoilerToggle={false}
          />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Aliases</span>
            <input name="aliases" placeholder="Vieta's formulas, Viète relations" />
          </label>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Content</span>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={defaultContent}
            draftKey={`concept:new:${draftSession}:body`}
          />
        </div>
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
      {sourceConcept && (
        <TranslationReferencePanel
          title={sourceConcept.title}
          language={sourceConcept.language}
          markdown={sourceConcept.bodyMarkdown}
        />
      )}
    </div>
  );
}
