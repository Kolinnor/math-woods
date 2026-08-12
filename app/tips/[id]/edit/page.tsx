import { DeleteTipButton } from "@/components/DeleteTipButton";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipEditorFields } from "@/components/TipEditorFields";
import type { TipPickerProblem } from "@/components/TipProblemPicker";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTipAction, updateTipAction } from "@/lib/actions/tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTip } from "@/lib/daily-tip";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { renderInlineMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type TipProblemRow = {
  tipId: number;
  problemId: number;
  position: number;
};

export default async function EditTipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();
  const t = await getTranslations();

  const { id } = await params;
  const tipId = Number(id);
  if (!Number.isInteger(tipId)) notFound();

  const tip = await loadTip(tipId);
  if (!tip) notFound();
  const tipProblems = await prisma.$queryRaw<TipProblemRow[]>`SELECT "tipId", "problemId", "position" FROM "TipProblem" WHERE "tipId" = ${tipId} ORDER BY "position" ASC`;
  const selectedProblemIds = new Set(tipProblems.map((link) => link.problemId));
  const selectedProblems = selectedProblemIds.size
    ? await prisma.problem.findMany({
        where: { id: { in: [...selectedProblemIds] } },
        select: {
          id: true,
          title: true,
          slug: true,
          domain: true,
          difficulty: true
        }
      })
    : [];
  const selectedProblemsById = new Map(selectedProblems.map((problem) => [problem.id, problem]));
  const initialProblems: TipPickerProblem[] = await Promise.all(tipProblems
    .map((link) => selectedProblemsById.get(link.problemId))
    .filter((problem): problem is NonNullable<typeof problem> => Boolean(problem))
    .map(async (problem) => ({
      id: problem.id,
      title: problem.title,
      titleHtml: await renderInlineMarkdown(problem.title),
      slug: problem.slug,
      domainLabel: translatedDomainLabel(problem.domain, t.home.domainLabels),
      difficulty: problem.difficulty
    })));

  return (
    <ForestPageLayout
      title="Edit tip"
      eyebrow={`Tip ${tip.position + 1}`}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description={<AsyncMarkdownInline markdown={tip.title} />}
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <Link href="/tips" className="button secondary">
          Back to tips
        </Link>
      }
    >
      <form action={updateTipAction.bind(null, tip.id)} className="panel grid gap-4 p-5">
        <TipEditorFields
          draftKey={`tip:${tip.id}:body`}
          initialProblems={initialProblems}
          submitLabel="Save tip"
          sourceUpdatedAt={tip.updatedAt.getTime()}
          values={{
            title: tip.title,
            body: tip.body,
            images: tip.images.length > 0
              ? tip.images
              : tip.imageUrl
                ? [{
                    imageUrl: tip.imageUrl,
                    imagePositionX: tip.imagePositionX,
                    imagePositionY: tip.imagePositionY
                  }]
                : [],
            showInMainMenu: tip.showInMainMenu
          }}
        />
      </form>

      <section className="danger-zone">
        <div>
          <h2>Delete tip</h2>
          <p>This removes the tip from the daily rotation and deletes its selected practice problems.</p>
        </div>
        <form action={deleteTipAction.bind(null, tip.id)}>
          <DeleteTipButton title={tip.title} />
        </form>
      </section>
    </ForestPageLayout>
  );
}
