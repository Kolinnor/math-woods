import { MathDomain } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dailyTip } from "@/lib/daily-tip";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { renderMarkdown } from "@/lib/markdown";
import { pluralize } from "@/lib/pluralize";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const recentImages = [
  {
    src: "/art/rye.jpg",
    alt: "Ivan Shishkin, Rye"
  },
  {
    src: "/art/brook-in-the-forest.jpg",
    alt: "Ivan Shishkin, Brook in the Forest"
  },
  {
    src: "/art/birch-grove.jpg",
    alt: "Ivan Shishkin, Birch Grove"
  }
] as const;

const homeDomains = [
  { label: "Algebra", domain: MathDomain.ALGEBRA },
  { label: "Analysis", domain: MathDomain.ANALYSIS },
  { label: "Number theory", domain: MathDomain.ARITHMETIC },
  { label: "Geometry", domain: MathDomain.GEOMETRY },
  { label: "Combinatorics", domain: MathDomain.COMBINATORICS },
  { label: "Probability", domain: MathDomain.PROBABILITY },
  { label: "Topology", domain: MathDomain.TOPOLOGY },
  { label: "More...", href: "/problems" }
] as const;

type HomeProblem = {
  id: number;
  slug: string;
  title: string;
  titleHtml: string;
  domain: MathDomain;
  difficulty: number | null;
  author?: {
    username: string;
    displayName: string | null;
  };
  _count?: {
    attempts: number;
    favorites: number;
  };
};

function unwrapSingleParagraph(html: string) {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
  return match ? match[1] : trimmed;
}

async function renderInlineMarkdown(markdown: string) {
  return unwrapSingleParagraph(await renderMarkdown(markdown));
}

async function withRenderedTitles<T extends { title: string }>(items: T[]) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      titleHtml: await renderInlineMarkdown(item.title)
    }))
  );
}

function tipDifficultyRange(level: number) {
  const min = Math.max(1, level * 20 + 1);
  return { min, max: Math.min(100, min + 19) };
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function initialsForName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
  return initials || name.slice(0, 2).toUpperCase() || "MW";
}

function InlineMathText({ html }: { html: string }) {
  return <span className="home-inline-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

function HomeNav({
  user
}: {
  user: { name: string; initials: string; username: string } | null;
}) {
  return (
    <header className="home-forest-nav">
      <Link href="/" className="home-brand" aria-label="Math Woods home">
        <img src="/icon.svg" alt="" aria-hidden="true" />
        <span>Math Woods</span>
      </Link>
      <nav className="home-nav-links" aria-label="Main navigation">
        <Link href="/problems">Problems</Link>
        <Link href="/concepts">Concepts</Link>
        <Link href="/playlists">Playlists</Link>
        <Link href="/tips">Tips</Link>
        {!user && <Link href="/users">Users</Link>}
        {user ? (
          <Link href="/settings" title={`${user.name} / your account`} className="home-avatar">
            {user.initials}
          </Link>
        ) : (
          <Link href="/login" className="home-login-link">
            Log in
          </Link>
        )}
      </nav>
    </header>
  );
}

function HomeHero({
  user,
  resume
}: {
  user: { name: string; initials: string; username: string } | null;
  resume: { title: string; slug: string } | null;
}) {
  const isMember = Boolean(user);

  return (
    <section className={isMember ? "home-hero-forest home-hero-member" : "home-hero-forest"}>
      <Image
        src="/art/morning-in-a-pine-forest.jpg"
        alt="Ivan Shishkin, Morning in a Pine Forest"
        fill
        priority
        sizes="100vw"
        className="home-hero-image"
      />
      <div className={isMember ? "home-hero-overlay home-hero-overlay-member" : "home-hero-overlay"} />
      <HomeNav user={user} />
      {user ? (
        <div className="home-member-hero-copy">
          <div>
            <p className="home-kicker">Welcome back</p>
            <h1>Hello, {firstName(user.name)}</h1>
          </div>
          <div className="home-hero-actions">
            {resume && (
              <Link href={`/problems/${resume.slug}`} className="home-button home-button-light">
                Resume / {resume.title}
              </Link>
            )}
            <Link href="/problems?level=mine" className="home-button home-button-ghost">
              Find a problem at my level
            </Link>
          </div>
        </div>
      ) : (
        <div className="home-guest-hero-copy">
          <p className="home-kicker">A quiet place for mathematics</p>
          <h1>Math Woods is a quiet place for problem solving and studying mathematics</h1>
          <div className="home-hero-actions">
            <Link href="/problems" className="home-button home-button-accent">
              Start solving problems
            </Link>
            <Link href="/contributing" className="home-button home-button-ghost">
              How can I contribute?
            </Link>
          </div>
          <p className="home-art-credit">
            Ivan Shishkin, <em>Morning in a Pine Forest</em> (1889) / public domain
          </p>
        </div>
      )}
    </section>
  );
}

function TrailBand() {
  return (
    <section className="home-trail-band" aria-label="How Math Woods works">
      <div>
        <strong>01</strong>
        <p>Problems are written and curated by the community.</p>
      </div>
      <div>
        <strong>02</strong>
        <p>Each problem connects to an evolving database of mathematical concepts.</p>
      </div>
      <div>
        <strong>03</strong>
        <p>The site is free and open source. Feel free to contribute!</p>
      </div>
    </section>
  );
}

function TipOfDay({
  tip,
  bodyHtml,
  practice
}: {
  tip: { level: number; title: string };
  bodyHtml: string;
  practice: HomeProblem[];
}) {
  return (
    <section className="home-tip-card">
      <div className="home-tip-image">
        <Image src="/art/oak-grove.jpg" alt="Ivan Shishkin, Oak Grove" fill sizes="(max-width: 760px) 100vw, 300px" />
      </div>
      <div className="home-tip-copy">
        <p className="home-section-kicker">Tip of the day / level {tip.level}</p>
        <h2>{tip.title}</h2>
        <div className="home-tip-body prose-math" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        {practice.length > 0 && (
          <>
            <p className="home-practice-label">Practice this tip</p>
            <div className="home-practice-list">
              {practice.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`}>
                  <InlineMathText html={problem.titleHtml} />
                  <span>
                    {domainLabel(problem.domain)} / {problem.difficulty ?? "unset"}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ProblemToTry({ problem }: { problem: HomeProblem | null }) {
  return (
    <section>
      <div className="home-section-heading">
        <h2>Problem to try</h2>
        <Link href="/problems">all problems</Link>
      </div>
      {problem ? (
        <Link href={`/problems/${problem.slug}`} className="home-featured-problem">
          <p>{domainLabel(problem.domain)}</p>
          <h3>
            <InlineMathText html={problem.titleHtml} />
          </h3>
          <span>
            difficulty {problem.difficulty ?? "unset"}/100 / {pluralize(problem._count?.attempts ?? 0, "attempt")} /{" "}
            {pluralize(problem._count?.favorites ?? 0, "favorite")}
          </span>
        </Link>
      ) : (
        <p className="home-empty-card">No problems yet.</p>
      )}
    </section>
  );
}

function DomainGrid() {
  return (
    <section>
      <div className="home-section-heading">
        <h2>Browse by domain</h2>
      </div>
      <div className="home-domain-grid">
        {homeDomains.map((item) =>
          "href" in item ? (
            <Link key={item.label} href={item.href} className="home-domain-more">
              {item.label}
            </Link>
          ) : (
            <Link key={item.domain} href={`/problems?domain=${item.domain}`}>
              {item.label}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

function RecentlyAdded({ problems }: { problems: HomeProblem[] }) {
  return (
    <section>
      <div className="home-section-heading">
        <h2>Recently added</h2>
        <Link href="/problems?sort=recent">browse all</Link>
      </div>
      <div className="home-recent-grid">
        {problems.map((problem, index) => {
          const image = recentImages[index % recentImages.length];
          return (
            <Link key={problem.id} href={`/problems/${problem.slug}`} className="home-recent-card">
              <div className="home-recent-image">
                <Image src={image.src} alt={image.alt} fill sizes="(max-width: 760px) 100vw, 33vw" />
              </div>
              <div>
                <p>{domainLabel(problem.domain)}</p>
                <h3>
                  <InlineMathText html={problem.titleHtml} />
                </h3>
                <span>
                  difficulty {problem.difficulty ?? "unset"} / by{" "}
                  {problem.author ? displayNameForUser(problem.author) : "curator"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TrailCta() {
  return (
    <section className="home-trail-cta">
      <Image src="/art/pine-forest.jpg" alt="Ivan Shishkin, Pine Forest" fill sizes="100vw" />
      <div className="home-trail-cta-overlay" />
      <div>
        <h2>Every problem is a trail. Pick one and go a little deeper.</h2>
        <Link href="/problems?level=mine" className="home-button home-button-light">
          Find a problem at my level
        </Link>
        <p>
          Ivan Shishkin, <em>Pine Forest</em> / public domain
        </p>
      </div>
    </section>
  );
}

function HomeFooter() {
  return (
    <footer className="home-footer">
      <div>
        <p>
          Code: AGPL-3.0-or-later. Educational content: CC BY-NC-SA 4.0 unless otherwise stated. Artwork by Ivan
          Shishkin (1832-1898), public domain via Wikimedia Commons. Math Woods name, logo, and visual identity are
          protected brand assets.
        </p>
        <nav aria-label="Footer navigation">
          <Link href="/about">About</Link>
          <Link href="/suggestions">Suggestions</Link>
          <Link href="/contributing">Contribute</Link>
        </nav>
      </div>
    </footer>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const preferredLanguage = await getPreferredContentLanguage();
  const tip = dailyTip();
  const { min, max } = tipDifficultyRange(tip.level);
  const problemWhere = {
    status: "PUBLISHED" as const,
    listed: true,
    language: preferredLanguage
  };

  const [problemRows, practiceRows, resumeAttempt, tipBodyHtml] = await Promise.all([
    prisma.problem.findMany({
      where: problemWhere,
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        author: { select: { username: true, displayName: true } },
        _count: { select: { attempts: true, favorites: true } }
      }
    }),
    prisma.problem.findMany({
      where: {
        ...problemWhere,
        difficulty: { gte: min, lte: max }
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        slug: true,
        title: true,
        domain: true,
        difficulty: true
      }
    }),
    user
      ? prisma.problemAttempt.findFirst({
          where: {
            userId: user.id,
            status: { not: "SOLVED" },
            problem: problemWhere
          },
          orderBy: { updatedAt: "desc" },
          include: { problem: { select: { slug: true, title: true } } }
        })
      : null,
    renderMarkdown(tip.body)
  ]);

  const renderedProblems = await withRenderedTitles(problemRows);
  const renderedPractice = await withRenderedTitles(practiceRows.length > 0 ? practiceRows : problemRows.slice(0, 3));
  const featured = renderedProblems[0] ?? null;
  const recent = renderedProblems.slice(1, 4);
  const homeUser = user
    ? {
        name: displayNameForUser(user),
        initials: initialsForName(displayNameForUser(user)),
        username: user.username
      }
    : null;
  const resume = resumeAttempt
    ? {
        title: resumeAttempt.problem.title,
        slug: resumeAttempt.problem.slug
      }
    : null;

  return (
    <div className="home-shell">
      <HomeHero user={homeUser} resume={resume} />
      <main className="home-main">
        {!homeUser && <TrailBand />}
        <TipOfDay tip={tip} bodyHtml={tipBodyHtml} practice={renderedPractice} />
        <section className="home-duo-grid">
          <ProblemToTry problem={featured} />
          <DomainGrid />
        </section>
        <RecentlyAdded problems={recent} />
      </main>
      {!homeUser && <TrailCta />}
      <HomeFooter />
    </div>
  );
}
