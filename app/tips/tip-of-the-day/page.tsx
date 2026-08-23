import { CalendarDays, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { DailySchedulePreviewButton } from "@/components/DailySchedulePreviewButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipsAdminTabs } from "@/components/TipsAdminTabs";
import { updateDailyTipScheduleAction } from "@/lib/actions/daily-tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTips } from "@/lib/daily-tip";
import { selectDailyTipForDate } from "@/lib/daily-tip-schedule";
import {
  dateFromDailyProblemKey,
  upcomingDailyProblemDateKeys
} from "@/lib/daily-problem-schedule";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { dailyTipImage, tipImageObjectPosition, tipImageUrl } from "@/lib/tip-images";

export const dynamic = "force-dynamic";

function fieldName(dateKey: string) {
  return `tipId:${dateKey}`;
}

function dayLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(dateFromDailyProblemKey(dateKey));
}

export default async function TipOfTheDaySchedulePage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [{ saved }, preferredLanguage, locale] = await Promise.all([
    searchParams,
    getPreferredContentLanguage(),
    getInterfaceLocale()
  ]);
  const dateKeys = upcomingDailyProblemDateKeys();
  const [tips, schedules, rotationSelections] = await Promise.all([
    loadTips(preferredLanguage),
    prisma.dailyTipSchedule.findMany({ where: { dateKey: { in: dateKeys } } }),
    prisma.dailyTipRotationSelection.findMany({ where: { dateKey: { in: dateKeys } } })
  ]);
  const scheduleByDate = new Map(schedules.map((schedule) => [schedule.dateKey, schedule]));
  const rotationSelectionByDate = new Map(
    rotationSelections.map((selection) => [selection.dateKey, selection])
  );

  return (
    <ForestPageLayout
      title="Tip of the day"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Plan the next seven daily tips and methods."
      meta={<p>Visible to admins</p>}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <TipsAdminTabs active="daily-tip" />

      {saved && <p className="quality-banner mb-4">Tip of the day schedule saved.</p>}

      <div className="daily-problem-schedule-intro">
        <CalendarDays size={21} aria-hidden="true" />
        <p>
          Each choice applies to that calendar date only. Leave a day on automatic to use the
          usual daily rotation. The selected tip keeps its translations, practice problem, and
          daily image variant.
        </p>
      </div>

      <form action={updateDailyTipScheduleAction} className="daily-problem-schedule-form">
        <div className="daily-problem-schedule-list">
          {dateKeys.map((dateKey, index) => {
            const schedule = scheduleByDate.get(dateKey);
            const rotationSelection = rotationSelectionByDate.get(dateKey);
            const effectiveTip = selectDailyTipForDate(
              tips,
              dateKey,
              schedule?.tipId ?? null,
              rotationSelection?.tipId ?? null
            );
            const effectiveImage = effectiveTip
              ? dailyTipImage(effectiveTip.images, effectiveTip.id, dateFromDailyProblemKey(dateKey))
              : null;

            return (
              <section key={dateKey} className="daily-problem-schedule-day">
                <input type="hidden" name="dateKey" value={dateKey} />
                <header>
                  <div>
                    <p className="eyebrow">{index === 0 ? "Today" : `Day ${index + 1}`}</p>
                    <h2>{dayLabel(dateKey, locale)}</h2>
                  </div>
                  <div className="daily-problem-schedule-day-actions">
                    <time dateTime={dateKey}>{dateKey}</time>
                    <DailySchedulePreviewButton
                      dateKey={dateKey}
                      href="/tips/tip-of-the-day/preview"
                      fieldNames={[fieldName(dateKey)]}
                    />
                  </div>
                </header>

                <label className="daily-tip-schedule-picker">
                  <span>Tip or method</span>
                  <select name={fieldName(dateKey)} defaultValue={schedule?.tipId ?? ""}>
                    <option value="">Automatic rotation</option>
                    {tips.map((tip) => (
                      <option key={tip.id} value={tip.id}>
                        {tip.kind === "METHOD" ? "Method" : "Tip"} {tip.position + 1}: {tip.title}
                      </option>
                    ))}
                  </select>
                </label>

                {effectiveTip ? (
                  <div className="daily-tip-schedule-current">
                    <img
                      src={tipImageUrl(effectiveImage?.imageUrl ?? effectiveTip.imageUrl)}
                      alt=""
                      style={{
                        objectPosition: tipImageObjectPosition(
                          effectiveImage?.imagePositionX ?? effectiveTip.imagePositionX,
                          effectiveImage?.imagePositionY ?? effectiveTip.imagePositionY
                        )
                      }}
                    />
                    <div>
                      <p className="eyebrow">
                        {schedule ? "Scheduled" : "Automatic"} · {effectiveTip.kind === "METHOD" ? "Method" : "Tip"}
                      </p>
                      <strong>{effectiveTip.title}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="muted text-sm">No tip is currently available for the daily rotation.</p>
                )}
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
