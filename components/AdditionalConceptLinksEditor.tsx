"use client";

import { useEffect, useId, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";
import { additionalLinksCopy, MAX_ADDITIONAL_CONCEPT_LINKS, type AdditionalConceptLink } from "@/lib/additional-concept-links";

export function AdditionalConceptLinksEditor({ initial = [], locale, excludeSlug }: {
  initial?: AdditionalConceptLink[]; locale: string; excludeSlug?: string;
}) {
  const copy = additionalLinksCopy(locale), inputId = useId();
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdditionalConceptLink[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    if (query.trim().length < 2) { setStatus("idle"); return () => controller.abort(); }
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/concepts/suggest?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        if (!controller.signal.aborted) { setResults(data.concepts ?? []); setStatus("done"); }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);
  const available = results.filter(row => row.slug !== excludeSlug && !selected.some(item => item.slug === row.slug));
  return <details className="additional-concept-links-editor" open={initial.length > 0}>
    <summary>{copy.add}</summary>
    <div className="grid gap-3 mt-3">
      <label htmlFor={inputId} className="field-label-with-help"><span>{copy.title}</span><FieldHelp text={copy.help} /></label>
      <input type="hidden" name="additionalConceptSlugs" value={JSON.stringify(selected.map(item => item.slug))} />
      {selected.length > 0 && <ul className="additional-concept-links-selection">
        {selected.map(item => <li key={item.slug}><span>{item.title}</span><button type="button" className="secondary" aria-label={`${copy.remove} ${item.title}`}
          onClick={() => setSelected(selected.filter(row => row.slug !== item.slug))}>{copy.remove}</button></li>)}
      </ul>}
      {selected.length < MAX_ADDITIONAL_CONCEPT_LINKS ? <>
        <input id={inputId} type="search" value={query} placeholder={copy.search} autoComplete="off" onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
        <div aria-live="polite" className="muted text-sm">{status === "loading" ? copy.loading : status === "error" ? copy.error : status === "done" && !available.length ? copy.empty : ""}</div>
        {available.length > 0 && <ul className="additional-concept-links-results">{available.map(item => <li key={item.slug}><button type="button" className="secondary" onClick={() => {
          setSelected([...selected, item]); setQuery(""); setResults([]);
        }}>{item.title}{item.language && <small> · {item.language.toUpperCase()}</small>}</button></li>)}</ul>}
      </> : <p className="muted text-sm">{copy.limit}</p>}
    </div>
  </details>;
}
