import { ConceptMergeStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { proposeConceptMergeAction } from "@/lib/actions/concept-merge-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { contentLanguageNativeLabel } from "@/lib/languages";

export const dynamic = "force-dynamic";

type MergeSearchParams = {
  q?: string;
  proposed?: string;
  alreadyLinked?: string;
};

export default async function ConceptMergePage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<MergeSearchParams>;
}) {
  await requireVerifiedUser();
  const [{ slug }, rawQueryParams, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
    getInterfaceLocale()
  ]);
  const queryParams = rawQueryParams as MergeSearchParams;
  const copy = locale === "fr" ? {
    eyebrow: "Concepts liés",
    title: "Rapprocher cette page",
    description: "Recherchez une autre page décrivant le même concept. Une proposition sera envoyée à la modération avant toute modification.",
    search: "Titre ou URL du concept",
    searchButton: "Rechercher",
    duplicate: "Proposer comme doublon",
    translation: "Relier comme traduction",
    reason: "Précision facultative",
    proposed: "La proposition a bien été envoyée.",
    linked: "Ces pages appartiennent déjà à la même famille de traductions.",
    pending: "Propositions en attente",
    noResults: "Aucun autre concept correspondant.",
    back: "Retour au concept"
  } : {
    eyebrow: "Related concepts",
    title: "Merge or link this page",
    description: "Find another page describing the same concept. A proposal will be sent to moderation before anything changes.",
    search: "Concept title or URL",
    searchButton: "Search",
    duplicate: "Propose as duplicate",
    translation: "Link as translation",
    reason: "Optional note",
    proposed: "The proposal was sent.",
    linked: "These pages already belong to the same translation family.",
    pending: "Pending proposals",
    noResults: "No other matching concept found.",
    back: "Back to concept"
  };
  const concept = await prisma.concept.findUnique({ where: { slug } });
  if (!concept) {
    const [alias, merged] = await Promise.all([
      prisma.conceptAlias.findUnique({ where: { aliasSlug: slug }, select: { concept: { select: { slug: true } } } }),
      prisma.conceptRedirect.findUnique({ where: { sourceSlug: slug }, select: { targetConcept: { select: { slug: true } } } })
    ]);
    const targetSlug = merged?.targetConcept.slug ?? alias?.concept.slug;
    if (targetSlug) redirect(`/concepts/${targetSlug}/merge` as never);
    notFound();
  }

  const q = String(queryParams.q ?? "").trim().slice(0, 80);
  const slugQuery = q.replace(/^.*\/concepts\//i, "").split(/[/?#]/, 1)[0]?.trim().toLowerCase() ?? "";
  const candidates = q.length >= 2
    ? await prisma.concept.findMany({
        where: {
          id: { not: concept.id },
          translationGroupId: { not: concept.translationGroupId },
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            ...(slugQuery ? [{ slug: { contains: slugQuery, mode: "insensitive" as const } }] : []),
            { aliases: { some: { alias: { contains: q, mode: "insensitive" } } } }
          ]
        },
        orderBy: [{ title: "asc" }, { language: "asc" }],
        take: 30
      })
    : [];
  const pending = await prisma.conceptMergeProposal.findMany({
    where: {
      status: ConceptMergeStatus.PENDING,
      OR: [{ sourceConceptId: concept.id }, { targetConceptId: concept.id }]
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return (
    <ForestPageLayout
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      workspaceClassName="forest-page-workspace-narrow"
      actions={<Link href={`/concepts/${concept.slug}`} className="button secondary">{copy.back}</Link>}
    >
      {(queryParams.proposed || queryParams.alreadyLinked) && (
        <p className="quality-banner quality-usable mb-5" role="status">
          {queryParams.proposed ? copy.proposed : copy.linked}
        </p>
      )}
      <section className="panel p-5">
        <p className="mb-4 font-semibold"><AsyncMarkdownInline markdown={concept.title} /> · {contentLanguageNativeLabel(concept.language)}</p>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-sm font-medium">{copy.search}</span>
            <input name="q" defaultValue={q} minLength={2} required />
          </label>
          <button type="submit">{copy.searchButton}</button>
        </form>
      </section>

      {q.length >= 2 && (
        <section className="mt-5 grid gap-3">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/concepts/${candidate.slug}`} className="font-semibold underline">
                    <AsyncMarkdownInline markdown={candidate.title} />
                  </Link>
                  <p className="muted text-sm">{contentLanguageNativeLabel(candidate.language)}</p>
                </div>
                <form action={proposeConceptMergeAction.bind(null, concept.id)} className="grid gap-2">
                  <input type="hidden" name="targetConceptId" value={candidate.id} />
                  <input name="reason" maxLength={1200} placeholder={copy.reason} />
                  <button type="submit" className="secondary">
                    {candidate.language === concept.language ? copy.duplicate : copy.translation}
                  </button>
                </form>
              </div>
            </article>
          ))}
          {candidates.length === 0 && <p className="muted panel p-5">{copy.noResults}</p>}
        </section>
      )}

      {pending.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 font-semibold">{copy.pending}</h2>
          <div className="grid gap-2">
            {pending.map((proposal) => (
              <p key={proposal.id} className="panel p-4">
                <AsyncMarkdownInline markdown={proposal.sourceConceptId === concept.id ? proposal.targetTitle : proposal.sourceTitle} />
                {" · "}{proposal.kind === "DUPLICATE" ? copy.duplicate : copy.translation}
              </p>
            ))}
          </div>
        </section>
      )}
    </ForestPageLayout>
  );
}
