import Link from "next/link";
import { Check, ChevronDown, Languages, Plus } from "lucide-react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { contentLanguageNativeLabel } from "@/lib/languages";
import { contentLanguageViewHref } from "@/lib/translation-routing";

type Translation = {
  slug: string;
  title: string;
  language: string;
};

type ContentTranslationsProps = {
  currentLanguage: string;
  hrefPrefix: "/problems" | "/concepts" | "/explorations" | "/playlists" | "/quotes";
  translations: Translation[];
  addTranslationLabel?: string;
  createHref?: string;
};

export function ContentTranslations({
  currentLanguage,
  hrefPrefix,
  translations,
  addTranslationLabel = "Add translation",
  createHref
}: ContentTranslationsProps) {
  const currentLabel = contentLanguageNativeLabel(currentLanguage);
  const hasMenuItems = translations.length > 0 || Boolean(createHref);

  return (
    <AutoClosingDetails className="translation-menu zen-hide">
      <summary className="translation-menu-button">
        <Languages size={15} aria-hidden="true" />
        <span>{currentLabel}</span>
        {hasMenuItems && <ChevronDown size={14} aria-hidden="true" />}
      </summary>
      {hasMenuItems && (
        <div className="translation-menu-popover">
          <span className="translation-menu-current">
            <Check size={14} aria-hidden="true" />
            {currentLabel}
          </span>
          {translations.map((translation) => (
            <Link
              key={`${translation.language}-${translation.slug}`}
              href={contentLanguageViewHref(hrefPrefix, translation.slug, translation.language) as never}
              className="translation-menu-link"
            >
              {contentLanguageNativeLabel(translation.language)}
            </Link>
          ))}
          {createHref && (
            <Link href={createHref as never} className="translation-menu-add-link">
              <Plus size={14} aria-hidden="true" />
              {addTranslationLabel}
            </Link>
          )}
        </div>
      )}
    </AutoClosingDetails>
  );
}
