import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipEditorFields } from "@/components/TipEditorFields";
import { createTipAction } from "@/lib/actions/tip-actions";
import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { TipKind } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function NewTipPage() {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  return (
    <ForestPageLayout
      title="New tip or method"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Create a problem-solving tip or method for the daily rotation."
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <Link href="/tips" className="button secondary">
          Back to tips
        </Link>
      }
    >
      <form action={createTipAction} className="panel grid gap-4 p-5">
        <TipEditorFields
          draftKey="tip:new:body"
          initialProblems={[]}
          submitLabel="Create"
          values={{
            translations: {
              en: { title: "", body: "" },
              fr: { title: "", body: "" }
            },
            images: [],
            showInMainMenu: true,
            kind: TipKind.TIP
          }}
        />
      </form>
    </ForestPageLayout>
  );
}
