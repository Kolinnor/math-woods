import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPreviewButton } from "@/components/ContentPreviewButton";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserName } from "@/components/UserName";
import { deleteProofAction, updateProofAction } from "@/lib/actions/proof-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { canEditSolution } from "@/lib/permissions";
import { ConfirmSubmitButton } from "@/app/settings/ConfirmSubmitButton";
import { LanguageField } from "@/components/LanguageField";
import { getInterfaceLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function EditProofPage({
  params
}: {
  params: Promise<{ slug: string; proofId: string }>;
}) {
  const user = await requireVerifiedUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const { slug, proofId } = await params;
  const id = Number(proofId);
  if (!Number.isInteger(id)) notFound();

  const proof = await prisma.problemProof.findUnique({
    where: { id },
    include: {
      author: {
        select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true }
      },
      problem: { select: { title: true, slug: true } }
    }
  });

  if (!proof || proof.problem.slug !== slug) notFound();
  if (!canEditSolution(user, proof)) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-2xl font-bold">{t.problemDetail.editSolution}</h1>
          <p className="muted">
            {t.problemDetail.solutionBy} <UserName user={proof.author} /> ·{" "}
            <Link href={`/problems/${proof.problem.slug}`} className="underline">
              <AsyncMarkdownInline markdown={proof.problem.title} />
            </Link>
          </p>
        </div>
        <Link href={`/problems/${proof.problem.slug}`} className="button secondary">
          {t.problemDetail.viewProblem}
        </Link>
      </div>

      <form action={updateProofAction.bind(null, proof.id, proof.problem.slug)} className="panel grid gap-4 p-5">
        <LanguageField defaultValue={proof.language} label={interfaceLocale === "fr" ? "Langue de la solution" : "Solution language"} />
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t.problemDetail.solution}</span>
          <MarkdownEditor name="bodyMarkdown" initialValue={proof.bodyMarkdown} minHeight="18rem" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit">{t.problemDetail.saveSolution}</button>
          <ContentPreviewButton contentType="solution" locale={interfaceLocale} />
          <Link href={`/problems/${proof.problem.slug}`} className="button secondary">
            {t.problemDetail.cancel}
          </Link>
        </div>
      </form>

      <section className="danger-zone mt-6">
        <div>
          <h2>{t.problemDetail.deleteSolution}</h2>
          <p>{t.problemDetail.deleteSolutionDescription}</p>
        </div>
        <form action={deleteProofAction.bind(null, proof.id, proof.problem.slug)}>
          <ConfirmSubmitButton className="danger" message={t.problemDetail.deleteSolutionConfirm}>
            {t.problemDetail.deleteSolution}
          </ConfirmSubmitButton>
        </form>
      </section>
    </div>
  );
}
