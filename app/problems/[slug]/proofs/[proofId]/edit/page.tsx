import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { deleteProofAction, updateProofAction } from "@/lib/actions/proof-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canModerate } from "@/lib/roles";
import { displayNameForUser } from "@/lib/user-display";
import { ConfirmSubmitButton } from "@/app/settings/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function EditProofPage({
  params
}: {
  params: Promise<{ slug: string; proofId: string }>;
}) {
  const user = await requireVerifiedUser();
  const { slug, proofId } = await params;
  const id = Number(proofId);
  if (!Number.isInteger(id)) notFound();

  const proof = await prisma.problemProof.findUnique({
    where: { id },
    include: {
      author: { select: { username: true, displayName: true } },
      problem: { select: { title: true, slug: true } }
    }
  });

  if (!proof || proof.problem.slug !== slug) notFound();
  if (proof.authorId !== user.id && !canModerate(user.role)) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-2xl font-bold">Edit proof</h1>
          <p className="muted">
            Proof by {displayNameForUser(proof.author)} for{" "}
            <Link href={`/problems/${proof.problem.slug}`} className="underline">
              {proof.problem.title}
            </Link>
            .
          </p>
        </div>
        <Link href={`/problems/${proof.problem.slug}`} className="button secondary">
          View problem
        </Link>
      </div>

      <form action={updateProofAction.bind(null, proof.id, proof.problem.slug)} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Proof</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={proof.bodyMarkdown} minHeight="18rem" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit">Save proof</button>
          <Link href={`/problems/${proof.problem.slug}`} className="button secondary">
            Cancel
          </Link>
        </div>
      </form>

      <section className="danger-zone mt-6">
        <div>
          <h2>Delete proof</h2>
          <p>This removes the proof and its comments from the problem.</p>
        </div>
        <form action={deleteProofAction.bind(null, proof.id, proof.problem.slug)}>
          <ConfirmSubmitButton className="danger" message="Delete this proof? This cannot be undone.">
            Delete proof
          </ConfirmSubmitButton>
        </form>
      </section>
    </div>
  );
}
