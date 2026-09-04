import Link from "next/link";

export function LibraryTranslationEditorNav({
  baseHref,
  locale,
  activeLanguage,
  existingLanguages
}: {
  baseHref: string;
  locale: "en" | "fr";
  activeLanguage: "en" | "fr";
  existingLanguages: string[];
}) {
  const available = new Set(existingLanguages);
  return (
    <nav className="library-translation-editor" aria-label={locale === "fr" ? "Langue du contenu modifié" : "Language of the edited content"}>
      {(["fr", "en"] as const).map((language) => (
        <Link
          key={language}
          href={`${baseHref}?lang=${language}` as never}
          aria-current={language === activeLanguage ? "page" : undefined}
        >
          {language.toUpperCase()}
          {!available.has(language) && <small>{locale === "fr" ? "nouvelle" : "new"}</small>}
        </Link>
      ))}
    </nav>
  );
}
