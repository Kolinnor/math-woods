import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { findHistoricalMathematician } from "@/lib/historical-mathematicians";
import { getInterfaceLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    birthplace: "Birthplace",
    dates: "Dates",
    portraitAlt: (name: string) => `Portrait of ${name}`
  },
  fr: {
    birthplace: "Lieu de naissance",
    dates: "Dates",
    portraitAlt: (name: string) => `Portrait de ${name}`
  }
} as const;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const mathematician = await findHistoricalMathematician(slug);
  return { title: mathematician?.name ?? "Mathematician" };
}

export default async function MathematicianPage({ params }: PageProps) {
  const { slug } = await params;
  const [locale, mathematician] = await Promise.all([
    getInterfaceLocale(),
    findHistoricalMathematician(slug)
  ]);
  if (!mathematician) notFound();
  const text = copy[locale];

  return (
    <ForestPageLayout
      className="historical-mathematician-page"
      title={mathematician.name}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
    >
      <article className="historical-mathematician-profile">
        <div className="historical-mathematician-profile-portrait">
          {mathematician.portraitUrl ? (
            <img src={mathematician.portraitUrl} alt={text.portraitAlt(mathematician.name)} />
          ) : (
            <span aria-hidden="true">{mathematician.name.charAt(0)}</span>
          )}
        </div>
        <dl>
          <div>
            <dt>{text.dates}</dt>
            <dd>{mathematician.lifespan}</dd>
          </div>
          <div>
            <dt>{text.birthplace}</dt>
            <dd>{mathematician.birthPlace}</dd>
          </div>
        </dl>
      </article>
    </ForestPageLayout>
  );
}
