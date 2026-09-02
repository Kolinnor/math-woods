import Link from "next/link";
import { CalendarDays, History } from "lucide-react";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { TipsAdminTabs } from "@/components/TipsAdminTabs";
import { getCurrentUser } from "@/lib/auth";
import { dailyProblemDateKey, dateFromDailyProblemKey } from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { normalizeSearchText } from "@/lib/search-ranking";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Daily problem history",
    description: "See which problems have already appeared on the homepage.",
    appearances: "appearances",
    differentProblems: "different problems",
    repeatedProblems: "repeated problems",
    search: "Search history",
    searchPlaceholder: "Search by title or slug",
    result: (shown: number, total: number) => `${shown} of ${total} problems shown`,
    noResult: "No previously featured problem matches this search.",
    latest: "Latest appearance",
    usedOnce: "Used once",
    usedTimes: (count: number) => `Used ${count} times`,
    explanation: "Automatic and manually scheduled selections are recorded after they appear on the homepage."
  },
  fr: {
    title: "Historique des problèmes du jour",
    description: "Consultez les problèmes déjà apparus sur la page d’accueil.",
    appearances: "apparitions",
    differentProblems: "problèmes différents",
    repeatedProblems: "problèmes réutilisés",
    search: "Rechercher dans l’historique",
    searchPlaceholder: "Rechercher par titre ou identifiant",
    result: (shown: number, total: number) => `${shown} problème${shown > 1 ? "s" : ""} sur ${total} affiché${shown > 1 ? "s" : ""}`,
    noResult: "Aucun ancien problème du jour ne correspond à cette recherche.",
    latest: "Dernière apparition",
    usedOnce: "Utilisé une fois",
    usedTimes: (count: number) => `Utilisé ${count} fois`,
    explanation: "Les sélections automatiques et manuelles sont enregistrées dès leur apparition sur la page d’accueil."
  }
} as const;

type HistorySchedule = Awaited<ReturnType<typeof loadHistory>>[number];

async function loadHistory(today: string) {
  return prisma.dailyProblemSchedule.findMany({
    where: { dateKey: { lte: today } },
    orderBy: { dateKey: "desc" },
    select: {
      dateKey: true,
      problem: {
        select: {
          difficulty: true,
          domain: true,
          language: true,
          slug: true,
          title: true,
          translationGroupId: true
        }
      }
    }
  });
}

function groupHistory(schedules: HistorySchedule[]) {
  const groups = new Map<string, { dates: string[]; problem: HistorySchedule["problem"] }>();

  for (const schedule of schedules) {
    const key = schedule.problem.translationGroupId;
    const existing = groups.get(key);
    if (existing) {
      existing.dates.push(schedule.dateKey);
    } else {
      groups.set(key, { dates: [schedule.dateKey], problem: schedule.problem });
    }
  }

  return [...groups.values()];
}

export default async function DailyProblemHistoryPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [{ q = "" }, interfaceLocale, t, schedules] = await Promise.all([
    searchParams,
    getInterfaceLocale(),
    getTranslations(),
    loadHistory(dailyProblemDateKey())
  ]);
  const labels = copy[interfaceLocale];
  const query = normalizeSearchText(q.trim());
  const history = groupHistory(schedules);
  const matchingHistory = query
    ? history.filter(({ problem }) => normalizeSearchText(`${problem.title} ${problem.slug}`).includes(query))
    : history;
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  });
  const repeatedCount = history.filter(({ dates }) => dates.length > 1).length;

  return (
    <ForestPageLayout
      title={labels.title}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description={labels.description}
      meta={<p>Visible to admins</p>}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <TipsAdminTabs active="daily-problem-history" />

      <div className="daily-problem-history-summary" aria-label={labels.title}>
        <div>
          <strong>{schedules.length}</strong>
          <span>{labels.appearances}</span>
        </div>
        <div>
          <strong>{history.length}</strong>
          <span>{labels.differentProblems}</span>
        </div>
        <div>
          <strong>{repeatedCount}</strong>
          <span>{labels.repeatedProblems}</span>
        </div>
      </div>

      <div className="daily-problem-history-intro">
        <History size={20} aria-hidden="true" />
        <p>{labels.explanation}</p>
      </div>

      <LiveSearchForm className="daily-problem-history-search">
        <label>
          <span>{labels.search}</span>
          <input name="q" defaultValue={q} placeholder={labels.searchPlaceholder} />
        </label>
        <button type="submit">{interfaceLocale === "fr" ? "Rechercher" : "Search"}</button>
      </LiveSearchForm>

      <p className="result-summary" role="status" aria-live="polite">
        {matchingHistory.length ? labels.result(matchingHistory.length, history.length) : labels.noResult}
      </p>

      {matchingHistory.length > 0 && (
        <ol className="daily-problem-history-list">
          {matchingHistory.map(({ dates, problem }) => (
            <li key={problem.translationGroupId}>
              <div className="daily-problem-history-date">
                <CalendarDays size={17} aria-hidden="true" />
                <span>{labels.latest}</span>
                <time dateTime={dates[0]}>{dateFormatter.format(dateFromDailyProblemKey(dates[0]))}</time>
              </div>
              <div className="daily-problem-history-problem">
                <Link href={`/problems/${problem.slug}`}>
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
                <span>
                  {translatedDomainLabel(problem.domain, t.home.domainLabels)}
                  {problem.difficulty ? ` · ${problem.difficulty}/100` : ""}
                  {` · ${problem.language.toUpperCase()}`}
                </span>
              </div>
              <div className="daily-problem-history-uses">
                <strong>{dates.length === 1 ? labels.usedOnce : labels.usedTimes(dates.length)}</strong>
                {dates.length > 1 && (
                  <span>
                    {dates.map((dateKey) => (
                      <time key={dateKey} dateTime={dateKey}>
                        {dateFormatter.format(dateFromDailyProblemKey(dateKey))}
                      </time>
                    ))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </ForestPageLayout>
  );
}
