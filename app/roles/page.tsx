import type { Route } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { getCurrentUser } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { loadRenderedRolesPage } from "@/lib/roles-page";

export const dynamic = "force-dynamic";

const copy = {
  en: { title: "Roles", edit: "Edit roles page" },
  fr: { title: "Rôles", edit: "Modifier la page Rôles" }
} as const;

export default async function RolesPage() {
  const [content, locale, user] = await Promise.all([
    loadRenderedRolesPage(),
    getInterfaceLocale(),
    getCurrentUser()
  ]);
  const text = copy[locale];
  const canEdit = Boolean(user && canUseAdminTools(user));

  return (
    <ForestPageLayout
      title={text.title}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      actions={
        canEdit ? (
          <Link href={"/roles/edit" as Route} className="button secondary">
            {text.edit}
          </Link>
        ) : undefined
      }
    >
      <section className="panel roles-markdown-frame p-5">
        <MarkdownBlock html={content.bodyHtml} />
      </section>
    </ForestPageLayout>
  );
}
