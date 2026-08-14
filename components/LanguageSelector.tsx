"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CONTENT_LANGUAGE_COOKIE,
  ACTIVE_CONTENT_LANGUAGES,
  contentLanguageNativeLabel,
  isActiveContentLanguage,
  parseActiveContentLanguage
} from "@/lib/languages";
import {
  requestedTranslationLanguage,
  TRANSLATION_VIEW_LANGUAGE_PARAM
} from "@/lib/translation-routing";

type LanguageSelectorProps = {
  initialLanguage: string;
  label: string;
  title: string;
};

function rememberLanguage(language: string) {
  document.cookie = `${CONTENT_LANGUAGE_COOKIE}=${encodeURIComponent(
    language
  )}; max-age=31536000; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

export function LanguageSelector({ initialLanguage, label, title }: LanguageSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialActiveLanguage = parseActiveContentLanguage(initialLanguage);
  const requestedLanguage = requestedTranslationLanguage(
    searchParams.get(TRANSLATION_VIEW_LANGUAGE_PARAM)
  );
  const activeRequestedLanguage = isActiveContentLanguage(requestedLanguage)
    ? requestedLanguage
    : null;
  const [language, setLanguage] = useState(activeRequestedLanguage ?? initialActiveLanguage);

  useEffect(() => {
    const nextLanguage = activeRequestedLanguage ?? initialActiveLanguage;
    setLanguage(nextLanguage);

    if (activeRequestedLanguage && activeRequestedLanguage !== initialActiveLanguage) {
      rememberLanguage(activeRequestedLanguage);
      router.refresh();
    }
  }, [activeRequestedLanguage, initialActiveLanguage, router]);

  return (
    <label className="language-selector" title={title}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select
        value={language}
        aria-label={label}
        onChange={(event) => {
          const nextLanguage = parseActiveContentLanguage(event.target.value);
          setLanguage(nextLanguage);
          rememberLanguage(nextLanguage);
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
