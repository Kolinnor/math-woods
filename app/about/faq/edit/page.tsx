import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import {
  createFaqItemAction,
  createFaqSectionAction,
  deleteFaqItemAction,
  deleteFaqSectionAction,
  updateFaqItemAction,
  updateFaqSectionAction
} from "@/lib/actions/faq-actions";
import { getCurrentUser } from "@/lib/auth";
import { loadEditableFaqSections } from "@/lib/faq";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditFaqPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const params = (await searchParams) ?? {};
  const updated = typeof params.updated === "string" ? params.updated : null;
  const sections = await loadEditableFaqSections();

  return (
    <ForestPageLayout
      title="Edit FAQ"
      eyebrow="Admin"
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description="Answers use Markdown. Changes appear on the public FAQ immediately after saving."
      actions={
        <Link href="/about" className="button secondary">
          Back to FAQ
        </Link>
      }
    >
      {updated && <p className="success-banner mt-4">FAQ updated.</p>}

      <div className="grid gap-6">
        {sections.map((section) => (
          <section key={section.id} className="faq-editor-section">
            <form action={updateFaqSectionAction.bind(null, section.id)} className="faq-editor-section-form">
              <label className="grid gap-2">
                <span className="text-sm font-medium">Section title</span>
                <input name="title" defaultValue={section.title} required maxLength={160} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Anchor ID</span>
                <input name="anchorId" defaultValue={section.anchorId} maxLength={240} placeholder="licensing" />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Order</span>
                <input name="position" type="number" defaultValue={section.position} />
              </label>
              <div className="settings-actions">
                <button type="submit">Save section</button>
                <button form={`delete-faq-section-${section.id}`} type="submit" className="danger">
                  Delete section
                </button>
              </div>
            </form>
            <form id={`delete-faq-section-${section.id}`} action={deleteFaqSectionAction.bind(null, section.id)} />

            <div className="faq-editor-items">
              {section.items.map((item) => (
                <form key={item.id} action={updateFaqItemAction.bind(null, item.id)} className="faq-editor-item">
                  <div className="faq-editor-item-header">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Question</span>
                      <input name="question" defaultValue={item.question} required maxLength={160} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Section</span>
                      <select name="sectionId" defaultValue={section.id}>
                        {sections.map((targetSection) => (
                          <option key={targetSection.id} value={targetSection.id}>
                            {targetSection.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Order</span>
                      <input name="position" type="number" defaultValue={item.position} />
                    </label>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Answer Markdown</span>
                    <textarea name="answerMarkdown" defaultValue={item.answerMarkdown} required />
                  </label>
                  <div className="settings-actions">
                    <button type="submit">Save question</button>
                    <button form={`delete-faq-item-${item.id}`} type="submit" className="danger">
                      Delete question
                    </button>
                  </div>
                </form>
              ))}
            </div>

            <form action={createFaqItemAction.bind(null, section.id)} className="faq-editor-new-item">
              <h3>Add a question to {section.title}</h3>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Question</span>
                <input name="question" required maxLength={160} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Answer Markdown</span>
                <textarea name="answerMarkdown" required />
              </label>
              <button type="submit" className="secondary">
                Add question
              </button>
            </form>

            {section.items.map((item) => (
              <form key={`delete-${item.id}`} id={`delete-faq-item-${item.id}`} action={deleteFaqItemAction.bind(null, item.id)} />
            ))}
          </section>
        ))}
      </div>

      <form action={createFaqSectionAction} className="panel grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Add section</h2>
          <p className="muted text-sm">Use an anchor ID only when the section should be linkable with a hash URL.</p>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Section title</span>
          <input name="title" required maxLength={160} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Anchor ID</span>
          <input name="anchorId" maxLength={240} />
        </label>
        <button type="submit">Add section</button>
      </form>
    </ForestPageLayout>
  );
}
