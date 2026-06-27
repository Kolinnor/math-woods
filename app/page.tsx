import Link from "next/link";
import type { QualityStatus } from "@prisma/client";
import { HomeGuestIntro } from "@/components/HomeGuestIntro";
import { getCurrentUser } from "@/lib/auth";
import { dailyTip } from "@/lib/daily-tip";
import { domainLabel, MATH_DOMAINS } from "@/lib/domains";
import { prisma } from "@/lib/db";
import { missingConcepts } from "@/lib/internal-links";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { pluralize } from "@/lib/pluralize";
import { problemLinkClass } from "@/lib/problem-link";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

type RecommendedProblem = {
  slug: string;
  title: string;
  difficulty: number | null;
  qualityStatus: QualityStatus;
  createdAt: Date;
};

const levelRecommendations: Record<string, { min: number; max: number; slugs: string[] }> = {
  BEGINNER_PRE_UNIVERSITY: {
    min: 1,
    max: 5,
    slugs: ["solutions-of-x-squared-equals-x", "subsets-of-a-three-element-set", "can-two-consecutive-integers-have-odd-product"]
  },
  EARLY_UNDERGRAD: {
    min: 6,
    max: 19,
    slugs: ["two-vectors-spanning-the-plane", "a-dependent-family-in-space", "a-set-that-almost-looks-like-a-subspace"]
  },
  UNDERGRAD: {
    min: 20,
    max: 39,
    slugs: []
  },
  ADVANCED_UNDERGRAD: {
    min: 40,
    max: 64,
    slugs: ["roots-and-coefficients"]
  },
  GRADUATE_CONTEST: {
    min: 65,
    max: 84,
    slugs: []
  },
  RESEARCH: {
    min: 85,
    max: 100,
    slugs: []
  }
};

function qualityRank(problem: Pick<RecommendedProblem, "qualityStatus">) {
  if (problem.qualityStatus === "EXCELLENT") return 0;
  if (problem.qualityStatus === "GOOD") return 1;
  if (problem.qualityStatus === "UNREVIEWED") return 2;
  return 3;
}

function conceptTitleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function recommendationsForLevel(level: string, language: string) {
  const config = levelRecommendations[level];
  if (!config) return [];

  const curated = config.slugs.length
    ? await prisma.problem.findMany({
        where: {
          slug: { in: config.slugs },
          status: "PUBLISHED",
          listed: true,
          language
        },
        select: { slug: true, title: true, difficulty: true, qualityStatus: true, createdAt: true }
      })
    : [];
  const bySlug = new Map(curated.map((problem) => [problem.slug, problem]));
  const selected: RecommendedProblem[] = config.slugs
    .map((slug) => bySlug.get(slug))
    .filter((problem): problem is RecommendedProblem => Boolean(problem));
  const selectedSlugs = new Set(selected.map((problem) => problem.slug));

  const rangeCandidates = await prisma.problem.findMany({
    where: {
      status: "PUBLISHED",
      listed: true,
      language,
      slug: { notIn: [...selectedSlugs] },
      difficulty: { gte: config.min, lte: config.max },
      qualityStatus: { in: ["GOOD", "EXCELLENT"] }
    },
    select: { slug: true, title: true, difficulty: true, qualityStatus: true, createdAt: true },
    orderBy: [{ difficulty: "asc" }, { createdAt: "desc" }],
    take: 8
  });

  for (const problem of rangeCandidates) {
    if (selected.length >= 3) break;
    selected.push(problem);
    selectedSlugs.add(problem.slug);
  }

  if (selected.length < 3) {
    const midpoint = (config.min + config.max) / 2;
    const fallback = await prisma.problem.findMany({
      where: {
        status: "PUBLISHED",
        listed: true,
        language,
        slug: { notIn: [...selectedSlugs] }
      },
      select: { slug: true, title: true, difficulty: true, qualityStatus: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 80
    });
    const ranked = fallback.sort((left, right) => {
      const leftDistance = left.difficulty === null ? 1000 : Math.abs(left.difficulty - midpoint);
      const rightDistance = right.difficulty === null ? 1000 : Math.abs(right.difficulty - midpoint);
      return qualityRank(left) - qualityRank(right) || leftDistance - rightDistance || right.createdAt.getTime() - left.createdAt.getTime();
    });

    for (const problem of ranked) {
      if (selected.length >= 3) break;
      selected.push(problem);
    }
  }

  return selected.slice(0, 3).map(({ slug, title, difficulty }) => ({ slug, title, difficulty }));
}

async function homeRecommendations(language: string) {
  const entries = await Promise.all(
    MATH_LEVEL_OPTIONS.map(async (level) => [level.value, await recommendationsForLevel(level.value, language)] as const)
  );
  return Object.fromEntries(entries);
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const preferredLanguage = await getPreferredContentLanguage();
  const homeProblemWhere = user
    ? {
        status: "PUBLISHED" as const,
        listed: true,
        language: preferredLanguage,
        attempts: { none: { userId: user.id, status: "SOLVED" as const } }
      }
    : { status: "PUBLISHED" as const, listed: true, language: preferredLanguage };
  const [problems, playlists, missing, concepts, currentAttempt, solvedAttempts, recommendations] = await Promise.all([
    prisma.problem.findMany({
      where: homeProblemWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        author: true,
        favorites: { select: { userId: true } },
        _count: { select: { attempts: true, favorites: true } }
      }
    }),
    prisma.playlist.findMany({
      where: { visibility: "PUBLIC", language: preferredLanguage },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        author: true,
        items: true,
        _count: { select: { followers: true } }
      }
    }),
    missingConcepts(6),
    prisma.concept.findMany({
      where: { language: preferredLanguage },
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    user
      ? prisma.problemAttempt.findFirst({
          where: { userId: user.id, status: { not: "SOLVED" }, problem: { language: preferredLanguage } },
          orderBy: { updatedAt: "desc" },
          include: { problem: true }
        })
      : null,
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED" },
          select: { problemId: true }
        })
      : [],
    user ? Promise.resolve({}) : homeRecommendations(preferredLanguage)
  ]);

  const featured = problems[0];
  const featuredFavoriteCount = featured
    ? featured.favorites.filter((favorite) => favorite.userId !== featured.authorId).length
    : 0;
  const tip = dailyTip();
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));

  return (
    <div className="home-page grid gap-10">
      {user ? (
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="home-actions">
              <Link href="/problems" className="button">
                Browse problems
              </Link>
              <Link href="/concepts" className="button secondary">
                Browse concepts
              </Link>
            </div>

            {currentAttempt && (
              <Link
                href={`/problems/${currentAttempt.problem.slug}`}
                className="continue-card home-continue-card problem-link problem-seen block"
              >
                <p className="eyebrow">Continue</p>
                <h2>{currentAttempt.problem.title}</h2>
                <p className="muted">{currentAttempt.status.toLowerCase().replace("_", " ")}</p>
              </Link>
            )}
          </div>
        </section>
      ) : (
        <HomeGuestIntro levels={MATH_LEVEL_OPTIONS} recommendations={recommendations} />
      )}

      <section className="daily-tip">
        <p className="daily-tip-label">Tip of the day / level {tip.level}</p>
        <h2>{tip.title}</h2>
        <p className="daily-tip-description">{tip.description}</p>
        <p>{tip.body}</p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="section-heading">
            <h2>Problem to try</h2>
            <Link href="/problems">
              all problems
            </Link>
          </div>
          {featured ? (
            <Link
              href={`/problems/${featured.slug}`}
              className={problemLinkClass("featured-problem block p-6", solvedIds.has(featured.id))}
            >
              <p className="eyebrow">{domainLabel(featured.domain)}</p>
              <h3 className="mt-2 text-xl font-semibold">{featured.title}</h3>
              <p className="meta mt-3">
                difficulty {featured.difficulty ?? "unset"}/100 · {pluralize(featured._count.attempts, "attempt")} ·{" "}
                {pluralize(featuredFavoriteCount, "favorite")}
              </p>
            </Link>
          ) : (
            <p className="muted panel p-5">No problems yet.</p>
          )}
        </div>

        <div>
          <div className="section-heading">
            <h2>Browse by domain</h2>
          </div>
          <div className="domain-grid">
            {MATH_DOMAINS.map((domain) => (
              <Link
                key={domain.value}
                href={`/problems?domain=${domain.value}`}
              >
                {domain.label}
              </Link>
            ))}
            <Link href="/problems" className="domain-more-link">
              More...
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Recently added</h2>
        </div>
        <div className="list-surface grid md:grid-cols-2">
          {problems.slice(1).map((problem) => (
            <Link
              key={problem.id}
              href={`/problems/${problem.slug}`}
              className={problemLinkClass("list-row block", solvedIds.has(problem.id))}
            >
              <p className="font-semibold">{problem.title}</p>
              <p className="meta mt-1">
                {domainLabel(problem.domain)} / by {displayNameForUser(problem.author)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-columns grid gap-8 lg:grid-cols-3">
        <div>
          <div className="section-heading">
            <h2>Playlists</h2>
            <Link href="/playlists">
              browse
            </Link>
          </div>
          <div className="grid gap-3">
            {playlists.map((playlist) => (
              <Link key={playlist.id} href={`/playlists/${playlist.slug}`} className="border-b border-line pb-3">
                <div className="font-medium">{playlist.title}</div>
                <div className="muted text-sm">by {displayNameForUser(playlist.author)}</div>
                <div className="muted text-sm">
                  {pluralize(playlist.items.length, "problem")} / {pluralize(playlist._count.followers, "follower")}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="section-heading">
            <h2>Recently improved</h2>
            <Link href="/concepts">
              concepts
            </Link>
          </div>
          <div className="grid gap-3">
            {concepts.map((concept) => (
              <Link key={concept.id} href={`/concepts/${concept.slug}`} className="border-b border-line pb-3">
                <div className="font-medium">{concept.title}</div>
                <div className="muted text-sm">{concept.status.toLowerCase()}</div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="section-heading">
            <h2>Missing concepts</h2>
            <Link href="/concepts/new">
              define one
            </Link>
          </div>
          <div className="grid gap-3">
            {missing.map((item) => (
              <Link
                key={item.slug}
                href={`/concepts/new?title=${encodeURIComponent(conceptTitleFromSlug(item.slug))}`}
                className="flex justify-between gap-3"
              >
                <span>{conceptTitleFromSlug(item.slug)}</span>
                <span className="muted text-sm">{pluralize(item.count, "link")}</span>
              </Link>
            ))}
            {missing.length === 0 && <p className="muted text-sm">No gaps in the graph yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
