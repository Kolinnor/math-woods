import { DeleteTipButton } from "@/components/DeleteTipButton";
import { TipProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTipAction, updateTipAction } from "@/lib/actions/tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTip } from "@/lib/daily-tip";
import { domainLabel } from "@/lib/domains";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type TipProblemRow = {
  tipId: number;
  problemId: number;
  position: number;
};

export default async function EditTipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

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
  const initialProblems: TipPickerProblem[] = tipProblems
    .map((link) => selectedProblemsById.get(link.problemId))
    .filter((problem): problem is NonNullable<typeof problem> => Boolean(problem))
    .map((problem) => ({
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      domainLabel: domainLabel(problem.domain),
      difficulty: problem.difficulty
    }));

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Link href="/tips" className="button secondary">
          Back to tips
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Edit tip</h1>
        <p className="muted mt-1">Tip {tip.position + 1}</p>
      </div>

      <form action={updateTipAction.bind(null, tip.id)} className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" maxLength={160} required defaultValue={tip.title} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Description</span>
          <textarea name="description" maxLength={1200} required defaultValue={tip.description} />
        </label>
        <label className="checkbox-inline">
          <input name="showInMainMenu" type="checkbox" defaultChecked={tip.showInMainMenu} />
          <span>This can appear in the main menu</span>
        </label>
        <fieldset className="tip-problem-editor">
          <legend>Try this on the following problems</legend>
          <p className="muted text-sm">Choose up to 8 problems.</p>
          <TipProblemPicker initialProblems={initialProblems} />
        </fieldset>
        <button type="submit">Save tip</button>
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
    </div>
  );
}
