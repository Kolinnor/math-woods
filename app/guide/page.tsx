import Link from "next/link";
import type { Route } from "next";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { getTranslations } from "@/lib/i18n/server";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const t = await getTranslations();
  const sections = await Promise.all(
    t.guide.sections.map(async (section) => ({
      title: section.title,
      bodyHtml: await renderMarkdown(section.bodyMarkdown)
    }))
  );

  return (
    <ForestPageLayout
      title={t.guide.title}
      description={t.guide.description}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      actions={
        <Link href={"/contributing/tasks" as Route} className="button secondary">
          {t.guide.backToTasks}
        </Link>
      }
    >
      <p className="guide-intro">{t.guide.intro}</p>
      <div className="guide-sections">
        {sections.map((section) => (
          <section key={section.title} className="guide-section">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <MarkdownBlock html={section.bodyHtml} />
          </section>
        ))}
      </div>
    </ForestPageLayout>
  );
}
