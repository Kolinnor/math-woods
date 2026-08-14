import { ArrowLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { HomeContestCard } from "@/components/HomeContestCard";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import {
  contestDateLabel,
  contestIsOpen,
  DEFAULT_CONTEST_IMAGE_URL,
  localizedContestText
} from "@/lib/problem-contests";

export const dynamic = "force-dynamic";

export default async function ContestHomepagePreview({
  searchParams
}: {
  searchParams: Promise<{ contest?: string; view?: string }>;
}) {
  const [user, locale, params] = await Promise.all([
    getCurrentUser(),
    getInterfaceLocale(),
    searchParams
  ]);
  if (!user || !canUseAdminTools(user) || params.view !== "home") notFound();

  const contestId = Number(params.contest);
  if (!Number.isSafeInteger(contestId) || contestId <= 0) notFound();
  const contest = await prisma.problemContest.findUnique({ where: { id: contestId } });
  if (!contest) notFound();

  const text = localizedContestText(contest, locale);
  const projectedContest = contest.publishedAt ? contest : { ...contest, publishedAt: new Date() };

  return (
    <ForestPageLayout
      title={locale === "fr" ? "Aperçu du concours sur l'accueil" : "Homepage contest preview"}
      eyebrow={locale === "fr" ? "Aperçu" : "Preview"}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      workspaceClassName="forest-page-workspace-narrow"
      actions={(
        <Link href={`/contest/edit?id=${contest.id}` as Route} className="button secondary">
          <ArrowLeft size={16} aria-hidden="true" />
          {locale === "fr" ? "Retour à l'éditeur" : "Back to editor"}
        </Link>
      )}
    >
      <div className="daily-content-preview">
        <HomeContestCard
          contest={{
            title: text.title,
            summary: text.summary,
            imageUrl: contest.imageUrl || DEFAULT_CONTEST_IMAGE_URL,
            imagePositionX: contest.imagePositionX,
            imagePositionY: contest.imagePositionY,
            deadline: contestDateLabel(contest.endDateKey, locale, { weekday: "long" }),
            rewardPoints: contest.rewardPoints,
            isOpen: contestIsOpen(projectedContest)
          }}
          labels={{
            heading: locale === "fr" ? "Concours de la semaine" : "Weekly contest",
            deadline: locale === "fr" ? "Date limite" : "Deadline",
            points: locale === "fr" ? "points de réputation" : "reputation points",
            action: locale === "fr" ? "Participer au concours" : "Enter the contest",
            upcoming: locale === "fr" ? "Voir le prochain concours" : "See the upcoming contest"
          }}
        />
      </div>
    </ForestPageLayout>
  );
}
