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
    submit: "Add mathematician"
  },
  fr: {
    title: "Ajouter un mathématicien",
    name: "Nom",
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
        <button type="submit" className="primary">{text.submit}</button>
      </form>
    </ForestPageLayout>
  );
}
