"use client";

import { useEffect, useRef, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { MarkdownInline } from "@/components/MarkdownInline";
import { RELATED_CATEGORIES, relatedCopy, type RelatedCategory, type MathematicianRelatedView } from "@/lib/mathematician-related";

type Result = { id: number; title: string; titleHtml: string; href: string; language?: string };
export function MathematicianRelatedEditor({ initial = [], locale, language }: { initial?: MathematicianRelatedView[]; locale: "fr" | "en"; language: "fr" | "en" }) {
  const fr = locale === "fr", copy = relatedCopy[locale];
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState<RelatedCategory | null>(null);
  const [query, setQuery] = useState(""); const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<Result[]>([]); const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const section = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement | null>(null);
  const names = (key: string, name: string) => `related-${key}-${name}`;
  function captured() {
    const form = section.current?.closest("form"); const data = form ? new FormData(form) : null;
    return items.map(item => ({ ...item, labelMarkdown: String(data?.get(names(item.key, "label")) ?? item.labelMarkdown), noteMarkdown: String(data?.get(names(item.key, "note")) ?? item.noteMarkdown) }));
  }
  function close() { dialog.current?.close(); setKind(null); trigger.current?.focus(); }
  function move(key: string, direction: number) {
    const next = captured(), index = next.findIndex(i => i.key === key), category = next[index].category;
    const positions = next.map((item, i) => item.category === category ? i : -1).filter(i => i >= 0), target = positions[positions.indexOf(index) + direction];
    if (target === undefined) return;
    [next[index], next[target]] = [next[target], next[index]]; setItems(next);
  }
  function add(category: RelatedCategory, result?: Result) {
    const field = category === "CONCEPT" ? "conceptId" : category === "PROBLEM" ? "problemId" : "referenceId";
    if (result && items.some(item => item.category === category && item[field] === result.id)) return;
    setItems([...captured(), { key: crypto.randomUUID(), category, labelMarkdown: result?.title ?? "", noteMarkdown: "", relation: "", referenceId: null, conceptId: null, problemId: null, ...(result ? { [field]: result.id, titleHtml: result.titleHtml, href: result.href } : {}) }]);
    if (result) close();
  }
  useEffect(() => {
    setResults([]); setMore(false); setError("");
    if (!kind || query.trim().length < 2) { setBusy(false); return; }
    setBusy(true); const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind, q: query.trim(), lang: language, offset: String(offset) });
        const response = await fetch(`/api/library/related/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json(); if (controller.signal.aborted) return;
        setResults(data.results); setMore(data.more);
      } catch { if (!controller.signal.aborted) setError(fr ? "Recherche indisponible. Vous pouvez réessayer ou ajouter une référence libre." : "Search unavailable. Try again or add a free reference."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, query, offset, language, fr]);
  return <section ref={section} className="mathematician-related-editor">
    <input name="relatedItems" type="hidden" value={JSON.stringify(items.map(({ key, category, referenceId, conceptId, problemId, relation }) => ({ key, category, referenceId, conceptId, problemId, relation })))} />
    {RELATED_CATEGORIES.filter(category => category !== "LEGACY" || items.some(item => item.category === category)).map(category => {
      const rows = items.filter(item => item.category === category);
      return <section key={category} className="mathematician-related-section">
        <div className="library-name-label"><h3>{copy[category].title}</h3><FieldHelp text={copy[category].help} /></div>
        <div className="mathematician-related-items">{rows.map((item, index) => <article key={item.key} className="mathematician-related-item">
          <div className="mathematician-related-item-heading">
            <span>{index + 1}</span><div className="mathematician-related-order">
              <button type="button" disabled={index === 0} onClick={() => move(item.key, -1)} aria-label={fr ? "Monter" : "Move up"}>↑</button>
              <button type="button" disabled={index === rows.length - 1} onClick={() => move(item.key, 1)} aria-label={fr ? "Descendre" : "Move down"}>↓</button>
              <button type="button" onClick={() => setItems(captured().filter(row => row.key !== item.key))}>{fr ? "Retirer" : "Remove"}</button>
            </div>
          </div>
          {item.referenceId || item.conceptId || item.problemId ? <>
            <input type="hidden" name={names(item.key, "label")} value={item.labelMarkdown} />
            <div>{item.titleHtml ? <MarkdownInline html={item.titleHtml} /> : item.labelMarkdown}</div>
            {item.href && <a href={item.href} target="_blank" rel="noreferrer">{fr ? "Consulter la fiche" : "View entry"}</a>}
            {item.unavailable && <p role="status">{fr ? "Ce lien n’est plus public. Son contenu est conservé." : "This link is no longer public. Its content is preserved."}</p>}
          </> : <MarkdownEditor name={names(item.key, "label")} initialValue={item.labelMarkdown} minHeight="5rem" localDrafts={false} imageUploadEnabled={false} ariaLabel={fr ? "Référence libre" : "Free reference"} />}
          <details><summary>{fr ? "Préciser le lien" : "Link details"}</summary>
            {category === "CONCEPT" && <label><span>{fr ? "Relation" : "Relationship"}</span><select value={item.relation} onChange={e => setItems(captured().map(row => row.key === item.key ? { ...row, relation: e.target.value } : row))}>
              <option value="">{fr ? "Non précisée" : "Not specified"}</option><option value="EPONYM">{fr ? "Porte son nom" : "Named after this person"}</option><option value="CONTRIBUTION">{fr ? "Contribution déterminante" : "Crucial contribution"}</option>
            </select></label>}
            {["WORK", "SOURCE", "LEGACY"].includes(category) && <label><span>{fr ? "Catégorie" : "Category"}</span><select value={category} onChange={e => setItems(captured().map(row => row.key === item.key ? { ...row, category: e.target.value as RelatedCategory } : row))}>
              {category === "LEGACY" && <option value="LEGACY">{copy.LEGACY.title}</option>}<option value="WORK">{copy.WORK.title}</option><option value="SOURCE">{copy.SOURCE.title}</option>
            </select></label>}
            <div className="library-name-label"><span>{fr ? "Précision facultative" : "Optional note"}</span><FieldHelp text={fr ? "Une phrase peut préciser le rôle de la personne ou le passage utile. Vous pouvez laisser ce champ vide." : "A sentence can explain this person’s role or identify a useful passage. You may leave this field blank."} /></div>
            <MarkdownEditor name={names(item.key, "note")} initialValue={item.noteMarkdown} minHeight="5rem" maxLength={4000} localDrafts={false} imageUploadEnabled={false} ariaLabel={fr ? "Précision facultative" : "Optional note"} />
            {category === "SOURCE" && <button type="button" className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(`[${fr ? "réf." : "ref."}](#reference-${item.key})`); setMessage(fr ? "Appel copié : collez-le dans la biographie ou les contributions." : "Reference link copied: paste it into the biography or contributions."); } catch { setMessage(fr ? "Copie impossible." : "Unable to copy."); } }}>{fr ? "Copier un appel de référence" : "Copy an in-text reference link"}</button>}
            {item.referenceId && <button type="button" className="secondary" onClick={() => setItems(captured().map(row => row.key === item.key ? { ...row, referenceId: null, href: null, unavailable: false } : row))}>{fr ? "Conserver comme référence libre" : "Keep as a free reference"}</button>}
          </details>
        </article>)}</div>
        <div className="library-form-actions">
          {category !== "LEGACY" && <button type="button" className="secondary" disabled={items.length >= 100} onClick={e => { trigger.current = e.currentTarget; setKind(category); setQuery(""); setOffset(0); dialog.current?.showModal(); input.current?.focus(); }}>{fr ? "Rechercher et ajouter" : "Search and add"}</button>}
          {["WORK", "SOURCE"].includes(category) && <button type="button" className="secondary" disabled={items.length >= 100} onClick={() => add(category)}>{fr ? "Ajouter une référence libre" : "Add a free reference"}</button>}
        </div>
      </section>;
    })}
    {message && <p role="status">{message}</p>}
    <dialog ref={dialog} className="problem-reference-dialog" aria-label={fr ? "Ajouter un lien" : "Add a link"} onCancel={() => { setKind(null); trigger.current?.focus(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="problem-reference-dialog-header"><h3>{kind ? copy[kind].title : ""}</h3><button type="button" onClick={close}>{fr ? "Fermer" : "Close"}</button></div>
      <label><span>{fr ? "Rechercher" : "Search"}</span><input ref={input} value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setOffset(0); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /></label>
      <p role="status">{busy ? (fr ? "Recherche…" : "Searching…") : error || (query.trim().length < 2 ? (fr ? "Saisissez au moins deux caractères." : "Enter at least two characters.") : results.length === 0 ? (fr ? "Aucun résultat." : "No results.") : "")}</p>
      <ul className="problem-reference-results">{results.map(result => <li key={result.id}><div><MarkdownInline html={result.titleHtml} />{result.language && <small> {result.language.toUpperCase()}</small>}<p><a href={result.href} target="_blank" rel="noreferrer">{fr ? "Consulter" : "Preview"}</a></p></div><button type="button" disabled={items.some(item => item.category === kind && [item.referenceId, item.conceptId, item.problemId].includes(result.id))} onClick={() => kind && add(kind, result)}>{fr ? "Ajouter" : "Add"}</button></li>)}</ul>
      <div className="library-form-actions">{offset > 0 && <button type="button" onClick={() => setOffset(offset - 10)}>{fr ? "Précédents" : "Previous"}</button>}{more && <button type="button" onClick={() => setOffset(offset + 10)}>{fr ? "Suivants" : "Next"}</button>}</div>
    </dialog>
  </section>;
}
