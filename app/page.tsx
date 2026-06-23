import { MathDomain } from "@prisma/client";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dailyTip } from "@/lib/daily-tip";
import { domainLabel, MATH_DOMAINS } from "@/lib/domains";
import { prisma } from "@/lib/db";
import { missingConcepts } from "@/lib/internal-links";
import { pluralize } from "@/lib/pluralize";
import { problemLinkClass } from "@/lib/problem-link";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const heroTaglines = [
  "Every path leads to a problem.",
  "Explore the woods, one problem at a time.",
  "A trail of problems, at your own pace",
  "Where math grows wild",
  "The Math Woods are full of mysteries"
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const homeProblemWhere = user
    ? {
        status: "PUBLISHED" as const,
        listed: true,
        attempts: { none: { userId: user.id, status: "SOLVED" as const } }
      }
    : { status: "PUBLISHED" as const, listed: true };
  const [problems, playlists, missing, concepts, currentAttempt, solvedAttempts] = await Promise.all([
    prisma.problem.findMany({
      where: homeProblemWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        author: true,
        _count: { select: { attempts: true, favorites: true } }
      }
    }),
    prisma.playlist.findMany({
      where: { visibility: "PUBLIC" },
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
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    user
      ? prisma.problemAttempt.findFirst({
          where: { userId: user.id, status: { not: "SOLVED" } },
          orderBy: { updatedAt: "desc" },
          include: { problem: true }
        })
      : null,
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED" },
          select: { problemId: true }
        })
      : []
  ]);

  const featured = problems[0];
  const tip = dailyTip();
  const tagline = heroTaglines[Math.floor(Math.random() * heroTaglines.length)] ?? heroTaglines[0];
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));

  return (
    <div className="home-page grid gap-10">
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1>{tagline}</h1>
          <p className="muted home-hero-lede">
            A quiet place for problem solving and studying mathematics.
          </p>
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
                {pluralize(featured._count.favorites, "favorite")}
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
            {MATH_DOMAINS.filter((item) => item.value !== MathDomain.OTHER).map((domain) => (
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
              <Link key={item.slug} href={`/concepts/new?title=${item.slug}`} className="flex justify-between gap-3">
                <span>{item.slug}</span>
                <span className="muted text-sm">{item.count} links</span>
              </Link>
            ))}
            {missing.length === 0 && <p className="muted text-sm">No gaps in the graph yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
