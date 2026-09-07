"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";
import { PortraitImage } from "@/components/library/PortraitImage";

type Suggestion = { id: number; slug: string; name: string; lifespan: string; portraitUrl: string | null; portraitCrop?: unknown };

export function MathematicianNameFields({ locale, language, initialName, aliases = [], excludeId }: {
  locale: "fr" | "en"; language: "fr" | "en"; initialName: string; aliases?: string[]; excludeId?: number;
}) {
  const fr = locale === "fr";
  const [name, setName] = useState(initialName);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  useEffect(() => {
    setSuggestions([]);
    if (name.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ q: name.trim(), lang: language });
        if (excludeId) query.set("exclude", String(excludeId));
        const response = await fetch(`/api/library/mathematicians/suggest?${query}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { mathematicians: Suggestion[] };
        if (!controller.signal.aborted) setSuggestions(data.mathematicians);
      } catch { /* A failed suggestion must never prevent contributing. */ }
    }, 350);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [name, language, excludeId]);

  return <div className="library-name-fields">
    <div className="library-name-label"><label htmlFor="mathematician-name">{fr ? "Nom" : "Name"}</label><FieldHelp text={fr
      ? "Indiquez le nom sous lequel cette personne est habituellement connue, dans la langue de la fiche. Vous pouvez ajouter ses autres noms, pseudonymes ou variantes d’écriture dans « Autres noms »."
      : "Use the name this person is commonly known by, in the language of the entry. Add other names, pseudonyms or spelling variants under ‘Other names’."} /></div>
    <input id="mathematician-name" name="name" required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
    {suggestions.length > 0 && <aside className="library-name-suggestions" aria-label={fr ? "Fiches similaires" : "Similar entries"}>
      <p>{fr ? "Une fiche existe peut-être déjà :" : "An entry may already exist:"}</p>
      {suggestions.map(person => <Link key={person.id} href={`/library/mathematicians/${person.slug}`} target="_blank" rel="noreferrer">
        {person.portraitUrl && <PortraitImage src={person.portraitUrl} alt="" crop={person.portraitCrop} />}
        <span><strong>{person.name}</strong>{person.lifespan && <small>{person.lifespan}</small>}</span>
      </Link>)}
    </aside>}
    <details className="library-form-section"><summary>{fr ? "Autres noms (facultatif)" : "Other names (optional)"}</summary>
      <div className="library-name-label"><label htmlFor="mathematician-aliases">{fr ? "Un nom par ligne" : "One name per line"}</label><FieldHelp text={fr
        ? "Ajoutez seulement des variantes qui sont utilisées dans la langue de cette page. Il n’est pas utile de mettre des traductions, ni d’écrire des variantes de majuscules ou d’accents."
        : "Only add variants used in the language of this page. There is no need to add translations or variants that differ only in capitalization or accents."} /></div>
      <textarea id="mathematician-aliases" name="aliases" rows={3} maxLength={4000} defaultValue={aliases.join("\n")} />
    </details>
  </div>;
}
