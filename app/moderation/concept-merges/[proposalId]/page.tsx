import { ConceptMergeKind, ConceptMergeStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import {
  linkConceptTranslationGroupsAction,
  mergeDuplicateConceptsAction,
  rejectConceptMergeProposalAction
} from "@/lib/actions/concept-merge-actions";
import { requireModerator } from "@/lib/auth";
import { overlappingConceptLanguages } from "@/lib/concept-merge";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ConceptMergeReviewPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const user = await requireModerator();
  const proposalId = Number((await params).proposalId);
  if (!Number.isInteger(proposalId) || proposalId <= 0) notFound();
  const proposal = await prisma.conceptMergeProposal.findUnique({
    where: { id: proposalId },
    include: { proposedBy: true, reviewedBy: true }
  });
  if (!proposal) notFound();

  const [source, target] = await Promise.all([
    prisma.concept.findUnique({ where: { id: proposal.sourceConceptId } }),
    prisma.concept.findUnique({ where: { id: proposal.targetConceptId } })
  ]);
  const groupIds = [...new Set([
    source?.translationGroupId ?? proposal.sourceTranslationGroupId,
    target?.translationGroupId ?? proposal.targetTranslationGroupId
  ])];
  const familyConcepts = await prisma.concept.findMany({
    where: { translationGroupId: { in: groupIds } },
    orderBy: [{ language: "asc" }, { createdAt: "asc" }]
  });
  const sourceFamily = source
    ? familyConcepts.filter((concept) => concept.translationGroupId === source.translationGroupId)
    : [];
  const targetFamily = target
    ? familyConcepts.filter((concept) => concept.translationGroupId === target.translationGroupId)
    : [];
  const overlap = source && target && source.translationGroupId !== target.translationGroupId
    ? overlappingConceptLanguages(sourceFamily, targetFamily)
    : [];
  const collisionConceptIds = overlap.flatMap((language) => [
    sourceFamily.find((concept) => concept.language === language)?.id,
    targetFamily.find((concept) => concept.language === language)?.id
  ]).filter((id): id is number => Boolean(id));
  const collisionProposals = collisionConceptIds.length > 0
    ? await prisma.conceptMergeProposal.findMany({
        where: {
          status: ConceptMergeStatus.PENDING,
          kind: ConceptMergeKind.DUPLICATE,
          sourceConceptId: { in: collisionConceptIds },
          targetConceptId: { in: collisionConceptIds }
        },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const canExecute = canUseAdminTools(user) && proposal.status === ConceptMergeStatus.PENDING;
  const invalid = !source || !target;

  return (
    <ForestPageLayout
      eyebrow="Concept moderation"
      title={proposal.kind === ConceptMergeKind.DUPLICATE ? "Merge duplicate concepts" : "Link concept translations"}
      description="Review both pages and their translation families before applying an irreversible content merge. Old URLs and histories are preserved."
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      actions={<Link href="/moderation" className="button secondary">Back to moderation</Link>}
    >
      <section className="panel mb-5 p-4">
        <p className="muted text-sm">
          Proposed by <UserName user={proposal.proposedBy} /> · {proposal.status.toLowerCase()}
        </p>
        {proposal.reason && <p className="mt-2">{proposal.reason}</p>}
        {proposal.reviewedBy && <p className="muted mt-2 text-sm">Reviewed by <UserName user={proposal.reviewedBy} /></p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { concept: source, title: proposal.sourceTitle, slug: proposal.sourceSlug, language: proposal.sourceLanguage },
          { concept: target, title: proposal.targetTitle, slug: proposal.targetSlug, language: proposal.targetLanguage }
        ].map((entry, index) => (
          <article key={index} className="panel p-5">
            <p className="eyebrow">Page {index + 1} · {entry.language}</p>
            <h2 className="mb-2 text-lg font-semibold"><AsyncMarkdownInline markdown={entry.concept?.title ?? entry.title} /></h2>
            {entry.concept ? (
              <>
                <Link href={`/concepts/${entry.concept.slug}`} className="underline">/{entry.concept.slug}</Link>
                <div className="mt-4 max-h-80 overflow-auto border-t border-line pt-4">
                  <MarkdownBlock html={entry.concept.bodyHtml} />
                </div>
              </>
            ) : <p className="quality-banner quality-needs-work">This page no longer exists.</p>}
          </article>
        ))}
      </div>

      {proposal.status === ConceptMergeStatus.COMPLETED && (
        <p className="quality-banner quality-usable mt-5">This proposal has been completed.</p>
      )}
      {invalid && proposal.status === ConceptMergeStatus.PENDING && (
        <p className="quality-banner quality-needs-work mt-5">The proposal is stale because one page no longer exists.</p>
      )}

      {proposal.kind === ConceptMergeKind.TRANSLATION_LINK && source && target && (
        <section className="panel mt-5 p-5">
          <h2 className="mb-3 font-semibold">Translation-family check</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>{sourceFamily.map((concept) => concept.language).join(", ")}</p>
            <p>{targetFamily.map((concept) => concept.language).join(", ")}</p>
          </div>
          {overlap.length > 0 ? (
            <div className="quality-banner quality-needs-work mt-4">
              <p>Resolve the duplicate pages in these languages first: {overlap.join(", ")}.</p>
              {collisionProposals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {collisionProposals.map((collision) => (
                    <Link
                      key={collision.id}
                      href={`/moderation/concept-merges/${collision.id}` as never}
                      className="button secondary"
                    >
                      Review {collision.sourceLanguage}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : canExecute ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <form action={linkConceptTranslationGroupsAction.bind(null, proposal.id, source.id)}>
                <button type="submit" className="w-full">
                  Link using <AsyncMarkdownInline markdown={source.title} /> metadata
                </button>
              </form>
              <form action={linkConceptTranslationGroupsAction.bind(null, proposal.id, target.id)}>
                <button type="submit" className="w-full">
                  Link using <AsyncMarkdownInline markdown={target.title} /> metadata
                </button>
              </form>
            </div>
          ) : null}
        </section>
      )}

      {proposal.kind === ConceptMergeKind.DUPLICATE && source && target && canExecute && (
        <section className="mt-6">
          <h2 className="mb-3 font-semibold">Choose the surviving page and final content</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {[source, target].map((survivor) => (
              <form
                key={survivor.id}
                action={mergeDuplicateConceptsAction.bind(null, proposal.id, survivor.id)}
                className="panel grid gap-3 p-5"
              >
                <p className="font-semibold">Keep /{survivor.slug}</p>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Final title</span>
                  <input name="title" defaultValue={survivor.title} maxLength={160} required />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Final Markdown content</span>
                  <textarea name="bodyMarkdown" defaultValue={survivor.bodyMarkdown} rows={20} maxLength={60000} required />
                </label>
                <button type="submit">Merge into this page</button>
              </form>
            ))}
          </div>
        </section>
      )}

      {canExecute && (
        <form action={rejectConceptMergeProposalAction.bind(null, proposal.id)} className="mt-5">
          <button type="submit" className="secondary">Reject proposal</button>
        </form>
      )}
    </ForestPageLayout>
  );
}
