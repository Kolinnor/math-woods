"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";

type Suggestion = { id: number; slug: string; name: string; lifespan: string; portraitUrl: string | null };

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
        {person.portraitUrl && <img src={person.portraitUrl} alt="" />}
        <span><strong>{person.name}</strong>{person.lifespan && <small>{person.lifespan}</small>}</span>
      </Link>)}
    </aside>}
    <details className="library-form-section"><summary>{fr ? "Autres noms (facultatif)" : "Other names (optional)"}</summary>
      <label><span>{fr ? "Un nom par ligne" : "One name per line"}</span><textarea name="aliases" rows={3} maxLength={4000} defaultValue={aliases.join("\n")} aria-describedby="mathematician-alias-help" /></label>
      <p id="mathematician-alias-help" className="muted">{fr
        ? "Ajoutez des variantes réellement utilisées : nom complet, pseudonyme, autre orthographe ou translittération. Elles permettent de retrouver cette fiche dans toutes les langues. Inutile de répéter les variantes de majuscules ou d’accents."
        : "Add names actually used: full names, pseudonyms, other spellings or transliterations. They help find this entry in every language. There is no need to repeat differences in capitalization or accents."}</p>
    </details>
  </div>;
}
