import { notFound } from "next/navigation";
import { ConceptStatus, SourceType } from "@prisma/client";
import { DeleteConceptButton } from "@/components/DeleteConceptButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { OrderedProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { ProblemDomainPicker } from "@/components/ProblemDomainPicker";
import { TranslationReferencePanel } from "@/components/TranslationReferencePanel";
import { deleteConceptAction, updateConceptAction } from "@/lib/actions/concept-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { MAX_CONCEPT_EXERCISES } from "@/lib/concept-exercises";
import { prisma } from "@/lib/db";
import { PROBLEM_DOMAINS, translatedDomainLabel, translatedDomainOptions } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canChangeConceptStatus, canDeleteConcept, canEditConcept, canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const { slug } = await params;
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

  if (!concept) notFound();
  if (!canEditConcept(user, concept)) notFound();
  const canFeatureConcept = canUseAdminTools(user);
  const canDeleteCurrentConcept = canDeleteConcept(user, concept);
  const canSetStubStatus = canChangeConceptStatus(user, concept, ConceptStatus.STUB);
  const canSetUsableStatus = canChangeConceptStatus(user, concept, ConceptStatus.USABLE);
  const canSetReviewedStatus = canChangeConceptStatus(user, concept, ConceptStatus.REVIEWED);
  const canSetExcellentStatus = canChangeConceptStatus(user, concept, ConceptStatus.EXCELLENT);
  const canSetControversialStatus = canChangeConceptStatus(user, concept, ConceptStatus.CONTROVERSIAL);
  const canSetCurrentStatus = canChangeConceptStatus(user, concept, concept.status);
  const canSetAnyStatus =
    canSetCurrentStatus &&
    (canSetStubStatus ||
      canSetUsableStatus ||
      canSetReviewedStatus ||
      canSetExcellentStatus ||
      canSetControversialStatus);
  const [siblingTranslations, sourceRevision] = await Promise.all([
    prisma.concept.findMany({
      where: {
        translationGroupId: concept.translationGroupId,
        id: { not: concept.id }
      },
      select: { language: true }
    }),
    concept.translatedFromConceptId
      ? prisma.pageRevision.findFirst({
          where: { pageType: SourceType.CONCEPT, pageId: concept.translatedFromConceptId },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      : null
  ]);
  const staleTranslation = Boolean(
    sourceRevision && concept.translatedFromRevisionId && sourceRevision.id > concept.translatedFromRevisionId
  );
  const initialExercises: TipPickerProblem[] = concept.practiceExercises.map(({ problem }) => ({
    id: problem.id,
    title: problem.title,
    slug: problem.slug,
    domainLabel: translatedDomainLabel(problem.domain, t.home.domainLabels),
    difficulty: problem.difficulty
  }));

  return (
    <ForestPageLayout
      title="Edit concept"
      eyebrow={concept.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description="Changes create a revision and refresh outgoing links automatically."
      workspaceClassName={concept.translatedFromConcept ? undefined : "forest-page-workspace-narrow"}
    >
      <div className={concept.translatedFromConcept ? "translation-compose-page" : ""}>
      <div className="translation-compose-main">
      <form action={updateConceptAction.bind(null, concept.id)} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={concept.title} />
        </label>
        <LanguageField
          defaultValue={concept.language}
          disabledValues={siblingTranslations.map((translation) => translation.language)}
          help="Changing this moves the page to another language inside the same translation group."
        />
        {concept.translatedFromConcept && (
          <label className="checkbox-field">
            <input name="markTranslationFresh" type="checkbox" defaultChecked={false} />
            <span>
              <strong>Mark translation up to date</strong>
              <small>
                Source: {concept.translatedFromConcept.title}
                {staleTranslation ? ` / newer revision ${sourceRevision?.id} available` : " / no newer source revision detected"}
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
            <span className="text-sm font-medium">Aliases</span>
            <input name="aliases" defaultValue={concept.aliases.map((alias) => alias.alias).join(", ")} />
          </label>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Content</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={concept.bodyMarkdown} />
        </div>
        <details className="concept-linked-exercises-editor">
          <summary>
            <span>Linked exercises</span>
          </summary>
          <div className="concept-linked-exercises-editor-body">
            <p className="muted text-sm">
              Choose the exercises shown in the practice queue. Readers see them from easiest to hardest.
            </p>
            <OrderedProblemPicker
              initialProblems={initialExercises}
              inputName="exerciseIds"
              maxProblems={MAX_CONCEPT_EXERCISES}
              searchParams="exercise=1"
              labels={{
                empty: "No exercises selected.",
                maximumSelected: "Maximum {maximum} exercises selected",
                noMatches: "No matching exercises.",
                remove: "Remove exercise {title}",
                search: "Search exercises",
                searchPlaceholder: "Search exercises by title or slug",
                searching: "Searching exercises..."
              }}
            />
          </div>
        </details>
        <label className="grid gap-2">
          <span className="text-sm font-medium">References</span>
          <textarea
            name="references"
            defaultValue={concept.references
              .map((reference) => [reference.title, reference.url ?? "", reference.note ?? ""].join(" | "))
              .join("\n")}
          />
        </label>
        {canSetAnyStatus && (
          <label className="grid gap-2">
            <span className="text-sm font-medium">Status</span>
            <select name="status" defaultValue={concept.status}>
              {canSetStubStatus && <option value="STUB">Stub</option>}
              {canSetUsableStatus && <option value="USABLE">Usable</option>}
              {canSetReviewedStatus && <option value="REVIEWED">Reviewed</option>}
              {canSetExcellentStatus && <option value="EXCELLENT">Excellent</option>}
              {canSetControversialStatus && <option value="CONTROVERSIAL">Controversial</option>}
            </select>
          </label>
        )}
        {canFeatureConcept && (
          <label className="checkbox-field">
            <input
              name="canAppearInConceptBrowser"
              type="checkbox"
              defaultChecked={concept.canAppearInConceptBrowser}
            />
            <span>
              <strong>Can be featured in the concept browser</strong>
              <small>Show this concept in the featured concepts panel on the Concepts page.</small>
            </span>
          </label>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">Edit summary</span>
          <input name="editSummary" placeholder="Added example, clarified definition..." />
        </label>
        <button type="submit">Save changes</button>
      </form>

      {canDeleteCurrentConcept && (
        <section className="danger-zone mt-6">
          <div>
            <h2>Delete concept</h2>
            <p>This permanently removes the concept page. Links pointing to it will become missing concept links.</p>
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
          latestRevisionId={sourceRevision?.id ?? null}
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
