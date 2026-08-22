import { Save } from "lucide-react";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipsAdminTabs } from "@/components/TipsAdminTabs";
import { updateHomePriorityAction } from "@/lib/actions/home-priority-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_HOME_PRIORITIES, homePriorityForLocale } from "@/lib/home-priorities";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const EDITABLE_LOCALES: { code: InterfaceLocale; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" }
];

export default async function HomePrioritiesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const [{ saved }, rows] = await Promise.all([
    searchParams,
    prisma.homePriorityContent.findMany({ where: { language: { in: EDITABLE_LOCALES.map(({ code }) => code) } } })
  ]);
  const contentByLanguage = new Map(rows.map((row) => [row.language, row]));

  return (
    <ForestPageLayout
      title="Homepage"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Edit the priorities shown at the bottom of the homepage."
      meta={<p>Visible to admins</p>}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <TipsAdminTabs active="priorities" />

      {saved && (
        <p className="success-banner mb-4" role="status">
          {saved === "fr" ? "Priorités en français enregistrées." : "English priorities saved."}
        </p>
      )}

      <div className="home-priorities-admin-grid">
        {EDITABLE_LOCALES.map(({ code, label }) => {
          const content = homePriorityForLocale(contentByLanguage.get(code) ?? DEFAULT_HOME_PRIORITIES[code], code);
          return (
            <form
              key={code}
              action={updateHomePriorityAction.bind(null, code)}
              className="panel grid gap-4 p-5"
            >
              <h2 className="text-lg font-semibold">{label}</h2>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Title</span>
                <input name="title" defaultValue={content.title} required maxLength={160} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Text</span>
                <textarea name="body" defaultValue={content.body} required maxLength={4000} rows={6} />
              </label>
              <button type="submit">
                <Save size={17} aria-hidden="true" />
                Save {label}
              </button>
            </form>
          );
        })}
      </div>
    </ForestPageLayout>
  );
}
