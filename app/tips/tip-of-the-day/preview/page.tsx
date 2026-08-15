import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyTipCard } from "@/components/DailyTipCard";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { loadDailyTip, loadTips } from "@/lib/daily-tip";
import { selectDailyTipForDate } from "@/lib/daily-tip-schedule";
import {
  dailyProblemDateKey,
  dateFromDailyProblemKey,
  isDailyProblemDateKey
} from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { renderMarkdown } from "@/lib/markdown";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { dailyTipImage } from "@/lib/tip-images";
import { selectTipProblemTranslations } from "@/lib/tip-problem-translations";

export const dynamic = "force-dynamic";

type PreviewSearchParams = Record<string, string | string[] | undefined>;

type TipProblemGroupLink = {
  translationGroupId: string;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fieldName(dateKey: string) {
  return `tipId:${dateKey}`;
}

function positiveIntegerParam(value: string | string[] | undefined) {
  const numberValue = Number(firstParam(value));
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

export default async function DailyTipPreviewPage({
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
  const previewDate = dateFromDailyProblemKey(dateKey);
  const usesDraft = firstParam(params.draft) === "1";
  const tip = usesDraft
    ? selectDailyTipForDate(
        await loadTips(preferredLanguage),
        dateKey,
        positiveIntegerParam(params[fieldName(dateKey)])
      )
    : await loadDailyTip(previewDate, preferredLanguage);
  if (!tip) notFound();

  const practiceLinks = await prisma.$queryRaw<TipProblemGroupLink[]>`
    SELECT "translationGroupId"
    FROM "TipProblemGroup"
    WHERE "tipId" = ${tip.id}
    ORDER BY "position" ASC
    LIMIT 1
  `;
  const practiceGroupId = practiceLinks[0]?.translationGroupId;
  const practiceCandidates = practiceGroupId
    ? await prisma.problem.findMany({
        where: { translationGroupId: practiceGroupId, status: "PUBLISHED", listed: true }
      })
    : [];
  const practiceProblem = practiceGroupId
    ? selectTipProblemTranslations(
        [{ translationGroupId: practiceGroupId }],
        practiceCandidates,
        preferredLanguage
      )[0] ?? null
    : null;
  const [bodyHtml, schedule] = await Promise.all([
    renderMarkdown(tip.body),
    prisma.dailyTipSchedule.findUnique({ where: { dateKey }, select: { tipId: true } })
  ]);
  const selectedImage = dailyTipImage(tip.images, tip.id, previewDate);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(previewDate);

  return (
    <ForestPageLayout
      title="Tip of the day preview"
      eyebrow="Preview"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description={`${dateLabel}${usesDraft ? " · draft" : schedule?.tipId === tip.id ? " · scheduled" : " · automatic rotation"}`}
      workspaceClassName="forest-page-workspace-narrow"
      actions={<Link href="/tips/tip-of-the-day" className="button secondary">Back to schedule</Link>}
    >
      <div className="daily-content-preview">
        <DailyTipCard
          tip={{
            kind: tip.kind,
            title: tip.title,
            bodyHtml,
            imageUrl: selectedImage?.imageUrl ?? tip.imageUrl,
            imagePositionX: selectedImage?.imagePositionX ?? tip.imagePositionX,
            imagePositionY: selectedImage?.imagePositionY ?? tip.imagePositionY
          }}
          labels={{
            tip: locale === "fr" ? "Conseil du jour" : "Tip of the day",
            method: locale === "fr" ? "Méthode du jour" : "Method of the day",
            practice: locale === "fr" ? "S'entraîner" : "Practice"
          }}
          practiceProblem={practiceProblem ? {
            slug: practiceProblem.slug,
            title: practiceProblem.title,
            domainLabel: translatedDomainLabel(practiceProblem.domain, t.home.domainLabels),
            difficulty: practiceProblem.difficulty
          } : null}
        />
      </div>
    </ForestPageLayout>
  );
}
