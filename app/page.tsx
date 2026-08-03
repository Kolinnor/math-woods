import { AttemptStatus, FriendshipStatus, MathDomain } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Difficulty } from "@/components/Difficulty";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { ProgressTicks } from "@/components/ProgressTicks";
import { RevealSolvedDailyProblem } from "@/components/RevealSolvedDailyProblem";
import { UserAvatar } from "@/components/UserAvatar";
import { getCurrentUser } from "@/lib/auth";
import {
  automaticDailyProblemGroup,
  dailyProblemDefaultImageUrl,
  dailyProblemDateKey
} from "@/lib/daily-problem-schedule";
import { loadDailyTip } from "@/lib/daily-tip";
import { prisma } from "@/lib/db";
import { parentProblemDomainForCode, PROBLEM_DOMAINS, translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { renderMarkdown } from "@/lib/markdown";
import { buildProgressMap } from "@/lib/progress";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import { recommendationsForUser } from "@/lib/recommendation-engine";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";
import { tipImageObjectPosition, tipImageUrl } from "@/lib/tip-images";

export const dynamic = "force-dynamic";

const dashboardCopy = {
  en: {
    problemOfDay: "Problem of the day",
    showSolvedProblemOfDay: "Show problem of the day (already solved)",
    solveToday: "Solve today's problem",
    solvedToday: (count: number) => `${count} solved it today`,
    recommended: "Recommended for you",
    more: "more like these",
    news: "News on Math Woods",
    allProblems: "all problems",
    progress: "Progress",
    solved: (done: number, total: number) => `${done} / ${total} solved`,
    allDomains: (count: number) => `see all ${count} domains`,
    authoredSolves: (count: number) => `Your problems were solved ${count} times`,
    friends: "Friends",
    explorations: "Start an exploration",
    steps: (count: number) => `${count} steps`,
    tip: "Tip of the day",
    practice: "Practice",
    by: "by",
    noActivity: "Your friends' recent activity will appear here."
  },
  fr: {
    problemOfDay: "Problème du jour",
    showSolvedProblemOfDay: "Voir le problème du jour (déjà résolu)",
    solveToday: "Résoudre le problème du jour",
    solvedToday: (count: number) => `${count} l'ont résolu aujourd'hui`,
    recommended: "Recommandés pour vous",
    more: "plus de recommandations",
    news: "Nouveautés sur Math Woods",
    allProblems: "tous les problèmes",
    progress: "Progression",
    solved: (done: number, total: number) => `${done} / ${total} résolus`,
    allDomains: (count: number) => `voir les ${count} domaines`,
    authoredSolves: (count: number) => `Vos problèmes ont été résolus ${count} fois`,
    friends: "Amis",
    explorations: "Commencer une exploration",
    steps: (count: number) => `${count} étapes`,
    tip: "Conseil du jour",
    practice: "S'entraîner",
    by: "par",
    noActivity: "L'activité récente de vos amis apparaîtra ici."
  }
} as const;

type HomeTranslations = Dictionary["home"];

function homeDomainLabel(domain: MathDomain, t: HomeTranslations) {
  return translatedDomainLabel(domain, t.domainLabels);
}

function GuestHomePage({
  featured,
  t
}: {
  featured: {
    slug: string;
    title: string;
    domain: MathDomain;
    difficulty: number | null;
    _count: { attempts: number; favorites: number };
  } | null;
  t: HomeTranslations;
}) {
  return (
    <div className="home-shell">
      <section className="home-hero-forest">
        <Image
          src="/art/morning-in-a-pine-forest.jpg"
          alt="Ivan Shishkin, Morning in a Pine Forest"
          fill
          priority
          sizes="100vw"
          className="home-hero-image"
        />
        <div className="home-hero-overlay" />
        <div className="home-guest-hero-copy">
          <h1>{t.hero.guestTitle}</h1>
          <div className="home-hero-actions">
            <Link href="/problems" className="home-button home-button-accent">
              {t.hero.startSolving}
            </Link>
            <Link href="/contributing" className="home-button home-button-ghost">
              {t.hero.contributeQuestion}
            </Link>
          </div>
          <p className="home-art-credit">{t.hero.artCredit}</p>
        </div>
      </section>

      <main className="home-main">
        <section className="home-trail-band" aria-label={t.trail.ariaLabel}>
          {t.trail.items.map((item, index) => (
            <div key={item}>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <p>{item}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="home-section-heading">
            <h2>{t.problemToTry.title}</h2>
            <Link href="/problems">{t.problemToTry.allProblems}</Link>
          </div>
          {featured ? (
            <Link href={`/problems/${featured.slug}`} className="home-featured-problem">
              <p>{homeDomainLabel(featured.domain, t)}</p>
              <h3><AsyncMarkdownInline markdown={featured.title} /></h3>
              <span>
                {t.problemToTry.difficultyLine(
                  featured.difficulty,
                  t.problemToTry.attempts(featured._count.attempts),
                  t.problemToTry.favorites(featured._count.favorites)
                )}
              </span>
            </Link>
          ) : (
            <p className="home-empty-card">{t.problemToTry.empty}</p>
          )}
        </section>
      </main>

      <section className="home-trail-cta">
        <Image src="/art/pine-forest.jpg" alt="Ivan Shishkin, Pine Forest" fill sizes="100vw" />
        <div className="home-trail-cta-overlay" />
        <div>
          <h2>{t.cta.title}</h2>
          <Link href="/problems" className="home-button home-button-light">
            {t.cta.action}
          </Link>
          <p>{t.cta.artCredit}</p>
        </div>
      </section>

      <footer className="home-footer">
        <div>
          <p>{t.footer.legal}</p>
          <nav aria-label="Footer navigation">
            <Link href="/about">{t.footer.about}</Link>
            <Link href="/suggestions">{t.footer.suggestions}</Link>
            <Link href="/contributing">{t.footer.contribute}</Link>
            <Link href={"/legal" as Route}>{t.footer.legalAndBrand}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function dayStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function relativeActivityTime(date: Date, locale: string, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (elapsedSeconds < 60) return formatter.format(-elapsedSeconds, "second");
  if (elapsedSeconds < 3600) return formatter.format(-Math.floor(elapsedSeconds / 60), "minute");
  if (elapsedSeconds < 86_400) return formatter.format(-Math.floor(elapsedSeconds / 3600), "hour");
  return formatter.format(-Math.floor(elapsedSeconds / 86_400), "day");
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const [t, locale, preferredLanguage] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getPreferredContentLanguage()
  ]);
  const copy = dashboardCopy[locale];

  if (!user) {
    const featured = await prisma.problem.findFirst({
      where: {
        status: "PUBLISHED",
        listed: true,
        isExercise: false,
        language: preferredLanguage,
        canAppearOnFrontPage: true,
        ...visibleProblemWhere(null)
      },
      orderBy: { createdAt: "desc" },
      select: {
        slug: true,
        title: true,
        domain: true,
        difficulty: true,
        _count: { select: { attempts: true, favorites: true } }
      }
    });

    return <GuestHomePage featured={featured} t={t.home} />;
  }

  const resumeAttempt = user
    ? await prisma.problemAttempt.findFirst({
        where: {
          userId: user.id,
          status: { not: AttemptStatus.SOLVED },
          problem: { status: "PUBLISHED", listed: true }
        },
        orderBy: { updatedAt: "desc" },
        select: { problem: { select: { title: true, slug: true } } }
      })
    : null;

  const dailyWhere = {
    status: "PUBLISHED" as const,
    listed: true,
    isExercise: false,
    canAppearOnFrontPage: true
  };
  const todayDateKey = dailyProblemDateKey();
  const scheduledDailyProblem = await prisma.dailyProblemSchedule.findUnique({
    where: { dateKey: todayDateKey },
    include: {
      problem: {
        select: {
          translationGroupId: true,
          status: true,
          listed: true,
          isExercise: true
        }
      }
    }
  });
  const scheduledDailyGroup =
    scheduledDailyProblem?.problem.status === "PUBLISHED"
    && scheduledDailyProblem.problem.listed
    && !scheduledDailyProblem.problem.isExercise
      ? scheduledDailyProblem.problem.translationGroupId
      : null;
  const dailyCandidates = scheduledDailyGroup
    ? []
    : await prisma.problem.findMany({
        where: { ...dailyWhere, translatedFromProblemId: null },
        select: { createdAt: true, qualityStatus: true, translationGroupId: true }
      });
  const chosenDailyGroup = scheduledDailyGroup
    ?? automaticDailyProblemGroup(dailyCandidates, todayDateKey)
    ?? null;
  const dailyTranslations = chosenDailyGroup
    ? await prisma.problem.findMany({
        where: { translationGroupId: chosenDailyGroup, status: "PUBLISHED", listed: true },
        include: { author: true }
      })
    : [];
  const dailyProblem =
    dailyTranslations.find((problem) => problem.language === preferredLanguage) ??
    dailyTranslations.find((problem) => problem.translatedFromProblemId === null) ??
    dailyTranslations[0] ??
    (await prisma.problem.findFirst({
      where: { status: "PUBLISHED", listed: true, isExercise: false, language: preferredLanguage },
      orderBy: { createdAt: "desc" },
      include: { author: true }
    }));
  const usesScheduledDailyProblem = Boolean(
    scheduledDailyGroup && dailyProblem?.translationGroupId === scheduledDailyGroup
  );
  const automaticDailyProblemImageUrl = dailyProblemDefaultImageUrl(todayDateKey);
  const dailyProblemImageUrl = usesScheduledDailyProblem
    ? scheduledDailyProblem?.imageUrl || automaticDailyProblemImageUrl
    : automaticDailyProblemImageUrl;
  const dailyProblemImagePosition = tipImageObjectPosition(
    usesScheduledDailyProblem ? scheduledDailyProblem?.imagePositionX : 50,
    usesScheduledDailyProblem ? scheduledDailyProblem?.imagePositionY : 50
  );

  const [recommendedData, tip, recentProblems, explorations, friendships] = await Promise.all([
    user ? recommendationsForUser(user.id, 5, preferredLanguage) : null,
    loadDailyTip(),
    prisma.problem.findMany({
      where: { status: "PUBLISHED", listed: true, language: preferredLanguage },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { author: true }
    }),
    prisma.playlist.findMany({
      where: { status: "PUBLISHED", visibility: "PUBLIC", language: preferredLanguage },
      orderBy: { updatedAt: "desc" },
      take: 3,
      include: { _count: { select: { circuitNodes: true } } }
    }),
    user
      ? prisma.friendship.findMany({
          where: {
            status: FriendshipStatus.ACCEPTED,
            OR: [{ requesterId: user.id }, { addresseeId: user.id }]
          },
          select: { requesterId: true, addresseeId: true }
        })
      : []
  ]);

  const friendIds = user
    ? friendships.map((friendship) =>
        friendship.requesterId === user.id ? friendship.addresseeId : friendship.requesterId
      )
    : [];
  const [
    dailySolvers,
    allProblemGroups,
    solvedGroups,
    authoredSolves,
    friendProblems,
    friendConcepts,
    friendExplorations,
    friendProofs
  ] = await Promise.all([
    dailyProblem
      ? prisma.problemAttempt.findMany({
          where: {
            status: AttemptStatus.SOLVED,
            updatedAt: { gte: dayStart() },
            problem: { translationGroupId: dailyProblem.translationGroupId }
          },
          distinct: ["userId"],
          orderBy: { updatedAt: "desc" },
          select: { user: true }
        })
      : [],
    user
      ? prisma.problem.findMany({
          where: { status: "PUBLISHED", listed: true, language: preferredLanguage },
          distinct: ["translationGroupId"],
          select: {
            translationGroupId: true,
            domain: true,
            domains: {
              orderBy: { position: "asc" },
              take: 1,
              select: { mscCode: true }
            }
          }
        })
      : [],
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, status: AttemptStatus.SOLVED },
          distinct: ["problemId"],
          select: { problem: { select: { translationGroupId: true } } }
        })
      : [],
    user
      ? prisma.problemAttempt.findMany({
          where: { status: AttemptStatus.SOLVED, userId: { not: user.id }, problem: { authorId: user.id } },
          distinct: ["userId", "problemId"],
          select: { id: true }
        })
      : [],
    friendIds.length
      ? prisma.problem.findMany({
          where: {
            authorId: { in: friendIds },
            status: "PUBLISHED",
            listed: true,
            translatedFromProblemId: null
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { createdAt: true, isExercise: true, slug: true, title: true, author: true }
        })
      : [],
    friendIds.length
      ? prisma.concept.findMany({
          where: {
            createdById: { in: friendIds },
            status: { not: "MISSING" },
            translatedFromConceptId: null
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { createdAt: true, slug: true, title: true, createdBy: true }
        })
      : [],
    friendIds.length
      ? prisma.playlist.findMany({
          where: {
            authorId: { in: friendIds },
            status: "PUBLISHED",
            visibility: "PUBLIC"
          },
          orderBy: { publishedAt: "desc" },
          take: 6,
          select: { publishedAt: true, createdAt: true, slug: true, title: true, author: true }
        })
      : [],
    friendIds.length
      ? prisma.problemProof.findMany({
          where: {
            authorId: { in: friendIds },
            problem: { status: "PUBLISHED", listed: true }
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            createdAt: true,
            author: true,
            problem: { select: { slug: true, title: true } }
          }
        })
      : []
  ]);
  const tipPracticeLink = tip
    ? await prisma.tipProblem.findFirst({
        where: { tipId: tip.id, problem: { status: "PUBLISHED", listed: true } },
        orderBy: { position: "asc" },
        include: { problem: true }
      })
    : null;
  const tipBodyHtml = tip ? await renderMarkdown(tip.body) : "";

  const solvedSet = new Set(solvedGroups.map((attempt) => attempt.problem.translationGroupId));
  const dailyProblemIsSolved = Boolean(
    dailyProblem && solvedSet.has(dailyProblem.translationGroupId)
  );
  const progressMap = buildProgressMap(allProblemGroups, solvedSet, (problem) =>
    parentProblemDomainForCode(problem.domains[0]?.mscCode ?? problem.domain)?.value ?? String(problem.domain)
  );
  const progress = [...progressMap.entries()]
    .map(([domain, value]) => ({ domain, ...value }))
    .sort((left, right) =>
      right.total - left.total
      || translatedDomainLabel(left.domain, t.home.domainLabels).localeCompare(
        translatedDomainLabel(right.domain, t.home.domainLabels),
        locale
      )
    )
    .slice(0, 5);
  const totalSolved = allProblemGroups.filter((problem) => solvedSet.has(problem.translationGroupId)).length;
  const friendActivity = [
    ...friendProblems.map((entry) => ({
      date: entry.createdAt,
      href: `/problems/${entry.slug}`,
      title: entry.title,
      user: entry.author,
      verb: entry.isExercise
        ? locale === "fr" ? "a créé l'exercice" : "created the exercise"
        : locale === "fr" ? "a créé le problème" : "created the problem"
    })),
    ...friendConcepts.flatMap((entry) => entry.createdBy ? [{
      date: entry.createdAt,
      href: `/concepts/${entry.slug}`,
      title: entry.title,
      user: entry.createdBy,
      verb: locale === "fr" ? "a créé le concept" : "created the concept"
    }] : []),
    ...friendExplorations.map((entry) => ({
      date: entry.publishedAt ?? entry.createdAt,
      href: `/explorations/${entry.slug}/start`,
      title: entry.title,
      user: entry.author,
      verb: locale === "fr" ? "a publié l'exploration" : "published the exploration"
    })),
    ...friendProofs.map((entry) => ({
      date: entry.createdAt,
      href: `/problems/${entry.problem.slug}`,
      title: entry.problem.title,
      user: entry.author,
      verb: locale === "fr" ? "a ajouté une solution à" : "added a solution to"
    }))
  ]
    .sort((left, right) => right.date.getTime() - left.date.getTime())
    .slice(0, 3);
  const dailyProblemCard = dailyProblem ? (
    <Link href={`/problems/${dailyProblem.slug}`} className="home-daily-problem">
      <div>
        <p className="mw-kicker">{copy.problemOfDay}</p>
        <h2><AsyncMarkdownInline markdown={dailyProblem.title} /></h2>
        <p className="home-dashboard-author">
          <UserAvatar user={dailyProblem.author} size="xs" />
          {copy.by} {displayNameForUser(dailyProblem.author)}
        </p>
        <div className="home-daily-meta">
          <span>{translatedDomainLabel(dailyProblem.domain, t.home.domainLabels)}</span>
          <Difficulty value={dailyProblem.difficulty} compact />
        </div>
        <div className="home-daily-action">
          <span className="mw-primary-button">{copy.solveToday}</span>
          <span className="home-solver-stack">
            {dailySolvers.slice(0, 4).map(({ user: solver }) => (
              <UserAvatar key={solver.id} user={solver} size="sm" />
            ))}
          </span>
          <small>{copy.solvedToday(dailySolvers.length)}</small>
        </div>
      </div>
      <div className="home-daily-art" aria-hidden="true">
        <img src={dailyProblemImageUrl} alt="" style={{ objectPosition: dailyProblemImagePosition }} />
      </div>
    </Link>
  ) : null;

  return (
    <div className="home-shell home-dashboard">
      <section className="home-hero-forest home-hero-member">
        <Image
          src="/art/morning-in-a-pine-forest.jpg"
          alt="Ivan Shishkin, Morning in a Pine Forest"
          fill
          priority
          sizes="100vw"
          className="home-hero-image"
        />
        <div className="home-hero-overlay home-hero-overlay-member" />
        <div className="home-member-hero-copy">
          <h1>{user ? t.home.hero.welcomeBack(displayNameForUser(user)) : t.home.hero.guestTitle}</h1>
          {resumeAttempt && (
            <Link href={`/problems/${resumeAttempt.problem.slug}`} className="home-button home-button-light">
              {t.home.hero.resume(resumeAttempt.problem.title)}
            </Link>
          )}
        </div>
      </section>

      <main className="home-dashboard-grid">
        <div className="home-dashboard-main">
          {dailyProblemCard && (
            dailyProblemIsSolved ? (
              <RevealSolvedDailyProblem label={copy.showSolvedProblemOfDay}>
                {dailyProblemCard}
              </RevealSolvedDailyProblem>
            ) : dailyProblemCard
          )}

          {recommendedData && recommendedData.recommendations.length > 0 && (
            <section>
              <div className="mw-section-heading">
                <h2>{copy.recommended}</h2>
                <Link href="/problems">{copy.more}</Link>
              </div>
              <div className="home-recommendation-grid">
                {recommendedData.recommendations.slice(0, 4).map(({ problem }) => (
                  <Link key={problem.id} href={`/problems/${problem.slug}`}>
                    <Difficulty value={problem.difficulty} />
                    <span>
                      <strong><AsyncMarkdownInline markdown={problem.title} /></strong>
                      <small>{translatedDomainLabel(problem.domains[0] ?? "OTHER", t.home.domainLabels)}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {tip && (
            <section className="home-tip-card">
              <div className="home-tip-image">
                <img
                  src={tipImageUrl(tip.imageUrl)}
                  alt=""
                  style={{ objectPosition: tipImageObjectPosition(tip.imagePositionX, tip.imagePositionY) }}
                />
              </div>
              <div className="home-tip-copy">
                <p className="mw-kicker">{copy.tip}</p>
                <h2><AsyncMarkdownInline markdown={tip.title} /></h2>
                <MarkdownBlock html={tipBodyHtml} />
                {tipPracticeLink && (
                  <Link href={`/problems/${tipPracticeLink.problem.slug}`} className="home-tip-practice">
                    <strong>{copy.practice}: <AsyncMarkdownInline markdown={tipPracticeLink.problem.title} /></strong>
                    <span>{translatedDomainLabel(tipPracticeLink.problem.domain, t.home.domainLabels)} / {tipPracticeLink.problem.difficulty ?? "--"}</span>
                  </Link>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="mw-section-heading">
              <h2>{copy.news}</h2>
              <Link href="/problems">{copy.allProblems}</Link>
            </div>
            <div className="home-news-list">
              {recentProblems.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`}>
                  <Difficulty value={problem.difficulty} compact />
                  <span>
                    <strong><AsyncMarkdownInline markdown={problem.title} /></strong>
                    <small>{translatedDomainLabel(problem.domain, t.home.domainLabels)} · {copy.by} {displayNameForUser(problem.author)}</small>
                  </span>
                  <time>{new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-Math.max(0, Math.round((Date.now() - problem.createdAt.getTime()) / 86_400_000)), "day")}</time>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="home-dashboard-rail">
          {user && (
            <section className="mw-card home-progress-card">
              <header>
                <h2>{copy.progress}</h2>
                <span>{copy.solved(totalSolved, allProblemGroups.length)}</span>
              </header>
              {progress.map((entry) => (
                <div key={entry.domain}>
                  <p><strong>{translatedDomainLabel(entry.domain, t.home.domainLabels)}</strong><span>{entry.done} / {entry.total}</span></p>
                  <ProgressTicks done={entry.done} total={entry.total} />
                </div>
              ))}
              <Link href="/problems" className="home-all-domains">{copy.allDomains(PROBLEM_DOMAINS.length)}</Link>
              <p className="home-authored-solves">{copy.authoredSolves(authoredSolves.length)}</p>
            </section>
          )}
          <section className="mw-card home-friend-activity">
            <h2>{copy.friends}</h2>
            {friendActivity.length ? friendActivity.map((entry) => (
              <div key={`${entry.user.id}-${entry.href}-${entry.date.toISOString()}`}>
                <UserAvatar user={entry.user} size="sm" />
                <div className="home-friend-activity-copy">
                  <p>
                    <Link
                      href={`/profile/${entry.user.username}` as Route}
                      className="home-friend-profile-link"
                    >
                      {displayNameForUser(entry.user)}
                    </Link>{" "}
                    {entry.verb}{" "}
                    <Link href={entry.href as Route}><AsyncMarkdownInline markdown={entry.title} /></Link>
                  </p>
                  <time dateTime={entry.date.toISOString()}>{relativeActivityTime(entry.date, locale)}</time>
                </div>
              </div>
            )) : <p className="muted">{copy.noActivity}</p>}
          </section>
          {explorations.length > 0 && (
            <section className="home-exploration-card">
              <h2>{copy.explorations}</h2>
              {explorations.map((exploration) => (
                <Link key={exploration.id} href={`/explorations/${exploration.slug}/start`}>
                  <strong>{exploration.title}</strong>
                  <small>{copy.steps(exploration._count.circuitNodes)} · {translatedDomainLabel(exploration.domain, t.home.domainLabels)}</small>
                </Link>
              ))}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
