import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { findHistoricalMathematician } from "@/lib/historical-mathematicians";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    birthplace: "Birthplace",
    dates: "Dates",
    edit: "Edit",
    portraitAlt: (name: string) => `Portrait of ${name}`
  },
  fr: {
    birthplace: "Lieu de naissance",
    dates: "Dates",
    edit: "Modifier",
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
  const [locale, mathematician, user] = await Promise.all([
    getInterfaceLocale(),
    findHistoricalMathematician(slug),
    getCurrentUser()
  ]);
  if (!mathematician) notFound();
  const text = copy[locale];

  return (
    <ForestPageLayout
      className="historical-mathematician-page"
      title={mathematician.name}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
      actions={user && canUseAdminTools(user) ? (
        <Link href={`/mathematicians/${mathematician.slug}/edit`} className="primary">
          <Pencil size={16} aria-hidden="true" />
          {text.edit}
        </Link>
      ) : undefined}
    >
      <div className="historical-mathematician-page-content">
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
        {mathematician.contentHtml && (
          <article
            className="panel prose-math historical-mathematician-content"
            dangerouslySetInnerHTML={{ __html: mathematician.contentHtml }}
          />
        )}
      </div>
    </ForestPageLayout>
  );
}
