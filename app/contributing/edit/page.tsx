import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import {
  createContributionPageSectionAction,
  deleteContributionPageSectionAction,
  updateContributionPageContentAction,
  updateContributionPageSectionAction
} from "@/lib/actions/contribution-page-actions";
import { getCurrentUser } from "@/lib/auth";
import { loadEditableContributionPage } from "@/lib/contribution-page";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditContributionPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const params = (await searchParams) ?? {};
  const updated = typeof params.updated === "string" ? params.updated : null;
  const { content, sections } = await loadEditableContributionPage();

  return (
    <ForestPageLayout
      title="Edit contribution page"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Changes appear on the public Contribution page immediately after saving."
      actions={
        <Link href="/contributing" className="button secondary">
          Back to Contribution
        </Link>
      }
    >
      {updated && <p className="success-banner mt-4">Contribution page updated.</p>}

      <div className="grid gap-6">
        <form action={updateContributionPageContentAction} className="panel grid gap-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Page header and requests board</h2>
            <p className="muted text-sm">These fields control the top title and the text above the request list.</p>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Page title</span>
            <input name="title" defaultValue={content.title} required maxLength={160} />
          </label>
          <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Requests eyebrow</span>
              <input name="requestEyebrow" defaultValue={content.requestEyebrow} required maxLength={160} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Requests title</span>
              <input name="requestTitle" defaultValue={content.requestTitle} required maxLength={160} />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Requests intro</span>
            <textarea name="requestIntro" defaultValue={content.requestIntro} required />
          </label>
          <button type="submit">Save page text</button>
        </form>

        <div className="grid gap-5">
          {sections.map((section) => (
            <section key={section.id} className="faq-editor-section">
              <form action={updateContributionPageSectionAction.bind(null, section.id)} className="grid gap-4">
                <div className="faq-editor-section-form">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Section title</span>
                    <input name="title" defaultValue={section.title} required maxLength={160} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Order</span>
                    <input name="position" type="number" defaultValue={section.position} />
                  </label>
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Section body</span>
                  <MarkdownEditor
                    name="bodyMarkdown"
                    initialValue={section.bodyMarkdown}
                    minHeight={section.position === 0 ? "8rem" : "12rem"}
                  />
                </div>
                <div className="settings-actions">
                  <button type="submit">Save section</button>
                  <button form={`delete-contribution-section-${section.id}`} type="submit" className="danger">
                    Delete section
                  </button>
                </div>
              </form>
              <form
                id={`delete-contribution-section-${section.id}`}
                action={deleteContributionPageSectionAction.bind(null, section.id)}
              />
            </section>
          ))}
        </div>

        <form action={createContributionPageSectionAction} className="panel grid gap-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Add section</h2>
            <p className="muted text-sm">New sections appear below the requests board unless you give them an earlier order.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Section title</span>
              <input name="title" required maxLength={160} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Order</span>
              <input name="position" type="number" />
            </label>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Section body</span>
            <MarkdownEditor name="bodyMarkdown" initialValue="" minHeight="10rem" />
          </div>
          <button type="submit">Add section</button>
        </form>
      </div>
    </ForestPageLayout>
  );
}
