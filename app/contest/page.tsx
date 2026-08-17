import { Award, CalendarDays, Medal, Plus, Trophy } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContestProblemTitlePicker } from "@/components/ContestProblemTitlePicker";
import { ContestTabs } from "@/components/ContestTabs";
import { Difficulty } from "@/components/Difficulty";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { SignInLink } from "@/components/SignInLink";
import { UserAvatar } from "@/components/UserAvatar";
import {
  maybeSendContestLifecycleNotifications,
  submitContestProblemAction,
  withdrawContestSubmissionAction
} from "@/lib/actions/contest-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import {
  contestCreationWindow,
  contestDateLabel,
  contestPhase,
  DEFAULT_CONTEST_IMAGE_URL,
  localizedContestText
} from "@/lib/problem-contests";
import { renderInlineMarkdown, renderMarkdown } from "@/lib/markdown";
import { selectContentTranslation } from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";
import { tipImageObjectPosition } from "@/lib/tip-images";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    pageTitle: "Weekly Problem Design Contest",
    empty: "The next weekly contest is being prepared.",
    starts: "Starts",
    deadline: "Deadline",
    paris: "Paris time",
    reward: "Prize",
    points: "reputation points",
    create: "Create a problem for this contest",
    submit: "Submit a problem",
    replace: "Replace my submission",
    withdraw: "Withdraw",
    submission: "Your submission",
    entries: "Entries",
    noEntries: "No entries yet.",
    criteria: "How entries are judged",
    rules: "Rules",
    archive: "Previous contests",
    winner: "Winner",
    honorable: "Honorable mention",
    submitted: "Your problem has been entered in the contest.",
    signIn: "Sign in to participate",
    upcoming: "Submissions open on Saturday.",
    judging: "Submissions are closed. The admins are choosing the winner.",
    closed: "Results announced"
  },
  fr: {
    pageTitle: "Concours hebdomadaire de création de problèmes",
    empty: "Le prochain concours hebdomadaire est en préparation.",
    starts: "Début",
    deadline: "Date limite",
    paris: "heure de Paris",
    reward: "Récompense",
    points: "points de réputation",
    create: "Créer un problème pour ce concours",
    submit: "Proposer un problème",
    replace: "Remplacer ma proposition",
    withdraw: "Retirer",
    submission: "Votre proposition",
    entries: "Propositions",
    noEntries: "Aucune proposition pour le moment.",
    criteria: "Critères de sélection",
    rules: "Règles",
    archive: "Concours précédents",
    winner: "Gagnant",
    honorable: "Mention honorable",
    submitted: "Votre problème a bien été proposé au concours.",
    signIn: "Se connecter pour participer",
    upcoming: "Les propositions ouvrent samedi.",
    judging: "Les propositions sont closes. Les admins choisissent le gagnant.",
    closed: "Résultats annoncés"
  }
} as const;

export default async function ContestPage({
  searchParams
}: {
  searchParams: Promise<{ submitted?: string; week?: string; preview?: string }>;
}) {
  const [user, locale, params, publishedContests] = await Promise.all([
    getCurrentUser(),
    getInterfaceLocale(),
    searchParams,
    prisma.problemContest.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { startDateKey: "desc" },
      take: 24,
      include: {
        submissions: {
          orderBy: { submittedAt: "asc" },
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, avatarBackground: true } },
            problem: { select: { id: true, slug: true, title: true, language: true, difficulty: true, translationGroupId: true } }
          }
        }
      }
    })
  ]);
  const t = copy[locale];
  const canEdit = Boolean(user && canUseAdminTools(user));
  const previewId = Number(params.preview);
  const previewContest = canEdit && Number.isSafeInteger(previewId) && previewId > 0
    ? await prisma.problemContest.findUnique({
        where: { id: previewId },
        include: {
          submissions: {
            orderBy: { submittedAt: "asc" },
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true, avatarBackground: true } },
              problem: { select: { id: true, slug: true, title: true, language: true, difficulty: true, translationGroupId: true } }
            }
          }
        }
      })
    : null;
  const contests = previewContest
    ? [previewContest, ...publishedContests.filter((contest) => contest.id !== previewContest.id)]
    : publishedContests;
  const requestedContest = params.week ? contests.find((contest) => contest.startDateKey === params.week) : null;
  const featured = previewContest
    ?? requestedContest
    ?? contests.find((contest) => contestPhase(contest) === "open")
    ?? [...contests].reverse().find((contest) => contestPhase(contest) === "upcoming")
    ?? contests.find((contest) => contestPhase(contest) === "judging")
    ?? contests[0]
    ?? null;
  const isPreview = previewContest?.id === featured?.id;

  if (!featured) {
    return (
      <ForestPageLayout title={t.pageTitle} heroImage="/art/pine-forest.jpg" heroAlt="Ivan Shishkin, Pine Forest">
        <ContestTabs active="contest" canEdit={canEdit} locale={locale} />
        <div className="contest-empty-state"><Trophy size={34} aria-hidden="true" /><p>{t.empty}</p></div>
      </ForestPageLayout>
    );
  }

  if (!isPreview) await maybeSendContestLifecycleNotifications(featured.id);
  const phase = contestPhase(isPreview && !featured.publishedAt
    ? { ...featured, publishedAt: new Date() }
    : featured);
  const localized = localizedContestText(featured, locale);
  const [bodyHtml, rulesHtml, criteriaHtml] = await Promise.all([
    renderMarkdown(localized.body),
    renderMarkdown(localized.rules),
    renderMarkdown(localized.criteria)
  ]);
  const groupIds = [...new Set(featured.submissions.map((submission) => submission.translationGroupId))];
  const translations = groupIds.length
    ? await prisma.problem.findMany({
        where: { translationGroupId: { in: groupIds }, status: "PUBLISHED" },
        select: { id: true, slug: true, title: true, language: true, difficulty: true, translationGroupId: true, translatedFromProblemId: true }
      })
    : [];
  const displayProblemByGroup = new Map(groupIds.map((groupId) => {
    const selected = selectContentTranslation(
      translations.filter((problem) => problem.translationGroupId === groupId).map((problem) => ({
        ...problem,
        isSource: problem.translatedFromProblemId === null
      })),
      locale
    );
    return [groupId, selected] as const;
  }));
  const ownSubmission = user ? featured.submissions.find((submission) => submission.userId === user.id) : null;
  const eligibleProblems = !isPreview && user && phase === "open"
    ? await prisma.problem.findMany({
        where: {
          authorId: user.id,
          translatedFromProblemId: null,
          status: "PUBLISHED",
          createdAt: contestCreationWindow(featured)
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true }
      })
    : [];
  const eligibleProblemOptions = await Promise.all(eligibleProblems.map(async (problem) => ({
    id: problem.id,
    titleHtml: await renderInlineMarkdown(problem.title)
  })));
  const archive = contests.filter((contest) => contest.id !== featured.id && contest.resultsPublishedAt).slice(0, 6);

  return (
    <ForestPageLayout
      title={t.pageTitle}
      eyebrow={locale === "fr" ? "Chaque semaine, un nouveau thème" : "A new theme every week"}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      actions={isPreview
        ? <Link className="button secondary" href={`/contest/edit?id=${featured.id}` as Route}>{locale === "fr" ? "Retour à l'éditeur" : "Back to editor"}</Link>
        : canEdit ? <Link className="button secondary" href="/contest/edit">{locale === "fr" ? "Modifier" : "Edit"}</Link> : null}
    >
      <ContestTabs active="contest" canEdit={canEdit} locale={locale} />
      {isPreview && <p className="quality-banner">{locale === "fr" ? "Aperçu administrateur : ce concours n'est pas publié depuis cette page." : "Admin preview: this contest is not published from this page."}</p>}
      {params.submitted && <p className="quality-banner">{t.submitted}</p>}

      <article className="contest-feature">
        <div className="contest-feature-image">
          <img
            src={featured.imageUrl || DEFAULT_CONTEST_IMAGE_URL}
            alt=""
            style={{ objectPosition: tipImageObjectPosition(featured.imagePositionX, featured.imagePositionY) }}
          />
        </div>
        <div className="contest-feature-copy">
          <div className="contest-title-row">
            <div>
              <p className="mw-kicker">{phase === "open" ? (locale === "fr" ? "Concours ouvert" : "Contest open") : t[phase === "upcoming" ? "upcoming" : phase === "judging" ? "judging" : "closed"]}</p>
              <h2>{localized.title}</h2>
              <p>{localized.summary}</p>
            </div>
            <Trophy size={42} aria-hidden="true" />
          </div>
          <div className="contest-meta-grid">
            <span><CalendarDays size={18} /> <strong>{t.starts}</strong> {contestDateLabel(featured.startDateKey, locale, { weekday: "long" })}</span>
            <span><CalendarDays size={18} /> <strong>{t.deadline}</strong> {contestDateLabel(featured.endDateKey, locale, { weekday: "long" })} · {t.paris}</span>
            <span><Award size={18} /> <strong>{t.reward}</strong> {featured.rewardPoints} {t.points}</span>
          </div>
        </div>
      </article>

      {bodyHtml && <section className="contest-prose"><MarkdownBlock html={bodyHtml} /></section>}

      <div className="contest-information-grid">
        <section><h2>{t.criteria}</h2><MarkdownBlock html={criteriaHtml} /></section>
        <section><h2>{t.rules}</h2><MarkdownBlock html={rulesHtml} /></section>
      </div>

      {!isPreview && <section className="contest-participate">
        {phase === "open" ? user ? (
          <>
            <div className="mw-section-heading"><h2>{t.submission}</h2></div>
            {ownSubmission && (
              <div className="contest-own-submission">
                <strong><AsyncMarkdownInline markdown={displayProblemByGroup.get(ownSubmission.translationGroupId)?.title ?? ownSubmission.problem.title} /></strong>
                <form action={withdrawContestSubmissionAction}>
                  <input type="hidden" name="contestId" value={featured.id} />
                  <button className="secondary" type="submit">{t.withdraw}</button>
                </form>
              </div>
            )}
            <div className="contest-submit-actions">
              <Link className="button" href={`/problems/new?contest=${featured.slug}` as Route} target="_blank">
                <Plus size={17} aria-hidden="true" /> {t.create}
              </Link>
              {eligibleProblems.length > 0 && (
                <form action={submitContestProblemAction} className="contest-existing-problem-form">
                  <input type="hidden" name="contestId" value={featured.id} />
                  <ContestProblemTitlePicker
                    defaultValue={ownSubmission?.problemId}
                    items={eligibleProblemOptions}
                    placeholder={locale === "fr" ? "Choisir un problème de cette semaine" : "Choose a problem from this week"}
                  />
                  <button type="submit">{ownSubmission ? t.replace : t.submit}</button>
                </form>
              )}
            </div>
          </>
        ) : <SignInLink className="button">{t.signIn}</SignInLink> : <p className="contest-phase-note">{t[phase === "upcoming" ? "upcoming" : phase === "judging" ? "judging" : "closed"]}</p>}
      </section>}

      <section className="contest-entries">
        <div className="mw-section-heading"><h2>{t.entries}</h2><span>{featured.submissions.length}</span></div>
        {featured.submissions.length ? (
          <div className="contest-entry-list">
            {featured.submissions.map((submission) => {
              const problem = displayProblemByGroup.get(submission.translationGroupId) ?? submission.problem;
              return (
                <Link key={submission.id} href={`/problems/${problem.slug}`} className="contest-entry">
                  <Difficulty value={problem.difficulty} compact />
                  <span className="contest-entry-title"><strong><AsyncMarkdownInline markdown={problem.title} /></strong><small>{displayNameForUser(submission.user)}</small></span>
                  <UserAvatar user={submission.user} size="sm" />
                  {submission.placement === "WINNER" && <span className="contest-placement winner"><Trophy size={15} /> {t.winner}</span>}
                  {submission.placement === "HONORABLE_MENTION" && <span className="contest-placement"><Medal size={15} /> {t.honorable}</span>}
                </Link>
              );
            })}
          </div>
        ) : <p className="muted">{t.noEntries}</p>}
      </section>

      {archive.length > 0 && (
        <section className="contest-archive">
          <h2>{t.archive}</h2>
          <div>
            {archive.map((contest) => {
              const text = localizedContestText(contest, locale);
              return <Link key={contest.id} href={`/contest?week=${contest.startDateKey}` as Route}><span>{contestDateLabel(contest.startDateKey, locale)}</span><strong>{text.title}</strong></Link>;
            })}
          </div>
        </section>
      )}
    </ForestPageLayout>
  );
}
