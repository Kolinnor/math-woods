import Link from "next/link";
import { BookOpen, Clock3, Search, Users } from "lucide-react";
import { MathDomain } from "@prisma/client";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { UserName } from "@/components/UserName";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { explorationCatalogWhere } from "@/lib/explorations";
import { getTranslations } from "@/lib/i18n/server";
import { ACTIVE_CONTENT_LANGUAGES, contentLanguageLabel } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { rankSearchMatches, searchMorphologyVariants } from "@/lib/search-ranking";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

export default async function ExplorationsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; domain?: string; duration?: string; difficulty?: string }>;
}) {
  const preferredLanguage = await getPreferredContentLanguage();
  const t = await getTranslations();
  const user = await getCurrentUser();
  const filters = await searchParams;
  const query = String(filters.q ?? "").trim();
  const morphologyVariants = searchMorphologyVariants(query, preferredLanguage);
  const domain = Object.values(MathDomain).includes(filters.domain as MathDomain) ? filters.domain as MathDomain : null;
  const maxDuration = Number(filters.duration) || null;
  const maxDifficulty = Number(filters.difficulty) || null;
  const explorationRows = await prisma.playlist.findMany({
    where: {
      ...explorationCatalogWhere,
      language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
      ...(domain ? { domain } : {}),
      ...(maxDuration ? { estimatedMinutes: { lte: maxDuration } } : {}),
      ...(maxDifficulty ? { difficulty: { lte: maxDifficulty } } : {}),
      ...(query
        ? {
            OR: morphologyVariants.flatMap((variant) => [
              { title: { contains: variant, mode: "insensitive" as const } },
              { summary: { contains: variant, mode: "insensitive" as const } },
              { descriptionMarkdown: { contains: variant, mode: "insensitive" as const } },
              { audience: { contains: variant, mode: "insensitive" as const } }
            ])
          }
        : {})
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      author: true,
      pages: { select: { blocks: { select: { id: true } } } },
      _count: { select: { explorationSessions: true } }
    }
  });
  const selectedExplorations = selectContentTranslationsByGroup(explorationRows, preferredLanguage);
  const explorations = query
    ? rankSearchMatches(
        selectedExplorations.map((exploration) => ({
          item: exploration,
          title: exploration.title,
          slug: exploration.slug,
          language: exploration.language,
          searchText: [
            exploration.summary,
            exploration.descriptionMarkdown,
            exploration.audience
          ]
        })),
        query,
        preferredLanguage,
        morphologyVariants
      ).map(({ item }) => item)
    : selectedExplorations;
  const sessions = user
    ? await prisma.explorationSession.findMany({
        where: { userId: user.id, playlistId: { in: explorations.map((exploration) => exploration.id) } },
        select: { playlistId: true, visitedBlockKeys: true, status: true }
      })
    : [];
  const sessionsByExploration = new Map(sessions.map((session) => [session.playlistId, session]));
  explorations.sort((left, right) => {
    const leftActive = sessionsByExploration.has(left.id) ? 1 : 0;
    const rightActive = sessionsByExploration.has(right.id) ? 1 : 0;
    return rightActive - leftActive;
  });

  return (
    <ForestPageLayout
      title="Explorations"
      heroImage="/art/playlists-forest-lodge.webp"
      heroAlt="Ivan Shishkin, Forest Lodge"
      meta={<><p>{explorations.length} publications</p><p>{contentLanguageLabel(preferredLanguage)}</p></>}
      actions={<Link href={"/explorations/new" as never} className="button">New exploration</Link>}
    >
      <form className="exploration-catalog-filters">
        <label className="exploration-catalog-search"><Search size={17} /><input name="q" defaultValue={query} placeholder="Search title, topic or audience" aria-label="Search explorations" /></label>
        <select name="domain" defaultValue={domain ?? ""} aria-label="Mathematics domain">
          <option value="">All domains</option>
          {Object.values(MathDomain).map((item) => (
            <option key={item} value={item}>{translatedDomainLabel(item, t.home.domainLabels)}</option>
          ))}
        </select>
        <select name="duration" defaultValue={maxDuration ?? ""} aria-label="Maximum duration">
          <option value="">Any duration</option><option value="15">15 min or less</option><option value="30">30 min or less</option><option value="60">1 hour or less</option><option value="180">3 hours or less</option>
        </select>
        <select name="difficulty" defaultValue={maxDifficulty ?? ""} aria-label="Maximum difficulty">
          <option value="">Any difficulty</option><option value="25">Gentle</option><option value="50">Intermediate</option><option value="75">Advanced</option><option value="100">All levels</option>
        </select>
        <button type="submit" className="secondary">Apply</button>
      </form>

      <div className="exploration-catalog-list">
        {explorations.map((exploration) => {
          const session = sessionsByExploration.get(exploration.id);
          const blockCount = exploration.pages.reduce((count, page) => count + page.blocks.length, 0);
          const visited = Array.isArray(session?.visitedBlockKeys) ? session.visitedBlockKeys.length : 0;
          const progress = blockCount ? Math.min(100, Math.round((visited / blockCount) * 100)) : 0;
          return (
            <article key={exploration.id} className="exploration-catalog-item">
              <Link href={`/explorations/${exploration.slug}/start` as never} className="exploration-catalog-cover" aria-label={exploration.title}>
                <img src={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"} alt="" loading="lazy" />
              </Link>
              <div className="exploration-catalog-copy">
                <p className="eyebrow">{translatedDomainLabel(exploration.domain, t.home.domainLabels)}</p>
                <h2><Link href={`/explorations/${exploration.slug}/start` as never}>{exploration.title}<ContentLanguageFallback language={exploration.language} expectedLanguage={preferredLanguage} /></Link></h2>
                <p>{exploration.summary || "An interactive mathematical exploration."}</p>
                <div className="exploration-catalog-meta">
                  <span><BookOpen size={15} /> {blockCount} blocks</span>
                  <span><Clock3 size={15} /> {exploration.estimatedMinutes ? `${exploration.estimatedMinutes} min` : "Open-ended"}</span>
                  <span><Users size={15} /> {exploration._count.explorationSessions} readers</span>
                  <span>by <UserName user={exploration.author} /></span>
                </div>
                {session && (
                  <div className="exploration-catalog-progress">
                    <span style={{ width: `${progress}%` }} /><small>{session.status === "COMPLETED" ? "Completed" : `${progress}% read`}</small>
                  </div>
                )}
              </div>
              <Link href={`/explorations/${exploration.slug}/start` as never} className="button secondary">{session ? "Resume" : "Start"}</Link>
            </article>
          );
        })}
        {explorations.length === 0 && <p className="muted exploration-catalog-empty">No public explorations match these filters.</p>}
      </div>
    </ForestPageLayout>
  );
}
