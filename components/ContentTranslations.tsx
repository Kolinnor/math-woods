import Link from "next/link";
import { Languages } from "lucide-react";
import { contentLanguageLabel } from "@/lib/languages";

type Translation = {
  slug: string;
  title: string;
  language: string;
};

type ContentTranslationsProps = {
  currentLanguage: string;
  hrefPrefix: "/problems" | "/concepts" | "/playlists" | "/quotes";
  translations: Translation[];
  createHref?: string;
};

export function ContentTranslations({ currentLanguage, hrefPrefix, translations, createHref }: ContentTranslationsProps) {
  return (
    <div className="translation-links zen-hide">
      <div className="translation-links-title">
        <Languages size={15} aria-hidden="true" />
        <span>{contentLanguageLabel(currentLanguage)}</span>
      </div>
      {translations.length > 0 && (
        <div className="translation-link-list">
          {translations.map((translation) => (
            <Link key={`${translation.language}-${translation.slug}`} href={`${hrefPrefix}/${translation.slug}` as never}>
              {contentLanguageLabel(translation.language)}
            </Link>
          ))}
        </div>
      )}
      {createHref && (
        <Link href={createHref as never} className="translation-add-link">
          Add translation
        </Link>
      )}
    </div>
  );
}
