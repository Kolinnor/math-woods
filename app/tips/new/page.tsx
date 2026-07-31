import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipEditorFields } from "@/components/TipEditorFields";
import { createTipAction } from "@/lib/actions/tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { DEFAULT_TIP_IMAGE_POSITION } from "@/lib/tip-images";

export const dynamic = "force-dynamic";

export default async function NewTipPage() {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  return (
    <ForestPageLayout
      title="New tip"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Create a new problem-solving tip for the library and the Tip of the Day rotation."
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <Link href="/tips" className="button secondary">
          Back to tips
        </Link>
      }
    >
      <form action={createTipAction} className="panel grid gap-4 p-5">
        <TipEditorFields
          initialProblems={[]}
          submitLabel="Create tip"
          values={{
            title: "",
            description: "",
            body: "",
            imageUrl: null,
            imagePositionX: DEFAULT_TIP_IMAGE_POSITION,
            imagePositionY: DEFAULT_TIP_IMAGE_POSITION,
            showInMainMenu: true
          }}
        />
      </form>
    </ForestPageLayout>
  );
}
