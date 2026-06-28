import { notFound } from "next/navigation";
import { ConceptStatus } from "@prisma/client";
import { LanguageField } from "@/components/LanguageField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { updateConceptAction } from "@/lib/actions/concept-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MATH_DOMAINS } from "@/lib/domains";
import { canEditConcept, canSetConceptStatus } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: { aliases: true, references: { orderBy: { position: "asc" } } }
  });

  if (!concept) notFound();
  if (!canEditConcept(user, concept)) notFound();
  const canSetStubStatus = canSetConceptStatus(user.role, ConceptStatus.STUB);
  const canSetUsableStatus = canSetConceptStatus(user.role, ConceptStatus.USABLE);
  const canSetReviewedStatus = canSetConceptStatus(user.role, ConceptStatus.REVIEWED);
  const canSetExcellentStatus = canSetConceptStatus(user.role, ConceptStatus.EXCELLENT);
  const canSetControversialStatus = canSetConceptStatus(user.role, ConceptStatus.CONTROVERSIAL);
  const canSetCurrentStatus = canSetConceptStatus(user.role, concept.status);
  const canSetAnyStatus =
    canSetCurrentStatus &&
    (canSetStubStatus ||
      canSetUsableStatus ||
      canSetReviewedStatus ||
      canSetExcellentStatus ||
      canSetControversialStatus);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Edit concept</h1>
      <p className="muted mb-5">Changes create a revision and refresh outgoing links automatically.</p>

      <form action={updateConceptAction.bind(null, concept.id)} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={concept.title} />
        </label>
        <LanguageField
          defaultValue={concept.language}
          help="Changing this moves the page to another language inside the same translation group."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Domain</span>
            <select name="domain" defaultValue={concept.domain}>
              {MATH_DOMAINS.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Aliases</span>
            <input name="aliases" defaultValue={concept.aliases.map((alias) => alias.alias).join(", ")} />
          </label>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Content</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={concept.bodyMarkdown} />
        </label>
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
        <label className="grid gap-2">
          <span className="text-sm font-medium">Edit summary</span>
          <input name="editSummary" placeholder="Added example, clarified definition..." />
        </label>
        <button type="submit">Save changes</button>
      </form>
    </div>
  );
}
