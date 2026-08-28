"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import { ChevronDown, Languages } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CONTENT_LANGUAGE_COOKIE,
  ACTIVE_CONTENT_LANGUAGES,
  contentLanguageNativeLabel,
  isActiveContentLanguage,
  parseActiveContentLanguage
} from "@/lib/languages";
import {
  hrefWithTranslationViewLanguage,
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

    if (!activeRequestedLanguage) {
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const historyHref = hrefWithTranslationViewLanguage(currentHref, nextLanguage);
      if (historyHref !== currentHref) {
        window.history.replaceState(window.history.state, "", historyHref);
      }
    }

    if (activeRequestedLanguage && activeRequestedLanguage !== initialActiveLanguage) {
      rememberLanguage(activeRequestedLanguage);
      router.refresh();
    }
  }, [activeRequestedLanguage, initialActiveLanguage, router]);

  return (
    <label className="language-selector" title={title}>
      <Languages className="language-selector-icon" size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <span className="language-selector-short-label" aria-hidden="true">
        {language.toUpperCase()}
      </span>
      <select
        value={language}
        aria-label={label}
        onChange={(event) => {
          const nextLanguage = parseActiveContentLanguage(event.target.value);
          setLanguage(nextLanguage);
          rememberLanguage(nextLanguage);
          const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          const currentEntryHref = hrefWithTranslationViewLanguage(currentHref, language);
          if (currentEntryHref !== currentHref) {
            window.history.replaceState(window.history.state, "", currentEntryHref);
          }
          router.push(hrefWithTranslationViewLanguage(currentHref, nextLanguage) as Route, { scroll: false });
        }}
      >
        {ACTIVE_CONTENT_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {contentLanguageNativeLabel(option.code)}
          </option>
        ))}
      </select>
      <ChevronDown className="language-selector-chevron" size={14} aria-hidden="true" />
    </label>
  );
}
