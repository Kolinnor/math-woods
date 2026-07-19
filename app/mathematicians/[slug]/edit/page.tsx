import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { updateMathematicianAction } from "@/lib/actions/mathematician-actions";
import { requireUser } from "@/lib/auth";
import { findHistoricalMathematician } from "@/lib/historical-mathematicians";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Edit mathematician",
    name: "Name",
    dates: "Dates",
    birthplace: "Birthplace",
    portrait: "Portrait URL",
    portraitHint: "Optional. Use a secure https URL.",
    content: "Content",
    save: "Save changes"
  },
  fr: {
    title: "Modifier le mathématicien",
    name: "Nom",
    dates: "Dates",
    birthplace: "Lieu de naissance",
    portrait: "URL du portrait",
    portraitHint: "Facultatif. Utilisez une URL https sécurisée.",
    content: "Contenu",
    save: "Enregistrer"
  }
} as const;

export default async function EditMathematicianPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [user, locale, mathematician] = await Promise.all([
    requireUser(),
    getInterfaceLocale(),
    findHistoricalMathematician(slug)
  ]);
  if (!mathematician || !canUseAdminTools(user)) notFound();
  const text = copy[locale];

  return (
    <ForestPageLayout
      className="historical-mathematician-form-page"
      title={text.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
      meta={<p>{mathematician.name}</p>}
    >
      <form
        action={updateMathematicianAction.bind(null, mathematician.id)}
        className="panel historical-mathematician-form historical-mathematician-edit-form"
      >
        <label>
          <span>{text.name}</span>
          <input name="name" required defaultValue={mathematician.name} autoComplete="off" />
        </label>
        <div>
          <label>
            <span>{text.dates}</span>
            <input name="lifespan" required defaultValue={mathematician.lifespan} autoComplete="off" />
          </label>
          <label>
            <span>{text.birthplace}</span>
            <input name="birthPlace" required defaultValue={mathematician.birthPlace} autoComplete="off" />
          </label>
        </div>
        <label>
          <span>{text.portrait}</span>
          <input name="portraitUrl" type="text" defaultValue={mathematician.portraitUrl ?? ""} autoComplete="url" />
          <small>{text.portraitHint}</small>
        </label>
        <div className="historical-mathematician-editor-field">
          <span>{text.content}</span>
          <MarkdownEditor
            name="contentMarkdown"
            initialValue={mathematician.contentMarkdown}
            minHeight="22rem"
          />
        </div>
        <button type="submit" className="primary">{text.save}</button>
      </form>
    </ForestPageLayout>
  );
}
