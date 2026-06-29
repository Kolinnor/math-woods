import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTipAction } from "@/lib/actions/tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { loadTip } from "@/lib/daily-tip";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditTipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const { id } = await params;
  const tipId = Number(id);
  if (!Number.isInteger(tipId)) notFound();

  const tip = await loadTip(tipId);
  if (!tip) notFound();

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
          <span className="text-sm font-medium">Level</span>
          <input name="level" type="number" min="0" max="10" required defaultValue={tip.level} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" maxLength={160} required defaultValue={tip.title} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Description</span>
          <textarea name="description" maxLength={1200} required defaultValue={tip.description} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Body</span>
          <textarea name="body" maxLength={4000} required defaultValue={tip.body} />
        </label>
        <button type="submit">Save tip</button>
      </form>
    </div>
  );
}
