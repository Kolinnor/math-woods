import { CalendarDays, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { DailySchedulePreviewButton } from "@/components/DailySchedulePreviewButton";
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
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
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

  const [{ saved }, t, locale] = await Promise.all([searchParams, getTranslations(), getInterfaceLocale()]);
  const automaticExplanation = locale === "fr"
    ? "Laissez un jour vide pour choisir automatiquement un problème relu, de difficulté 20 à 50, jamais présenté ni déjà programmé. Priorité à 4 likes ou plus ; sinon le seuil descend progressivement jusqu’à 0. Les exercices, conjectures et problèmes à relire après modification sont exclus. Le choix est conservé pour la journée, avec une image automatique."
    : "Leave a day empty to automatically choose a reviewed problem of difficulty 20–50, never featured or already scheduled. Priority goes to 4 or more likes; otherwise the threshold drops progressively to 0. Exercises, conjectures and problems awaiting review after an edit are excluded. The choice is kept for the day, with automatic artwork.";
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
          {automaticExplanation}
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
                  titleHtml: titleHtmlByProblemId.get(schedule.problem.id)!,
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
                    <DailySchedulePreviewButton
                      dateKey={dateKey}
                      href="/tips/problem-of-the-day/preview"
                      fieldNames={[
                        fieldName("problemId", dateKey),
                        fieldName("imageUrl", dateKey),
                        fieldName("imagePositionX", dateKey),
                        fieldName("imagePositionY", dateKey)
                      ]}
                    />
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
                      empty: locale === "fr" ? "Choix automatique selon les critères ci-dessus." : "Automatic selection using the criteria above.",
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
