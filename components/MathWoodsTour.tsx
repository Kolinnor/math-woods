"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import {
  MATH_WOODS_TOUR_LOCALE_PARAM,
  MATH_WOODS_TOUR_PARAM,
  MATH_WOODS_TOUR_STEP_PARAM,
  mathWoodsTourCopy,
  type MathWoodsTourLocale
} from "@/lib/math-woods-tour";
import { CONTENT_LANGUAGE_COOKIE } from "@/lib/languages";
import { TRANSLATION_VIEW_LANGUAGE_PARAM } from "@/lib/translation-routing";

function rememberLanguage(language: MathWoodsTourLocale) {
  document.cookie = `${CONTENT_LANGUAGE_COOKIE}=${encodeURIComponent(language)}; max-age=31536000; path=/; samesite=lax${
    location.protocol === "https:" ? "; secure" : ""
  }`;
}

export function MathWoodsTour({ initialLocale }: { initialLocale: MathWoodsTourLocale }) {
  const router = useRouter();
  const [locale, setLocale] = useState<MathWoodsTourLocale>(initialLocale);
  const text = mathWoodsTourCopy[locale];

  function start() {
    rememberLanguage(locale);
    const params = new URLSearchParams({
      [MATH_WOODS_TOUR_PARAM]: "1",
      [MATH_WOODS_TOUR_STEP_PARAM]: "0",
      [MATH_WOODS_TOUR_LOCALE_PARAM]: locale,
      [TRANSLATION_VIEW_LANGUAGE_PARAM]: locale
    });
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="math-woods-tour">
      <section className="math-tour-start">
        <img src="/math-woods-bear.png" alt="" aria-hidden="true" />
        <h1>{text.pageTitle}</h1>
        <p>{text.intro}</p>
        <fieldset>
          <legend>{text.language}</legend>
          <div className="math-tour-language">
            <button type="button" className={locale === "fr" ? "active" : ""} onClick={() => setLocale("fr")}>Français</button>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button>
          </div>
        </fieldset>
        <div className="math-tour-start-actions">
          <button type="button" className="mw-primary-button" onClick={start}>
            {text.start}<ArrowRight size={17} aria-hidden="true" />
          </button>
          <Link href="/" className="button secondary">{text.backToSite}</Link>
        </div>
      </section>
    </div>
  );
}
