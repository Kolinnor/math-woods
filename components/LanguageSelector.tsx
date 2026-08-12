"use client";

import type { Route } from "next";
import { useState } from "react";
import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CONTENT_LANGUAGE_COOKIE,
  ACTIVE_CONTENT_LANGUAGES,
  contentLanguageNativeLabel,
  parseActiveContentLanguage
} from "@/lib/languages";
import { TRANSLATION_VIEW_LANGUAGE_PARAM } from "@/lib/translation-routing";

type LanguageSelectorProps = {
  initialLanguage: string;
};

export function LanguageSelector({ initialLanguage }: LanguageSelectorProps) {
  const router = useRouter();
  const [language, setLanguage] = useState(parseActiveContentLanguage(initialLanguage));

  return (
    <label className="language-selector" title="Choose language">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        value={language}
        aria-label="Language"
        onChange={(event) => {
          const nextLanguage = parseActiveContentLanguage(event.target.value);
          setLanguage(nextLanguage);
          document.cookie = `${CONTENT_LANGUAGE_COOKIE}=${encodeURIComponent(
            nextLanguage
          )}; max-age=31536000; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
          const currentUrl = new URL(window.location.href);
          const currentHref = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
          currentUrl.searchParams.delete(TRANSLATION_VIEW_LANGUAGE_PARAM);
          const nextHref = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
          if (nextHref === currentHref) router.refresh();
          else router.replace(nextHref as Route);
        }}
      >
        {ACTIVE_CONTENT_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {contentLanguageNativeLabel(option.code)}
          </option>
        ))}
      </select>
    </label>
  );
}
