import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { requireUser } from "@/lib/auth";
import { createMathematicianAction } from "@/lib/actions/mathematician-actions";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";

const copy = {
  en: {
    title: "Add mathematician",
    name: "Name",
    dates: "Dates",
    datesPlaceholder: "1707-1783",
    birthplace: "Birthplace",
    birthplacePlaceholder: "Basel, Switzerland",
    portrait: "Portrait URL",
    portraitHint: "Optional. Use a secure https URL.",
    submit: "Add mathematician"
  },
  fr: {
    title: "Ajouter un mathématicien",
    name: "Nom",
    dates: "Dates",
    datesPlaceholder: "1707-1783",
    birthplace: "Lieu de naissance",
    birthplacePlaceholder: "Bâle, Suisse",
    portrait: "URL du portrait",
    portraitHint: "Facultatif. Utilisez une URL https sécurisée.",
    submit: "Ajouter le mathématicien"
  }
} as const;

export default async function NewMathematicianPage() {
  const [user, locale] = await Promise.all([requireUser(), getInterfaceLocale()]);
  if (!canUseAdminTools(user)) notFound();
  const text = copy[locale];

  return (
    <ForestPageLayout
      className="historical-mathematician-form-page"
      title={text.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
    >
      <form action={createMathematicianAction} className="panel historical-mathematician-form">
        <label>
          <span>{text.name}</span>
          <input name="name" required autoComplete="off" />
        </label>
        <div>
          <label>
            <span>{text.dates}</span>
            <input name="lifespan" required placeholder={text.datesPlaceholder} autoComplete="off" />
          </label>
          <label>
            <span>{text.birthplace}</span>
            <input name="birthPlace" required placeholder={text.birthplacePlaceholder} autoComplete="off" />
          </label>
        </div>
        <label>
          <span>{text.portrait}</span>
          <input name="portraitUrl" type="text" placeholder="https://..." autoComplete="url" />
          <small>{text.portraitHint}</small>
        </label>
        <button type="submit" className="primary">{text.submit}</button>
      </form>
    </ForestPageLayout>
  );
}
