import { createProblemAction } from "@/lib/actions/problem-actions";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { ProblemRelationPicker } from "@/components/ProblemRelationPicker";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { requireVerifiedUser } from "@/lib/auth";
import { MATH_DOMAINS } from "@/lib/domains";
import { prisma } from "@/lib/db";
import { requireDraftSession } from "@/lib/draft-session";
import { contentLanguageLabel, parseContentLanguage } from "@/lib/languages";
import { VERIFICATION_MODE_LABELS } from "@/lib/problem-verification";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function NewProblemPage({
  searchParams
}: {
  searchParams: Promise<{
    playlist?: string;
    listed?: string;
    parent?: string;
    translateOf?: string;
    language?: string;
    draft?: string;
  }>;
}) {
  await requireVerifiedUser();
  const queryParams = await searchParams;
  const draftSession = requireDraftSession("/problems/new", queryParams);
  const { playlist = "", listed = "1", parent = "", translateOf = "", language = "" } = queryParams;
  const preferredLanguage = await getPreferredContentLanguage();
  const initialLanguage = language ? parseContentLanguage(language) : preferredLanguage;
  const isListedByDefault = listed !== "0";
  const parentProblem = parent
    ? await prisma.problem.findUnique({
        where: { slug: parent },
        select: { slug: true, title: true }
      })
    : null;
  const sourceProblem = translateOf
    ? await prisma.problem.findUnique({
        where: { slug: translateOf },
        select: { slug: true, title: true, bodyMarkdown: true, language: true, translationGroupId: true }
      })
    : null;
  const defaultStatement =
    sourceProblem?.bodyMarkdown ??
    "Write the problem statement here.\n\nYou can use Markdown for structure:\n- bullet points\n- **bold text** and *italic text*\n- links to concepts with [[concept name]]\n\nYou can use LaTeX with $x^2+1$ for inline formulas, or with $$\\sum_{k=1}^n k = \\frac{n(n+1)}{2}$$ for displayed formulas.";

  return (
    <div className={sourceProblem ? "translation-compose-page" : "mx-auto max-w-3xl"}>
      <div className="translation-compose-main">
        <h1 className="mb-2 text-2xl font-bold">New problem</h1>
        <p className="muted mb-5">
          A short, clear statement is enough.
        </p>

        <form action={createProblemAction} className="panel grid gap-4 p-5">
        {playlist && <input type="hidden" name="addToPlaylistSlug" value={playlist} />}
        {parentProblem && <input type="hidden" name="parentProblemSlug" value={parentProblem.slug} />}
        {sourceProblem && <input type="hidden" name="translationGroupId" value={sourceProblem.translationGroupId} />}
        <div className="growth-note">
          <strong>Start small.</strong>
          <span>
            Add what you know. Mark what is uncertain. Others can discuss, edit, report, or add solutions.
          </span>
        </div>
        {playlist && (
          <div className="playlist-context-note">
            <strong>Creating for a playlist.</strong>
            <span>
              This problem will be added to the playlist. Keep it listed if it can stand alone. Unlist it if it needs
              this playlist's context.
            </span>
          </div>
        )}
        {parentProblem && (
          <div className="playlist-context-note">
            <strong>Specific to another problem.</strong>
            <span>
              This will be linked from "{parentProblem.title}". Keep it unlisted if it is mainly a local variation,
              warm-up, or helper exercise.
            </span>
          </div>
        )}
        {sourceProblem && (
          <div className="playlist-context-note">
            <strong>Translating from {contentLanguageLabel(sourceProblem.language)}.</strong>
            <span>
              This will create a separate {contentLanguageLabel(initialLanguage)} page linked to "{sourceProblem.title}".
            </span>
          </div>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={sourceProblem?.title ?? ""} placeholder="Roots and coefficients" />
        </label>
        <LanguageField
          defaultValue={initialLanguage}
          help="Each translation is its own page. If English has not been written, there is no English version yet."
        />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Statement</span>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={defaultStatement}
            draftKey={`problem:new:${draftSession}:statement`}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProblemDomainPicker domains={MATH_DOMAINS} initialValues={["OTHER"]} />
          <label className="problem-difficulty-field grid gap-2">
            <span className="text-sm font-medium">Difficulty (1–100)</span>
            <input name="difficulty" type="number" min="1" max="100" placeholder="50" />
          </label>
        </div>
        <label className="checkbox-field">
          <input name="listed" type="checkbox" defaultChecked={isListedByDefault} />
          <span>
            <strong>Listed in the problem browser</strong>
            <small>
              Keep this on for problems that are reusable on their own. Turn it off for local steps or variations tied to a playlist or another problem.
            </small>
          </span>
        </label>
        <fieldset className="origin-fields grid gap-4">
          <legend className="font-semibold">Problem origin</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Approximate origin</span>
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
            <span className="text-sm font-medium">Provenance note</span>
            <textarea
              className="compact-textarea"
              name="originNote"
              placeholder="It seems this problem first appeared in..."
            />
          </label>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Tags</span>
          <input name="tags" placeholder="polynomials, roots, algebra" />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Spoiler tags</span>
          <input name="spoilerTags" placeholder="Trick question, induction, Cauchy-Schwarz" />
          <small className="muted">
            Hidden until a user marks the problem solved. They can still be searched from the problem browser.
          </small>
        </label>
        <label className="checkbox-field">
          <input name="conjecture" type="checkbox" />
          <span>
            <strong>Conjecture</strong>
            <small>No solution is currently known or supplied.</small>
          </span>
        </label>
        <ProblemRelationPicker />
        <fieldset className="origin-fields grid gap-4">
          <legend className="font-semibold">Solve verification</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Verification mode</span>
            <select name="verificationMode" defaultValue="NONE">
              {Object.entries(VERIFICATION_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Verification question</span>
            <input name="verificationPrompt" placeholder="For example: What is the last letter of the answer?" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Expected short answer</span>
            <input name="verificationAnswer" placeholder="Used only for short answer check" />
          </label>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Initial solution (optional)</span>
          <MarkdownEditor
            name="proofMarkdown"
            initialValue=""
            minHeight="11rem"
            draftKey={`problem:new:${draftSession}:initial-solution`}
          />
        </label>
        <p className="muted text-sm">
          Make sure you can share this wording.{" "}
          <a href="/about#creating-problems" className="help-link" aria-label="Read problem creation guidance">
            ?
          </a>
        </p>
          <button type="submit">Publish</button>
        </form>
      </div>
      {sourceProblem && (
        <TranslationReferencePanel
          title={sourceProblem.title}
          language={sourceProblem.language}
          markdown={sourceProblem.bodyMarkdown}
        />
      )}
    </div>
  );
}
