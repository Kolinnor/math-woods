"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { InterfaceLocale } from "@/lib/i18n/types";

type SuggestedConcept = {
  language: string;
  slug: string;
  titleHtml: string;
};

export function ConceptDuplicateSuggestions({ initialTitle, locale }: { initialTitle: string; locale: InterfaceLocale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<SuggestedConcept[]>([]);
  const [query, setQuery] = useState(initialTitle.trim());
  const copy = locale === "fr"
    ? { heading: "Ce concept existe peut-être déjà", open: "Voir la page" }
    : { heading: "This concept may already exist", open: "Open page" };

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    let timeout: number | undefined;
    const readTitle = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const value = form.querySelector<HTMLTextAreaElement>('textarea[name="title"]')?.value.trim() ?? "";
        setQuery(value);
      }, 350);
    };
    form.addEventListener("input", readTitle);
    form.addEventListener("keyup", readTitle);
    return () => {
      window.clearTimeout(timeout);
      form.removeEventListener("input", readTitle);
      form.removeEventListener("keyup", readTitle);
    };
  }, []);

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/concepts/suggest?q=${encodeURIComponent(query)}&all=1`, {
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = await response.json() as { concepts?: SuggestedConcept[] };
        setSuggestions((payload.concepts ?? []).slice(0, 5));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      }
    }, 450);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div ref={rootRef}>
      {suggestions.length > 0 && (
        <aside className="concept-duplicate-suggestions" aria-live="polite">
          <strong>{copy.heading}</strong>
          <div>
            {suggestions.map((concept) => (
              <Link key={concept.slug} href={`/concepts/${concept.slug}`} target="_blank">
                <span dangerouslySetInnerHTML={{ __html: concept.titleHtml }} />
                <small>{concept.language.toUpperCase()} · {copy.open}</small>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
