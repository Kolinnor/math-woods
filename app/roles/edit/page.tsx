import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { updateRolesPageAction } from "@/lib/actions/roles-page-actions";
import { getCurrentUser } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { loadRolesPage } from "@/lib/roles-page";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Edit roles page",
    back: "Back to Roles",
    saved: "Roles page updated.",
    body: "Page content",
    save: "Save"
  },
  fr: {
    title: "Modifier la page Rôles",
    back: "Retour aux Rôles",
    saved: "Page Rôles mise à jour.",
    body: "Contenu de la page",
    save: "Enregistrer"
  }
} as const;

export default async function EditRolesPage({
  searchParams
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const [user, locale] = await Promise.all([
    getCurrentUser(),
    getInterfaceLocale()
  ]);
  if (!user || !canUseAdminTools(user)) notFound();

  const params = (await searchParams) ?? {};
  const content = await loadRolesPage();
  const text = copy[locale];

  return (
    <ForestPageLayout
      title={text.title}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      actions={
        <Link href="/roles" className="button secondary">
          {text.back}
        </Link>
      }
    >
      {params.updated && <p className="success-banner mb-4">{text.saved}</p>}
      <form action={updateRolesPageAction} className="panel grid gap-4 p-5">
        <div className="grid gap-2">
          <span className="text-sm font-medium">{text.body}</span>
          <MarkdownEditor
            name="bodyMarkdown"
            initialValue={content.bodyMarkdown}
            minHeight="22rem"
            draftKey="roles-page:body"
          />
        </div>
        <button type="submit">{text.save}</button>
      </form>
    </ForestPageLayout>
  );
}
