import Link from "next/link";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { RevisionDiff } from "@/components/RevisionDiff";
import { UserName } from "@/components/UserName";
import {
  approveConceptEditProposalAction,
  rejectConceptEditProposalAction
} from "@/lib/actions/concept-actions";
import { requireAdmin } from "@/lib/auth";
import {
  CONCEPT_SNAPSHOT_FIELD_LABELS,
  buildConceptRevisionSnapshot,
  changedConceptSnapshotFields,
  conceptRevisionSnapshotInclude,
  formatConceptSnapshotFieldValue,
  parseConceptRevisionSnapshot
} from "@/lib/concept-revisions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ConceptEditProposalPage({
  params,
  searchParams
}: {
  params: Promise<{ proposalId: string }>;
  searchParams?: Promise<{ conflict?: string }>;
}) {
  await requireAdmin();
  const proposalId = Number((await params).proposalId);
  const query = searchParams ? await searchParams : {};
  if (!Number.isInteger(proposalId) || proposalId <= 0) notFound();

  const proposal = await prisma.conceptEditProposal.findUnique({
    where: { id: proposalId },
    include: {
      proposer: true,
      reviewedBy: true,
      concept: { include: conceptRevisionSnapshotInclude }
    }
  });
  if (!proposal) notFound();

  const proposed = parseConceptRevisionSnapshot(proposal.snapshot);
  const base = parseConceptRevisionSnapshot(proposal.baseSnapshot);
  if (!proposed || !base) notFound();
  const current = buildConceptRevisionSnapshot(proposal.concept);
  const changedSnapshotFields = changedConceptSnapshotFields(current, proposed);
  const changedFields = changedSnapshotFields.map((field) => CONCEPT_SNAPSHOT_FIELD_LABELS[field]);
  const metadataFields = changedSnapshotFields.filter((field) => field !== "bodyMarkdown");
  const stale = changedConceptSnapshotFields(base, current).length > 0;

  return (
    <ForestPageLayout
      title="Review proposed concept edit"
      eyebrow={<AsyncMarkdownInline markdown={proposal.concept.title} />}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Compare the public concept with the contributor's proposed version before publishing anything."
      actions={
        <Link href={`/concepts/${proposal.concept.slug}`} className="button secondary">
          View public concept
        </Link>
      }
    >
      <section className="panel grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p>Proposed by <UserName user={proposal.proposer} /></p>
            <p className="muted text-sm">Status: {proposal.status.toLowerCase()}</p>
          </div>
          {proposal.editSummary && <p className="max-w-xl text-sm"><strong>Summary:</strong> {proposal.editSummary}</p>}
        </div>

        {query.conflict === "1" && (
          <p className="quality-banner quality-needs-work" role="alert">
            The public concept changed while this proposal was waiting. Nothing was overwritten; ask the contributor to submit a new proposal from the latest version.
          </p>
        )}
        {stale && query.conflict !== "1" && (
          <p className="quality-banner quality-unreviewed" role="status">
            The public concept has changed since this proposal was submitted. Approval is blocked to protect the newer changes.
          </p>
        )}

        <div>
          <strong>Changed fields</strong>
          <p className="muted mt-1">{changedFields.length ? changedFields.join(", ") : "No remaining differences from the public version."}</p>
        </div>

        <RevisionDiff
          afterMarkdown={proposed.bodyMarkdown}
          beforeMarkdown={current.bodyMarkdown}
          beforeRevisionId={proposal.id}
          defaultOpen
          revisionId={proposal.id}
          labels={{
            compareWith: () => "Compare with current public text",
            changedLines: (count) => `${count} changed lines`,
            noTextChanges: "No text changes",
            diffAria: () => "Proposed concept text diff"
          }}
        />

        {metadataFields.length > 0 && (
          <div className="grid gap-3">
            <h2 className="font-semibold">Other changes</h2>
            {metadataFields.map((field) => (
              <div key={field} className="grid gap-2 rounded border border-line p-3 md:grid-cols-[10rem_1fr_1fr]">
                <strong>{CONCEPT_SNAPSHOT_FIELD_LABELS[field]}</strong>
                <div>
                  <small className="muted block">Public now</small>
                  <span className="break-words">
                    {field === "title"
                      ? <AsyncMarkdownInline markdown={formatConceptSnapshotFieldValue(field, current[field])} />
                      : formatConceptSnapshotFieldValue(field, current[field])}
                  </span>
                </div>
                <div>
                  <small className="muted block">Proposed</small>
                  <span className="break-words">
                    {field === "title"
                      ? <AsyncMarkdownInline markdown={formatConceptSnapshotFieldValue(field, proposed[field])} />
                      : formatConceptSnapshotFieldValue(field, proposed[field])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {proposal.status === "PENDING" ? (
          <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
            <form action={approveConceptEditProposalAction.bind(null, proposal.id)}>
              <button type="submit" disabled={stale || changedFields.length === 0} className="w-full">
                Approve and publish
              </button>
            </form>
            <form action={rejectConceptEditProposalAction.bind(null, proposal.id)} className="grid gap-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium">Reason (optional)</span>
                <textarea name="reviewNote" className="compact-textarea" placeholder="Explain what should be changed before resubmitting." />
              </label>
              <button type="submit" className="danger">Reject proposal</button>
            </form>
          </div>
        ) : (
          <p className="muted">
            This proposal was {proposal.status.toLowerCase()}
            {proposal.reviewedBy ? <> by <UserName user={proposal.reviewedBy} /></> : null}.
          </p>
        )}
      </section>
    </ForestPageLayout>
  );
}
