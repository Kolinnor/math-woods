import Link from "next/link";
import { BookOpen, Clock3, Search, Users } from "lucide-react";
import { MathDomain } from "@prisma/client";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { explorationCatalogWhere } from "@/lib/explorations";
import { contentLanguageLabel } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ExplorationsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; domain?: string; duration?: string; difficulty?: string }>;
}) {
  const preferredLanguage = await getPreferredContentLanguage();
  const user = await getCurrentUser();
  const filters = await searchParams;
  const query = String(filters.q ?? "").trim();
  const domain = Object.values(MathDomain).includes(filters.domain as MathDomain) ? filters.domain as MathDomain : null;
  const maxDuration = Number(filters.duration) || null;
  const maxDifficulty = Number(filters.difficulty) || null;
  const explorations = await prisma.playlist.findMany({
    where: {
      ...explorationCatalogWhere,
      language: preferredLanguage,
      ...(domain ? { domain } : {}),
      ...(maxDuration ? { estimatedMinutes: { lte: maxDuration } } : {}),
      ...(maxDifficulty ? { difficulty: { lte: maxDifficulty } } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
              { descriptionMarkdown: { contains: query, mode: "insensitive" } },
              { audience: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      author: true,
      pages: { select: { id: true } },
      _count: { select: { explorationSessions: true } }
    }
  });
  const sessions = user
    ? await prisma.explorationSession.findMany({
        where: { userId: user.id, playlistId: { in: explorations.map((exploration) => exploration.id) } },
        select: { playlistId: true, visitedPageIds: true, status: true }
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
          {Object.values(MathDomain).map((item) => <option key={item} value={item}>{item.toLocaleLowerCase()}</option>)}
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
          const visited = Array.isArray(session?.visitedPageIds) ? session.visitedPageIds.length : 0;
          const progress = exploration.pages.length ? Math.min(100, Math.round((visited / exploration.pages.length) * 100)) : 0;
          return (
            <article key={exploration.id} className="exploration-catalog-item">
              <Link href={`/explorations/${exploration.slug}/start` as never} className="exploration-catalog-cover" aria-label={exploration.title}>
                <img src={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"} alt="" loading="lazy" />
              </Link>
              <div className="exploration-catalog-copy">
                <p className="eyebrow">{exploration.domain.toLocaleLowerCase()}</p>
                <h2><Link href={`/explorations/${exploration.slug}/start` as never}>{exploration.title}</Link></h2>
                <p>{exploration.summary || "An interactive mathematical exploration."}</p>
                <div className="exploration-catalog-meta">
                  <span><BookOpen size={15} /> {exploration.pages.length} pages</span>
                  <span><Clock3 size={15} /> {exploration.estimatedMinutes ? `${exploration.estimatedMinutes} min` : "Open-ended"}</span>
                  <span><Users size={15} /> {exploration._count.explorationSessions} readers</span>
                  <span>by {displayNameForUser(exploration.author)}</span>
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
