import { contentLanguageFallback } from "@/lib/content-language-fallback";

export function ContentLanguageFallback({
  language,
  expectedLanguage
}: {
  language: string;
  expectedLanguage: string;
}) {
  const fallback = contentLanguageFallback(language, expectedLanguage);
  if (!fallback) return null;

  return (
    <sup
      aria-label={fallback.label}
      className="content-language-fallback"
      lang={fallback.language}
      title={fallback.label}
    >
      {fallback.code}
    </sup>
  );
}
