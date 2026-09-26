"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Entry = { id: number; label: string; detail?: string };

/**
 * Chooses one published library entry by searching for it, so that forms do not list the whole
 * catalogue. The chosen id is submitted in a hidden input named `name` (empty when cleared).
 */
export function LibraryEntryPicker({ name, kind, label, locale, initial }: {
  name: string;
  kind: "mathematician" | "milestone" | "reference";
  label: string;
  locale: "fr" | "en";
  initial?: Entry | null;
}) {
  const fr = locale === "fr";
  const [selected, setSelected] = useState<Entry | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [active, setActive] = useState(0);
  const listId = useId();
  const request = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setStatus("idle"); return; }
    const id = ++request.current;
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/library/entries/search?kind=${kind}&lang=${locale}&q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
        const data = await response.json() as { results?: Entry[] };
        if (id !== request.current) return;
        setResults(data.results ?? []);
        setActive(0);
        setStatus(response.ok ? (data.results?.length ? "idle" : "empty") : "error");
      } catch {
        if (id === request.current) setStatus("error");
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [kind, locale, query]);

  const choose = (entry: Entry) => { setSelected(entry); setQuery(""); setResults([]); setStatus("idle"); };

  return <div className="library-entry-picker">
    <span className="library-entry-picker-label">{label}</span>
    <input type="hidden" name={name} value={selected?.id ?? ""} />
    {selected ? <div className="library-entry-picker-selected">
      <span><strong>{selected.label}</strong>{selected.detail && <small>{selected.detail}</small>}</span>
      <button type="button" className="library-entry-picker-clear" onClick={() => setSelected(null)} aria-label={fr ? `Retirer ${selected.label}` : `Remove ${selected.label}`}><X size={15} aria-hidden="true" /></button>
    </div> : <div className="library-entry-picker-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={query} placeholder={fr ? "Rechercher…" : "Search…"} aria-label={label} role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-autocomplete="list"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActive(index => (index + 1) % results.length); }
          else if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActive(index => (index - 1 + results.length) % results.length); }
          else if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
          else if (event.key === "Escape") { setResults([]); }
        }} />
    </div>}
    {!selected && results.length > 0 && <ul id={listId} role="listbox" className="library-entry-picker-results">
      {results.map((entry, index) => <li key={entry.id} role="option" aria-selected={index === active}>
        <button type="button" onClick={() => choose(entry)} onMouseEnter={() => setActive(index)}><strong>{entry.label}</strong>{entry.detail && <small>{entry.detail}</small>}</button>
      </li>)}
    </ul>}
    {!selected && status === "empty" && <p className="library-entry-picker-note">{fr ? "Aucune fiche publiée ne correspond." : "No published entry matches."}</p>}
    {!selected && status === "error" && <p className="library-entry-picker-note">{fr ? "La recherche n’a pas abouti." : "The search failed."}</p>}
  </div>;
}
