"use client";
import { useEffect, useId, useRef, useState } from "react";
import { LibraryReferenceRole } from "@prisma/client";
import { citationAdditionalDetails, parseProblemCitations, MAX_PROBLEM_CITATIONS, type ProblemCitation } from "@/lib/problem-citations";
import { FieldHelp } from "@/components/FieldHelp";
import { clearAcknowledgedCitationDraft } from "@/components/CitationDraftReceipt";
import { ProblemCitations } from "@/components/ProblemCitations";
import { parseConceptCitations } from "@/lib/concept-citations";

type Result = { id: number; title: string; authors: string | null; publisher: string | null; year: number | null; url: string | null; edition?: string | null; volume?: string | null; translator?: string | null; editionCount?: number };
function blank(citationKey: string): ProblemCitation {
  return { citationKey, referenceId: null, text: "", url: null, locator: null, note: null, role: LibraryReferenceRole.SOURCE, isPrimary: false, spoiler: false };
}
function meaningful(items: ProblemCitation[]) { return items.filter((c) => c.text.trim() || c.referenceId || c.url || c.locator || c.note); }
function initialRows(items: ProblemCitation[], original: boolean) {
  return original ? meaningful(items) : items.length ? items : [blank("initial")];
}

export function ProblemCitationEditor({ initial, initialOriginal = false, draftKey, locale, contentType = "problem" }: { initial: ProblemCitation[]; initialOriginal?: boolean; draftKey: string; locale: "en" | "fr"; contentType?: "problem" | "concept" }) {
  const fr = locale === "fr";
  const isConcept = contentType === "concept";
  const fieldName = isConcept ? "conceptCitations" : "problemCitations";
  const id = useId();
  const [citations, setCitations] = useState<ProblemCitation[]>(() => initialRows(initial, initialOriginal));
  const [base, setBase] = useState(initial);
  const [original, setOriginal] = useState(initialOriginal);
  const [originalBase, setOriginalBase] = useState(initialOriginal);
  const [token, setToken] = useState("");
  const [restored, setRestored] = useState(false);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [work, setWork] = useState<Result | null>(null);
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const initialJson = JSON.stringify(initial);

  useEffect(() => {
    clearAcknowledgedCitationDraft();
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (saved && Array.isArray(saved.citations) && Array.isArray(saved.base)) {
        if (typeof saved.token !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(saved.token)) throw new Error("Invalid draft token.");
        // Empty draft rows are UI placeholders, not submitted citations.
        parseProblemCitations(saved.citations.map((c: ProblemCitation) => ({ ...c, text: typeof c.text === "string" && !c.text.trim() ? "draft" : c.text, url: null })));
        if (saved.citations.some((c: ProblemCitation) => c.url !== null && (typeof c.url !== "string" || c.url.length > 2000))) throw new Error("Invalid draft URL.");
        setCitations(initialRows(saved.citations, typeof saved.original === "boolean" ? saved.original : initialOriginal));
        setBase(parseProblemCitations(saved.base));
        setOriginal(typeof saved.original === "boolean" ? saved.original : initialOriginal);
        setOriginalBase(typeof saved.originalBase === "boolean" ? saved.originalBase : initialOriginal);
        setToken(saved.token);
        setRestored(true);
        return;
      }
    } catch { /* Corrupt or unavailable local storage must not block editing. */ }
    const current = JSON.parse(initialJson) as ProblemCitation[];
    setCitations(initialRows(current, initialOriginal));
    setBase(current);
    setOriginal(initialOriginal);
    setOriginalBase(initialOriginal);
    setToken(crypto.randomUUID());
  }, [draftKey, initialJson, initialOriginal]);

  function change(next: ProblemCitation[], nextOriginal = original) {
    const nextToken = crypto.randomUUID();
    setCitations(next);
    setOriginal(nextOriginal);
    setToken(nextToken);
    try { localStorage.setItem(draftKey, JSON.stringify({ citations: next, base, original: nextOriginal, originalBase, token: nextToken })); } catch { /* Keep the form usable. */ }
  }
  function update(key: string, patch: Partial<ProblemCitation>) {
    change(citations.map((c) => c.citationKey === key ? { ...c, ...patch } : c));
  }
  function close() { dialog.current?.close(); setOpen(false); searchButton.current?.focus(); }
  function focusPassage(key: string) {
    requestAnimationFrame(() => {
      section.current?.querySelector<HTMLElement>(`[data-citation="${key}"]`)?.focus();
    });
  }
  function choose(result: Result) {
    const existing = citations.find((c) => c.referenceId === result.id);
    if (existing) { close(); focusPassage(existing.citationKey); return; }
    const key = crypto.randomUUID();
    const editionDetails = [result.edition, result.volume ? `vol. ${result.volume}` : null, result.translator, result.publisher, result.year].filter(Boolean).join(", ");
    const title = [result.authors, result.title].filter(Boolean).join(" — ");
    const next = [...meaningful(citations), { ...blank(key), referenceId: result.id, text: `${title}${editionDetails ? ` (${editionDetails})` : ""}`, url: result.url }];
    change(next);
    close();
    focusPassage(key);
  }

  useEffect(() => {
    if (!open || (!work && query.trim().length < 2)) { setResults([]); setMore(false); setLoading(false); setError(""); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/references/search?${work ? `workId=${work.id}` : `q=${encodeURIComponent(query)}`}&offset=${offset}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json() as { references: Result[]; more: boolean };
        if (!controller.signal.aborted) { setResults(data.references); setMore(data.more); }
      } catch {
        if (!controller.signal.aborted) { setError(fr ? "La recherche est indisponible. Vous pouvez utiliser un texte libre." : "Search is unavailable. You can use a free reference."); setResults([]); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, offset, open, fr, work]);

  const selected = meaningful(citations);
  return <section className="problem-citation-editor" ref={section} aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{fr ? "Références (facultatif)" : "References (optional)"}</h2>
    <p className="muted">{fr ? "Vous pouvez laisser les références vides." : "It’s fine to leave references blank."}</p>
    {!isConcept && <div className="problem-citation-original"><label className="problem-citation-checkbox"><input type="checkbox" disabled={!token} checked={original} onChange={(e) => change(initialRows(citations, e.target.checked), e.target.checked)} /><span>Original</span></label><FieldHelp text={fr ? "Cochez cette case si vous avez créé ce problème et qu’il n’est pas disponible ailleurs." : "Check this box if you created this problem and it is not available elsewhere."} /></div>}
    {restored && <p role="status">{fr ? "Brouillon de références récupéré." : "Reference draft restored."} <button type="button" className="secondary" onClick={() => { setBase(initial); setOriginal(initialOriginal); setOriginalBase(initialOriginal); setCitations(initialRows(initial, initialOriginal)); try { localStorage.removeItem(draftKey); } catch {} setRestored(false); }}>{fr ? "Reprendre les références enregistrées" : "Use saved references"}</button></p>}
    <input type="hidden" name="isOriginal" value={String(original)} />
    <input type="hidden" name="isOriginalBase" value={String(originalBase)} />
    <input type="hidden" name={fieldName} value={JSON.stringify(isConcept ? selected.map(c => ({ ...c, spoiler: false, isPrimary: false })) : selected)} />
    <input type="hidden" name={`${fieldName}Base`} value={JSON.stringify(isConcept ? parseConceptCitations(base) : base)} />
    <input type="hidden" name="citationDraftKey" value={draftKey} />
    <input type="hidden" name="citationDraftToken" value={token} />
    <div className="problem-citation-list">{citations.map((c, index) => <fieldset key={c.citationKey} disabled={!token} data-citation={c.citationKey} tabIndex={-1} className="problem-citation-card">
      <legend id={`${id}-citation-${c.citationKey}`}>{fr ? `Référence ${index + 1}` : `Reference ${index + 1}`}</legend>
      <div className="problem-citation-card-heading">
        {c.referenceId ? <strong>{c.text}</strong> : <label>
          <textarea aria-labelledby={`${id}-citation-${c.citationKey}`} rows={2} maxLength={2000} value={c.text}
            ref={(input) => { input?.setCustomValidity(meaningful([c]).length > 0 && !c.text.trim() ? (fr ? "Indiquez la référence à laquelle ces précisions se rapportent, ou retirez cette référence." : "Enter the reference these details belong to, or remove this reference.") : ""); }}
            placeholder={isConcept ? (fr ? "Ex. : auteur, titre du livre ou lien vers un article" : "E.g. author, book title or article link") : (fr ? "Ex. : Olympiades 2018, exercice 3" : "E.g. Olympiad 2018, problem 3")} onChange={(e) => update(c.citationKey, { text: e.target.value })} />
        </label>}
        <button type="button" className="secondary" aria-label={fr ? `Retirer la référence ${index + 1}` : `Remove reference ${index + 1}`} onClick={() => change(citations.filter((item) => item.citationKey !== c.citationKey))}>{fr ? "Retirer" : "Remove"}</button>
      </div>
      {!isConcept && <label className="problem-citation-checkbox"><input type="checkbox" checked={c.spoiler} onChange={(e) => update(c.citationKey, { spoiler: e.target.checked })} /><span>{fr ? "Masquer cette référence jusqu’à résolution" : "Hide this reference until solved"}</span></label>}
      <details data-details={c.citationKey}><summary id={`${id}-details-${c.citationKey}`}>{fr ? "Précisions supplémentaires" : "Additional details"}</summary>
        <textarea aria-labelledby={`${id}-details-${c.citationKey}`} data-passage={c.citationKey} rows={3} maxLength={8000} value={citationAdditionalDetails(c)} onChange={(e) => update(c.citationKey, { note: e.target.value || null, locator: null, url: null })} placeholder={fr ? "Ex. : Livre I, proposition 10, lien ou commentaire…" : "E.g. Book I, proposition 10, link or comment…"} />
        {c.referenceId && <button type="button" className="secondary" onClick={() => update(c.citationKey, { referenceId: null })}>{fr ? "Conserver comme texte libre" : "Keep as a free reference"}</button>}
      </details>
    </fieldset>)}</div>
    <div className="problem-citation-buttons">
      <button type="button" className="secondary" disabled={!token || citations.length >= MAX_PROBLEM_CITATIONS} onClick={() => change([...citations, blank(crypto.randomUUID())])}>{fr ? "+ Ajouter une référence" : "+ Add a reference"}</button>
      <button type="button" className="secondary" ref={searchButton} disabled={!token || selected.length >= MAX_PROBLEM_CITATIONS} aria-haspopup="dialog" onClick={() => { setOpen(true); dialog.current?.showModal(); searchInput.current?.focus(); }}>{fr ? "Rechercher dans le catalogue" : "Search the catalogue"}</button>
      {(selected.length > 0 || original) && <button type="button" className="secondary" aria-expanded={preview} onClick={() => setPreview(!preview)}>{fr ? "Aperçu des références" : "Preview references"}</button>}
    </div>
    {preview && <ProblemCitations citations={selected} isOriginal={!isConcept && original} locale={locale} />}
    <dialog ref={dialog} className="problem-reference-dialog" aria-labelledby={`${id}-search-title`} onCancel={() => { setOpen(false); searchButton.current?.focus(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="problem-reference-dialog-header"><h2 id={`${id}-search-title`}>{fr ? "Rechercher une référence" : "Find a reference"}</h2><button type="button" className="secondary" onClick={close}>{fr ? "Fermer" : "Close"}</button></div>
      <label><span>{fr ? "Titre, auteur, ISBN ou DOI" : "Title, author, ISBN or DOI"}</span><input ref={searchInput} value={query} maxLength={120} onChange={(e) => { setQuery(e.target.value); setWork(null); setOffset(0); }} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} autoComplete="off" /></label>
      {work && <div><button type="button" className="secondary" onClick={() => { setWork(null); setOffset(0); }}>{fr ? "Retour aux œuvres" : "Back to works"}</button><p><strong>{work.title}</strong> — {fr ? "Éditions disponibles" : "Available editions"}</p><button type="button" className="secondary" onClick={() => choose(work)}>{fr ? "Citer l’œuvre sans préciser d’édition" : "Cite the work without specifying an edition"}</button></div>}
      <div role="status" aria-live="polite">{loading ? (fr ? "Recherche…" : "Searching…") : error || (!work && query.trim().length < 2 ? (fr ? "Saisissez au moins deux caractères." : "Enter at least two characters.") : fr ? `${results.length} résultat(s)` : `${results.length} result(s)`)}</div>
      {!loading && <ul className="problem-reference-results">{results.map((r) => <li key={r.id}><div><strong>{r.title}</strong><p>{[r.authors, r.edition, r.volume ? `vol. ${r.volume}` : null, r.translator, r.publisher, r.year].filter(Boolean).join(" · ")}</p></div><div className="problem-citation-buttons"><button type="button" className="secondary" onClick={() => choose(r)}>{citations.some(c => c.referenceId === r.id) ? (fr ? "Déjà ajoutée" : "Already added") : (fr ? "Choisir" : "Choose")}</button>{!!r.editionCount && <button type="button" className="secondary" onClick={() => { setWork(r); setOffset(0); }}>{fr ? `Voir les éditions (${r.editionCount})` : `View editions (${r.editionCount})`}</button>}</div></li>)}</ul>}
      <div className="problem-citation-buttons">{offset > 0 && <button type="button" className="secondary" onClick={() => setOffset(Math.max(0, offset - 10))}>{fr ? "Précédents" : "Previous"}</button>}{more && !loading && <button type="button" className="secondary" onClick={() => setOffset(offset + 10)}>{fr ? "Suivants" : "Next"}</button>}</div>
      <button type="button" className="secondary" onClick={() => { close(); const key = crypto.randomUUID(); change([...meaningful(citations), { ...blank(key), text: query }]); requestAnimationFrame(() => section.current?.querySelector<HTMLTextAreaElement>("fieldset:last-child textarea")?.focus()); }}>{fr ? "Utiliser un texte libre" : "Use a free reference"}</button>
    </dialog>
  </section>;
}
