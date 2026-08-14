import { CalendarDays, Eye, Save } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { OrderedProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { TipImageField } from "@/components/TipImageField";
import { TipsAdminTabs } from "@/components/TipsAdminTabs";
import { updateDailyProblemScheduleAction } from "@/lib/actions/daily-problem-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  dailyProblemDefaultImageUrl,
  dateFromDailyProblemKey,
  upcomingDailyProblemDateKeys
} from "@/lib/daily-problem-schedule";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { renderInlineMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

function fieldName(name: string, dateKey: string) {
  return `${name}:${dateKey}`;
}

function dayLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(dateFromDailyProblemKey(dateKey));
}

export default async function ProblemOfTheDaySchedulePage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [{ saved }, t] = await Promise.all([searchParams, getTranslations()]);
  const dateKeys = upcomingDailyProblemDateKeys();
  const schedules = await prisma.dailyProblemSchedule.findMany({
    where: { dateKey: { in: dateKeys } },
    include: {
      problem: {
        select: { id: true, title: true, slug: true, domain: true, difficulty: true }
      }
    }
  });
  const scheduleByDate = new Map(schedules.map((schedule) => [schedule.dateKey, schedule]));
  const titleHtmlByProblemId = new Map(
    await Promise.all(schedules.map(async (schedule) => [
      schedule.problem.id,
      await renderInlineMarkdown(schedule.problem.title)
    ] as const))
  );

  return (
    <ForestPageLayout
      title="Problem of the day"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Plan the next seven daily problems and their images."
      meta={<p>Visible to admins</p>}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <TipsAdminTabs active="daily-problem" />

      {saved && <p className="quality-banner mb-4">Problem of the day schedule saved.</p>}

      <div className="daily-problem-schedule-intro">
        <CalendarDays size={21} aria-hidden="true" />
        <p>
          Each choice applies to that calendar date only. Leave a day empty to randomly feature a problem
          that has not been problem of the day before, with automatic Shishkin artwork.
        </p>
      </div>

      <form action={updateDailyProblemScheduleAction} className="daily-problem-schedule-form">
        <div className="daily-problem-schedule-list">
          {dateKeys.map((dateKey, index) => {
            const schedule = scheduleByDate.get(dateKey);
            const initialProblems: TipPickerProblem[] = schedule
              ? [{
                  id: schedule.problem.id,
                  title: schedule.problem.title,
                  titleHtml: titleHtmlByProblemId.get(schedule.problem.id),
                  slug: schedule.problem.slug,
                  domainLabel: translatedDomainLabel(schedule.problem.domain, t.home.domainLabels),
                  difficulty: schedule.problem.difficulty
                }]
              : [];

            return (
              <section key={dateKey} className="daily-problem-schedule-day">
                <input type="hidden" name="dateKey" value={dateKey} />
                <header>
                  <div>
                    <p className="eyebrow">{index === 0 ? "Today" : `Day ${index + 1}`}</p>
                    <h2>{dayLabel(dateKey)}</h2>
                  </div>
                  <div className="daily-problem-schedule-day-actions">
                    <time dateTime={dateKey}>{dateKey}</time>
                    <Link
                      href={`/tips/problem-of-the-day/preview?date=${dateKey}` as Route}
                      className="button secondary"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Eye size={15} aria-hidden="true" />
                      Preview
                    </Link>
                  </div>
                </header>

                <fieldset className="daily-problem-schedule-picker">
                  <legend>Problem</legend>
                  <OrderedProblemPicker
                    initialProblems={initialProblems}
                    inputName={fieldName("problemId", dateKey)}
                    maxProblems={1}
                    searchParams="exercise=0"
                    labels={{
                      empty: "No problem selected. A recent problem will be chosen automatically.",
                      maximumSelected: "Remove the current problem to choose another",
                      search: "Choose a problem",
                      searchPlaceholder: "Search by title or slug"
                    }}
                  />
                </fieldset>

                <div className="daily-problem-schedule-image">
                  <h3>Square image</h3>
                  <TipImageField
                    initialImageUrl={schedule?.imageUrl ?? null}
                    initialPositionX={schedule?.imagePositionX ?? 50}
                    initialPositionY={schedule?.imagePositionY ?? 50}
                    defaultImageUrl={dailyProblemDefaultImageUrl(dateKey)}
                    defaultImageLabel="the default problem artwork"
                    inputNames={{
                      imageUrl: fieldName("imageUrl", dateKey),
                      imagePositionX: fieldName("imagePositionX", dateKey),
                      imagePositionY: fieldName("imagePositionY", dateKey)
                    }}
                    saveLabel="Save the schedule"
                  />
                </div>
              </section>
            );
          })}
        </div>

        <div className="daily-problem-schedule-submit">
          <button type="submit">
            <Save size={17} aria-hidden="true" />
            Save schedule
          </button>
        </div>
      </form>
    </ForestPageLayout>
  );
}
