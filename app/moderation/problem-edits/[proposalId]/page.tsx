import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { RevisionDiff } from "@/components/RevisionDiff";
import { UserName } from "@/components/UserName";
import {
  approveProblemEditProposalAction,
  rejectProblemEditProposalAction
} from "@/lib/actions/problem-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  PROBLEM_SNAPSHOT_FIELD_LABELS,
  buildProblemRevisionSnapshot,
  changedProblemSnapshotFields,
  formatProblemSnapshotFieldValue,
  parseProblemRevisionSnapshot
} from "@/lib/problem-revisions";

export const dynamic = "force-dynamic";

export default async function ProblemEditProposalPage({
  params,
  searchParams
}: {
  params: Promise<{ proposalId: string }>;
  searchParams?: Promise<{ conflict?: string }>;
}) {
  await requireAdmin();
  const { proposalId: rawProposalId } = await params;
  const query = searchParams ? await searchParams : {};
  const proposalId = Number(rawProposalId);
  if (!Number.isInteger(proposalId)) notFound();

  const proposal = await prisma.problemEditProposal.findUnique({
    where: { id: proposalId },
    include: {
      proposer: true,
      reviewedBy: true,
      problem: {
        include: {
          domains: { orderBy: { position: "asc" } },
          tags: { include: { tag: true } },
          spoilerTags: { include: { tag: true } },
          relatedGroups: {
            orderBy: { position: "asc" },
            include: {
              relations: {
                orderBy: { position: "asc" },
                include: { targetProblem: { select: { slug: true } } }
              }
            }
          }
        }
      }
    }
  });
  if (!proposal) notFound();

  const proposed = parseProblemRevisionSnapshot(proposal.snapshot);
  if (!proposed) notFound();
  const current = buildProblemRevisionSnapshot(proposal.problem);
  const changedSnapshotFields = changedProblemSnapshotFields(current, proposed);
  const changedFields = changedSnapshotFields.map((field) => PROBLEM_SNAPSHOT_FIELD_LABELS[field]);
  const metadataFields = changedSnapshotFields.filter((field) => field !== "bodyMarkdown");
  const stale = proposal.baseVersion !== proposal.problem.version;

  return (
    <ForestPageLayout
      title="Review proposed edit"
      eyebrow={proposal.problem.title}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Compare the public problem with the contributor's proposed version before publishing anything."
      actions={
        <Link href={`/problems/${proposal.problem.slug}`} className="button secondary">
          View public problem
        </Link>
      }
    >
      <section className="panel grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p>
              Proposed by <UserName user={proposal.proposer} />
            </p>
            <p className="muted text-sm">
              Status: {proposal.status.toLowerCase()} - based on version {proposal.baseVersion}, current version {proposal.problem.version}
            </p>
          </div>
          {proposal.editSummary && <p className="max-w-xl text-sm"><strong>Summary:</strong> {proposal.editSummary}</p>}
        </div>

        {query.conflict === "1" && (
          <p className="quality-banner quality-needs-work" role="alert">
            The public problem changed while this proposal was waiting. Nothing was overwritten; ask the contributor to submit a new proposal from the latest version.
          </p>
        )}
        {stale && query.conflict !== "1" && (
          <p className="quality-banner quality-unreviewed" role="status">
            The public problem has changed since this proposal was submitted. Approval will proceed only when the existing conflict checks can merge it safely.
          </p>
        )}

        <div>
          <strong>Changed fields</strong>
          <p className="muted mt-1">{changedFields.length ? changedFields.join(", ") : "No remaining differences from the public version."}</p>
        </div>

        <RevisionDiff
          afterMarkdown={proposed.bodyMarkdown}
          beforeMarkdown={current.bodyMarkdown}
          beforeRevisionId={proposal.baseVersion}
          defaultOpen
          revisionId={proposal.id}
        />

        {metadataFields.length > 0 && (
          <div className="grid gap-3">
            <h2 className="font-semibold">Other changes</h2>
            {metadataFields.map((field) => (
              <div key={field} className="grid gap-2 rounded border border-line p-3 md:grid-cols-[10rem_1fr_1fr]">
                <strong>{PROBLEM_SNAPSHOT_FIELD_LABELS[field]}</strong>
                <div>
                  <small className="muted block">Public now</small>
                  <span className="break-words">{formatProblemSnapshotFieldValue(field, current[field])}</span>
                </div>
                <div>
                  <small className="muted block">Proposed</small>
                  <span className="break-words">{formatProblemSnapshotFieldValue(field, proposed[field])}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {proposal.status === "PENDING" ? (
          <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
            <form action={approveProblemEditProposalAction.bind(null, proposal.id)}>
              <button type="submit" disabled={changedFields.length === 0} className="w-full">
                Approve and publish
              </button>
            </form>
            <form action={rejectProblemEditProposalAction.bind(null, proposal.id)} className="grid gap-2">
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
