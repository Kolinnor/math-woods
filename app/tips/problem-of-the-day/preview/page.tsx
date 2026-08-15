import { DailyProblemCard } from "@/components/DailyProblemCard";
import { DailyScheduleBackButton } from "@/components/DailyScheduleBackButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import {
  dateFromDailyProblemKey,
  dailyProblemDateKey,
  isDailyProblemDateKey
} from "@/lib/daily-problem-schedule";
import { loadDailyProblemPreview } from "@/lib/daily-problem-preview";
import { translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { normalizeTipImagePosition, normalizeTipImageUrl } from "@/lib/tip-images";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PreviewSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fieldName(name: string, dateKey: string) {
  return `${name}:${dateKey}`;
}

function positiveIntegerParam(value: string | string[] | undefined) {
  const numberValue = Number(firstParam(value));
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

export default async function DailyProblemPreviewPage({
  searchParams
}: {
  searchParams: Promise<PreviewSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [params, preferredLanguage, locale, t] = await Promise.all([
    searchParams,
    getPreferredContentLanguage(),
    getInterfaceLocale(),
    getTranslations()
  ]);
  const date = firstParam(params.date);
  const dateKey = date && isDailyProblemDateKey(date) ? date : dailyProblemDateKey();
  const usesDraft = firstParam(params.draft) === "1";
  const preview = await loadDailyProblemPreview(
    dateKey,
    preferredLanguage,
    usesDraft
      ? {
          problemId: positiveIntegerParam(params[fieldName("problemId", dateKey)]),
          imageUrl: normalizeTipImageUrl(firstParam(params[fieldName("imageUrl", dateKey)])),
          imagePositionX: normalizeTipImagePosition(firstParam(params[fieldName("imagePositionX", dateKey)])),
          imagePositionY: normalizeTipImagePosition(firstParam(params[fieldName("imagePositionY", dateKey)]))
        }
      : undefined
  );
  if (!preview) notFound();
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(dateFromDailyProblemKey(dateKey));

  return (
    <ForestPageLayout
      title="Problem of the day preview"
      eyebrow="Preview"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description={`${dateLabel}${usesDraft ? " · draft" : preview.automatic ? " · automatic selection" : ""}`}
      workspaceClassName="forest-page-workspace-narrow"
      actions={<DailyScheduleBackButton href="/tips/problem-of-the-day" />}
    >
      <div className="daily-content-preview">
        <DailyProblemCard
          problem={preview.problem}
          domainLabel={translatedDomainLabel(preview.problem.domain, t.home.domainLabels)}
          imageUrl={preview.imageUrl}
          imagePosition={preview.imagePosition}
          labels={{
            heading: locale === "fr" ? "Problème du jour" : "Problem of the day",
            by: locale === "fr" ? "par" : "by",
            action: locale === "fr" ? "Résoudre le problème du jour" : "Solve today's problem",
            solvedToday: (count) => locale === "fr"
              ? `${count} l'ont résolu aujourd'hui`
              : `${count} solved it today`
          }}
        />
      </div>
    </ForestPageLayout>
  );
}
