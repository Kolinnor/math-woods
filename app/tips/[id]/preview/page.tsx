import { DailyTipCard } from "@/components/DailyTipCard";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { loadTips } from "@/lib/daily-tip";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { renderMarkdown } from "@/lib/markdown";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { dailyTipImage } from "@/lib/tip-images";
import { selectTipProblemTranslations } from "@/lib/tip-problem-translations";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TipPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [{ id }, preferredLanguage, locale, t] = await Promise.all([
    params,
    getPreferredContentLanguage(),
    getInterfaceLocale(),
    getTranslations()
  ]);
  const tipId = Number(id);
  if (!Number.isInteger(tipId)) notFound();

  const tips = await loadTips(preferredLanguage);
  const tip = tips.find((entry) => entry.id === tipId);
  if (!tip) notFound();

  const practiceLink = await prisma.tipProblemGroup.findFirst({
    where: { tipId },
    orderBy: { position: "asc" },
    select: { translationGroupId: true }
  });
  const practiceCandidates = practiceLink
    ? await prisma.problem.findMany({
        where: {
          translationGroupId: practiceLink.translationGroupId,
          status: "PUBLISHED",
          listed: true
        }
      })
    : [];
  const practiceProblem = practiceLink
    ? selectTipProblemTranslations([practiceLink], practiceCandidates, preferredLanguage)[0] ?? null
    : null;
  const selectedImage = dailyTipImage(tip.images, tip.id);

  return (
    <ForestPageLayout
      title="Tip preview"
      eyebrow="Preview"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="This is how the saved entry will appear on the homepage."
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <>
          <Link href={`/tips/${tip.id}/edit`} className="button">Edit</Link>
          <Link href="/tips" className="button secondary">Back to tips</Link>
        </>
      }
    >
      <div className="daily-content-preview home-dashboard">
        <DailyTipCard
          tip={{
            kind: tip.kind,
            title: tip.title,
            bodyHtml: await renderMarkdown(tip.body),
            imageUrl: selectedImage?.imageUrl ?? tip.imageUrl,
            imagePositionX: selectedImage?.imagePositionX ?? tip.imagePositionX,
            imagePositionY: selectedImage?.imagePositionY ?? tip.imagePositionY
          }}
          labels={{
            tip: t.home.tip.title,
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
