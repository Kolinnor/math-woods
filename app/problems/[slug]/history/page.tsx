import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionDiff } from "@/components/RevisionDiff";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserName } from "@/components/UserName";
import { rollbackProblemRevisionAction } from "@/lib/actions/problem-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canRollbackProblem } from "@/lib/permissions";
import { canEditProblem } from "@/lib/permissions";
import { parseProblemRevisionSnapshot, formatProblemSnapshotFieldValue } from "@/lib/problem-revisions";

export const dynamic = "force-dynamic";

export default async function ProblemHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const [user, t, interfaceLocale] = await Promise.all([requireUser(), getTranslations(), getInterfaceLocale()]);
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({ where: { slug }, include: { libraryReferences: true } });

  if (!problem) notFound();
  const canRollback = canRollbackProblem(user, problem);
  const solved = await prisma.problemAttempt.findFirst({ where: { userId: user.id, status: "SOLVED", problem: { translationGroupId: problem.translationGroupId } }, select: { id: true } });
  const revealCitations = canEditProblem(user, problem) || Boolean(solved);
  const hiddenKeys = new Set(problem.libraryReferences.filter((item) => item.spoiler).map((item) => item.citationKey));
  const citationHistoryText = (snapshot: unknown) => {
    const parsed = parseProblemRevisionSnapshot(snapshot as Parameters<typeof parseProblemRevisionSnapshot>[0]);
    const citations = parsed?.citations;
    const originality = parsed?.isOriginal === undefined ? "" : `Original : ${parsed.isOriginal ? (interfaceLocale === "fr" ? "Oui" : "Yes") : (interfaceLocale === "fr" ? "Non" : "No")}\n`;
    return originality + formatProblemSnapshotFieldValue("citations", citations?.filter((item) => revealCitations || (!item.spoiler && !hiddenKeys.has(item.citationKey))));
  };

  const [revisions, attributionTransfers] = await Promise.all([
    prisma.pageRevision.findMany({
      where: { pageType: "PROBLEM", pageId: problem.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { editedBy: true }
    }),
    prisma.problemAttributionTransfer.findMany({
      where: { problemId: problem.id },
      orderBy: { createdAt: "desc" },
      include: { fromUser: true, toUser: true, transferredBy: true }
    })
  ]);
  for (const revision of revisions) {
    for (const citation of parseProblemRevisionSnapshot(revision.problemSnapshot)?.citations ?? []) {
      if (citation.spoiler) hiddenKeys.add(citation.citationKey);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t.historyPage.problemTitle}</h1>
          <p className="muted mt-1"><AsyncMarkdownInline markdown={problem.title} /></p>
        </div>
        <Link href={`/problems/${problem.slug}`} className="button secondary">
          {t.historyPage.back}
        </Link>
      </div>

      {attributionTransfers.length > 0 && (
        <section className="mb-6 grid gap-3">
          <h2 className="text-xl font-semibold">{t.historyPage.attributionChanges}</h2>
          {attributionTransfers.map((transfer) => (
            <article key={transfer.id} className="revision-card panel p-4">
              <p className="font-semibold">
                {t.historyPage.attributionTransferredFrom} {transfer.fromUser
                  ? <UserName user={transfer.fromUser} />
                  : transfer.fromDisplayName} {t.historyPage.attributionTransferredTo} {transfer.toUser
                  ? <UserName user={transfer.toUser} />
                  : transfer.toDisplayName}
              </p>
              <p className="muted text-sm">
                {transfer.createdAt.toLocaleString(interfaceLocale)}
                {" / "}{t.historyPage.attributionTransferredBy} {transfer.transferredBy
                  ? <UserName user={transfer.transferredBy} />
                  : transfer.transferredByDisplayName}
              </p>
              {transfer.reason && <p className="mt-3">{t.historyPage.attributionReason}: {transfer.reason}</p>}
            </article>
          ))}
        </section>
      )}

      <div className="grid gap-3">
        {revisions.map((revision, index) => {
          const previousRevision = revisions[index + 1];

          return (
            <section key={revision.id} id={`revision-${revision.id}`} className="revision-card panel p-4 scroll-mt-24">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t.historyPage.revision(revision.id)}</h2>
                  <p className="muted text-sm">
                    {revision.createdAt.toLocaleString(interfaceLocale)}
                    {revision.editedBy && (
                      <>
                        {" / "}
                        <UserName user={revision.editedBy} />
                      </>
                    )}
                  </p>
                </div>
                {canRollback && (
                  <form action={rollbackProblemRevisionAction.bind(null, problem.id, revision.id, problem.version)}>
                    <button type="submit" className="secondary">
                      {t.historyPage.rollback}
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-3">{revision.editSummary || t.historyPage.noSummary}</p>
              <details className="mt-3"><summary>{interfaceLocale === "fr" ? "Références de cette révision" : "References in this revision"}</summary>
                <pre className="whitespace-pre-wrap break-words">{citationHistoryText(revision.problemSnapshot)}</pre>
                {previousRevision && <RevisionDiff afterMarkdown={citationHistoryText(revision.problemSnapshot)} beforeMarkdown={citationHistoryText(previousRevision.problemSnapshot)} beforeRevisionId={previousRevision.id} revisionId={revision.id} labels={t.historyPage} />}
              </details>
              {previousRevision ? (
                <RevisionDiff
                  afterMarkdown={revision.markdown}
                  beforeMarkdown={previousRevision.markdown}
                  beforeRevisionId={previousRevision.id}
                  defaultOpen={index === 0}
                  revisionId={revision.id}
                  labels={t.historyPage}
                />
              ) : (
                <pre className="revision-preview mt-3 max-h-48 overflow-auto rounded p-3 text-xs">{revision.markdown}</pre>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
