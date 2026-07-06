import { MathDomain } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { MarkdownInline } from "@/components/MarkdownInline";
import { getCurrentUser } from "@/lib/auth";
import { loadDailyTip } from "@/lib/daily-tip";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { renderInlineMarkdown, renderMarkdown } from "@/lib/markdown";
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

type HomeTranslations = Dictionary["home"];

function homeDomainLabel(domain: MathDomain, t: HomeTranslations) {
  return t.domainLabels[domain] ?? domainLabel(domain);
}

async function withRenderedTitles<T extends { title: string }>(items: T[]) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      titleHtml: await renderInlineMarkdown(item.title)
    }))
  );
}

function HomeHero({
  user,
  resume,
  t
}: {
  user: { name: string } | null;
  resume: { title: string; slug: string } | null;
  t: HomeTranslations["hero"];
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
      {user ? (
        <div className="home-member-hero-copy">
          <div>
            <h1>{t.welcomeBack(user.name)}</h1>
          </div>
          <div className="home-hero-actions">
            {resume && (
              <Link href={`/problems/${resume.slug}`} className="home-button home-button-light">
                {t.resume(resume.title)}
              </Link>
            )}
            <Link href="/problems?level=mine" className="home-button home-button-ghost">
              {t.findLevel}
            </Link>
          </div>
        </div>
      ) : (
        <div className="home-guest-hero-copy">
          <h1>{t.guestTitle}</h1>
          <div className="home-hero-actions">
            <Link href="/problems" className="home-button home-button-accent">
              {t.startSolving}
            </Link>
            <Link href="/contributing" className="home-button home-button-ghost">
              {t.contributeQuestion}
            </Link>
          </div>
          <p className="home-art-credit">{t.artCredit}</p>
        </div>
      )}
    </section>
  );
}

function TrailBand({ t }: { t: HomeTranslations["trail"] }) {
  return (
    <section className="home-trail-band" aria-label={t.ariaLabel}>
      {t.items.map((item, index) => (
        <div key={item}>
          <strong>{String(index + 1).padStart(2, "0")}</strong>
          <p>{item}</p>
        </div>
      ))}
    </section>
  );
}

function TipOfDay({
  tip,
  bodyHtml,
  practice,
  t,
  homeT,
  difficultyUnset
}: {
  tip: { title: string };
  bodyHtml: string;
  practice: HomeProblem[];
  t: HomeTranslations["tip"];
  homeT: HomeTranslations;
  difficultyUnset: string;
}) {
  return (
    <section className="home-tip-card">
      <div className="home-tip-image">
        <Image src="/art/oak-grove.jpg" alt="Ivan Shishkin, Oak Grove" fill sizes="(max-width: 760px) 100vw, 300px" />
      </div>
      <div className="home-tip-copy">
        <p className="home-section-kicker">{t.title}</p>
        <h2>{tip.title}</h2>
        <div className="home-tip-body prose-math" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        {practice.length > 0 && (
          <>
            <p className="home-practice-label">{t.practice}</p>
            <div className="home-practice-list">
              {practice.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`}>
                  <MarkdownInline html={problem.titleHtml} />
                  <span>
                    {homeDomainLabel(problem.domain, homeT)} / {problem.difficulty ?? difficultyUnset}
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

function ProblemToTry({ problem, t }: { problem: HomeProblem | null; t: HomeTranslations }) {
  return (
    <section>
      <div className="home-section-heading">
        <h2>{t.problemToTry.title}</h2>
        <Link href="/problems">{t.problemToTry.allProblems}</Link>
      </div>
      {problem ? (
        <Link href={`/problems/${problem.slug}`} className="home-featured-problem">
          <p>{homeDomainLabel(problem.domain, t)}</p>
          <h3>
            <MarkdownInline html={problem.titleHtml} />
          </h3>
          <span>
            {t.problemToTry.difficultyLine(
              problem.difficulty,
              t.problemToTry.attempts(problem._count?.attempts ?? 0),
              t.problemToTry.favorites(problem._count?.favorites ?? 0)
            )}
          </span>
        </Link>
      ) : (
        <p className="home-empty-card">{t.problemToTry.empty}</p>
      )}
    </section>
  );
}

function DomainGrid({ t }: { t: HomeTranslations["domains"] }) {
  return (
    <section>
      <div className="home-section-heading">
        <h2>{t.title}</h2>
      </div>
      <div className="home-domain-grid">
        {t.items.map((item) =>
          "href" in item ? (
            <Link key={item.label} href={item.href as never} className="home-domain-more">
              {item.label}
            </Link>
          ) : (
            <Link key={item.domain} href={`/problems?domain=${item.domain}` as never}>
              {item.label}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

function RecentlyAdded({ problems, t }: { problems: HomeProblem[]; t: HomeTranslations }) {
  return (
    <section>
      <div className="home-section-heading">
        <h2>{t.recent.title}</h2>
        <Link href="/problems?sort=recent">{t.recent.browseAll}</Link>
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
                <p>{homeDomainLabel(problem.domain, t)}</p>
                <h3>
                  <MarkdownInline html={problem.titleHtml} />
                </h3>
                <span>
                  {t.recent.cardMeta(
                    problem.difficulty,
                    problem.author ? displayNameForUser(problem.author) : t.recent.curator
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TrailCta({ t }: { t: HomeTranslations["cta"] }) {
  return (
    <section className="home-trail-cta">
      <Image src="/art/pine-forest.jpg" alt="Ivan Shishkin, Pine Forest" fill sizes="100vw" />
      <div className="home-trail-cta-overlay" />
      <div>
        <h2>{t.title}</h2>
        <Link href="/problems?level=mine" className="home-button home-button-light">
          {t.action}
        </Link>
        <p>{t.artCredit}</p>
      </div>
    </section>
  );
}

function HomeFooter({ t }: { t: HomeTranslations["footer"] }) {
  return (
    <footer className="home-footer">
      <div>
        <p>{t.legal}</p>
        <nav aria-label="Footer navigation">
          <Link href="/about">{t.about}</Link>
          <Link href="/suggestions">{t.suggestions}</Link>
          <Link href="/contributing">{t.contribute}</Link>
        </nav>
      </div>
    </footer>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const baseProblemWhere = {
    status: "PUBLISHED" as const,
    listed: true,
    language: preferredLanguage
  };
  const frontPageProblemWhere = {
    ...baseProblemWhere,
    canAppearOnFrontPage: true
  };

  const [problemRows, resumeAttempt, tip] = await Promise.all([
    prisma.problem.findMany({
      where: frontPageProblemWhere,
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        author: { select: { username: true, displayName: true } },
        _count: { select: { attempts: true, favorites: true } }
      }
    }),
    user
      ? prisma.problemAttempt.findFirst({
          where: {
            userId: user.id,
            status: { not: "SOLVED" },
            problem: baseProblemWhere
          },
          orderBy: { updatedAt: "desc" },
          include: { problem: { select: { slug: true, title: true } } }
        })
      : null,
    user ? loadDailyTip() : null
  ]);
  const [practiceLinks, tipBodyHtml] = tip
    ? await Promise.all([
        prisma.tipProblem.findMany({
          where: {
            tipId: tip.id,
            problem: frontPageProblemWhere
          },
          orderBy: { position: "asc" },
          take: 3,
          select: {
            problem: {
              select: {
                id: true,
                slug: true,
                title: true,
                domain: true,
                difficulty: true
              }
            }
          }
        }),
        renderMarkdown(tip.body)
      ])
    : [[], ""];

  const renderedProblems = await withRenderedTitles(problemRows);
  const practiceRows = practiceLinks.map((link) => link.problem);
  const renderedPractice = tip ? await withRenderedTitles(practiceRows) : [];
  const featured = renderedProblems[0] ?? null;
  const recent = renderedProblems.slice(1, 4);
  const homeUser = user
    ? {
        name: displayNameForUser(user)
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
      <HomeHero user={homeUser} resume={resume} t={t.home.hero} />
      <main className="home-main">
        {!homeUser && <TrailBand t={t.home.trail} />}
        {homeUser && tip && renderedPractice.length > 0 && (
          <TipOfDay
            tip={tip}
            bodyHtml={tipBodyHtml}
            practice={renderedPractice}
            t={t.home.tip}
            homeT={t.home}
            difficultyUnset={t.common.difficultyUnset}
          />
        )}
        <section className="home-duo-grid">
          <ProblemToTry problem={featured} t={t.home} />
          <DomainGrid t={t.home.domains} />
        </section>
        <RecentlyAdded problems={recent} t={t.home} />
      </main>
      {!homeUser && <TrailCta t={t.home.cta} />}
      <HomeFooter t={t.home.footer} />
    </div>
  );
}
