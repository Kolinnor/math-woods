import Link from "next/link";
import { Plus } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { listHistoricalMathematicians } from "@/lib/historical-mathematicians";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Mathematicians",
    add: "Add mathematician",
    birthplace: "Birthplace",
    portraitAlt: (name: string) => `Portrait of ${name}`
  },
  fr: {
    title: "Mathématiciens",
    add: "Ajouter un mathématicien",
    birthplace: "Lieu de naissance",
    portraitAlt: (name: string) => `Portrait de ${name}`
  }
} as const;

export default async function MathematiciansPage() {
  const [locale, user, mathematicians] = await Promise.all([
    getInterfaceLocale(),
    getCurrentUser(),
    listHistoricalMathematicians()
  ]);
  const text = copy[locale];
  const canAdd = Boolean(user && canUseAdminTools(user));

  return (
    <ForestPageLayout
      className="historical-mathematicians-page"
      title={text.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
      actions={canAdd ? (
        <Link href="/mathematicians/new" className="primary">
          <Plus size={17} aria-hidden="true" />
          {text.add}
        </Link>
      ) : undefined}
    >
      <div className="historical-mathematician-grid">
        {mathematicians.map((mathematician) => (
          <Link
            className="historical-mathematician-card"
            href={`/mathematicians/${mathematician.slug}`}
            key={mathematician.id}
          >
            <div className="historical-mathematician-portrait">
              {mathematician.portraitUrl ? (
                <img src={mathematician.portraitUrl} alt={text.portraitAlt(mathematician.name)} />
              ) : (
                <span aria-hidden="true">{mathematician.name.charAt(0)}</span>
              )}
            </div>
            <div className="historical-mathematician-body">
              <h2>{mathematician.name}</h2>
              {mathematician.lifespan && <p>{mathematician.lifespan}</p>}
              {mathematician.birthPlace && (
                <dl>
                  <dt>{text.birthplace}</dt>
                  <dd>{mathematician.birthPlace}</dd>
                </dl>
              )}
            </div>
          </Link>
        ))}
      </div>
    </ForestPageLayout>
  );
}
