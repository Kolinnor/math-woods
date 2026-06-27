"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CONTENT_LANGUAGE_COOKIE,
  contentLanguageNativeLabel,
  parseContentLanguage,
  SUPPORTED_CONTENT_LANGUAGES
} from "@/lib/languages";

type LanguageSelectorProps = {
  initialLanguage: string;
};

export function LanguageSelector({ initialLanguage }: LanguageSelectorProps) {
  const router = useRouter();
  const [language, setLanguage] = useState(parseContentLanguage(initialLanguage));

  return (
    <label className="language-selector" title="Choose content language">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">Content language</span>
      <select
        value={language}
        aria-label="Content language"
        onChange={(event) => {
          const nextLanguage = parseContentLanguage(event.target.value);
          setLanguage(nextLanguage);
          document.cookie = `${CONTENT_LANGUAGE_COOKIE}=${encodeURIComponent(
            nextLanguage
          )}; max-age=31536000; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
          router.refresh();
        }}
      >
        {SUPPORTED_CONTENT_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {contentLanguageNativeLabel(option.code)}
          </option>
        ))}
      </select>
    </label>
  );
}
