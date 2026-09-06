import Link from "next/link";
import { notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewProblem } from "@/lib/problem-visibility";
import { canEditProblem } from "@/lib/permissions";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { ReferenceProposalForm } from "@/components/ReferenceProposalForm";

export default async function ProposeReferencePage({ searchParams }: { searchParams: Promise<{ problem?: string; concept?: string; citation?: string }> }) {
  const [user, locale, query] = await Promise.all([requireVerifiedUser(), getInterfaceLocale(), searchParams]);
  if (query.concept) {
    const concept = await prisma.concept.findUnique({ where: { slug: query.concept }, include: { libraryReferences: true } });
    const citation = concept?.libraryReferences.find(item => item.citationKey === query.citation && !item.referenceId);
    if (!concept || !citation) notFound();
    return <div className="mx-auto max-w-2xl">
      <h1>{locale === "fr" ? "Proposer une référence au catalogue" : "Propose a catalogue reference"}</h1>
      <Link href={`/concepts/${concept.slug}`}>{locale === "fr" ? "Retour au concept" : "Back to concept"}</Link>
      <ReferenceProposalForm text={citation.text} url={citation.url} locale={locale} />
    </div>;
  }
  const problem = await prisma.problem.findUnique({ where: { slug: query.problem ?? "" }, include: { libraryReferences: true } });
  if (!problem || !canViewProblem(user, problem)) notFound();
  const citation = problem.libraryReferences.find((item) => item.citationKey === query.citation && !item.referenceId);
  if (!citation) notFound();
  if (citation.spoiler && !canEditProblem(user, problem)) {
    const solved = await prisma.problemAttempt.findFirst({ where: { userId: user.id, status: "SOLVED", problem: { translationGroupId: problem.translationGroupId } } });
    if (!solved) notFound();
  }
  return <div className="mx-auto max-w-2xl">
    <h1>{locale === "fr" ? "Proposer une référence au catalogue" : "Propose a catalogue reference"}</h1>
    <Link href={`/problems/${problem.slug}`}>{locale === "fr" ? "Retour au problème" : "Back to problem"}</Link>
    <ReferenceProposalForm text={citation.text} url={citation.url} locale={locale} />
  </div>;
}
