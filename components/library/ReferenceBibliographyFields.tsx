"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ReferenceWorkPicker({ locale, initial, excludeId }: { locale: "fr" | "en"; initial: { id: number; canonicalTitle: string } | null; excludeId?: number }) {
  const fr = locale === "fr", id = useId();
  const [work, setWork] = useState(initial);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  const [results, setResults] = useState<Array<{ id: number; title: string; authors: string | null }>>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (work || query.trim().length < 2) { setResults([]); setMore(false); setMessage(""); return; }
    const controller = new AbortController();
    setResults([]); setMore(false); setMessage(fr ? "Recherche…" : "Searching…");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/references/search?worksOnly=1&q=${encodeURIComponent(query)}&offset=${offset}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) { setResults(data.references.filter((item: { id: number }) => item.id !== excludeId)); setMore(data.more); setMessage(data.references.length ? "" : fr ? "Aucune œuvre trouvée." : "No works found."); }
      } catch { if (!controller.signal.aborted) setMessage(fr ? "Recherche indisponible. Réessayez dans un instant." : "Search unavailable. Please try again shortly."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, work, excludeId, offset, fr]);
  return <div>
    <input type="hidden" name="workId" value={work?.id ?? ""} />
    <p id={`${id}-help`} className="muted">{fr ? "Si cette fiche décrit une édition, rattachez-la à l’œuvre générale. Laissez vide pour une œuvre générale ou une référence indépendante." : "If this record describes an edition, link it to the general work. Leave blank for a general work or a standalone reference."}</p>
    {work ? <p>{fr ? "Œuvre : " : "Work: "}<strong>{work.canonicalTitle}</strong> <button type="button" className="secondary" onClick={() => { setWork(null); setQuery(""); setOffset(0); }}>{fr ? "Détacher" : "Unlink"}</button></p> : <>
      <label><span>{fr ? "Rechercher l’œuvre générale (facultatif)" : "Find the general work (optional)"}</span><input aria-describedby={`${id}-help`} value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setOffset(0); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /></label>
      <p role="status">{message}</p>
      <ul className="problem-reference-results">{results.map(result => <li key={result.id}><span>{result.title}{result.authors ? ` — ${result.authors}` : ""}</span><button type="button" className="secondary" onClick={() => setWork({ id: result.id, canonicalTitle: result.title })}>{fr ? "Choisir" : "Choose"}</button></li>)}</ul>
      <div className="problem-citation-buttons">{offset > 0 && <button type="button" className="secondary" onClick={() => setOffset(offset - 10)}>{fr ? "Précédents" : "Previous"}</button>}{more && <button type="button" className="secondary" onClick={() => setOffset(offset + 10)}>{fr ? "Suivants" : "Next"}</button>}</div>
    </>}
  </div>;
}

export function ReferenceBibtexField({ locale, initialValue }: { locale: "fr" | "en"; initialValue: string }) {
  const fr = locale === "fr";
  const field = useRef<HTMLTextAreaElement>(null);
  const [report, setReport] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [proposal, setProposal] = useState<Array<{ name: string; label: string; before: string; after: string; selected: boolean }> | null>(null);
  const [importMessage, setImportMessage] = useState("");
  async function prepareImport() {
    setPending(true); setProposal(null); setImportMessage("");
    try {
      const response = await fetch("/api/references/bibtex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "import", bibtex: field.current?.value ?? "", language: locale }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.errors?.join(" ") || (fr ? "Import impossible." : "Unable to import."));
      const form = field.current?.form;
      const current = form ? new FormData(form) : new FormData();
      const changes = Object.entries(data.fields as Record<string, string>).map(([name, after]) => {
        const element = form?.elements.namedItem(name) as HTMLInputElement | null;
        const label = element?.closest("label")?.querySelector("span")?.textContent || name;
        const before = String(current.get(name) ?? "");
        return { name, label, before, after, selected: !before.trim() };
      }).filter(change => change.before !== change.after);
      setProposal(changes);
      if (!changes.length) setImportMessage(fr ? "Les champs correspondent déjà au BibTeX." : "The fields already match the BibTeX.");
    } catch (error) { setImportMessage(error instanceof Error ? error.message : "Import failed."); }
    finally { setPending(false); }
  }
  function applyImport() {
    const form = field.current?.form;
    for (const change of proposal ?? []) {
      if (!change.selected) continue;
      const element = form?.elements.namedItem(change.name);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set?.call(element, change.after);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    setProposal(null); setReport(null);
    setImportMessage(fr ? "Champs remplis. Enregistrez la fiche pour conserver ces changements." : "Fields filled. Save the record to keep these changes.");
  }
  async function validate() {
    setPending(true); setReport(null);
    try {
      const form = field.current?.form;
      const submitted = form ? new FormData(form) : new FormData();
      const data = Object.fromEntries(["canonicalTitle", "referenceType", "authors", "editors", "publisher", "year", "yearLabel", "edition", "volume", "translator", "journal", "issue", "pages", "url", "doi", "isbn", "citationKey", "bibtex"].map(name => [name, submitted.get(name)]));
      const response = await fetch("/api/references/bibtex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, language: locale }) });
      if (!response.ok) throw new Error();
      setReport(await response.json());
    } catch { setReport({ errors: [fr ? "Vérification indisponible. Réessayez dans un instant." : "Validation unavailable. Please try again shortly."], warnings: [] }); }
    finally { setPending(false); }
  }
  return <div>
    <label><span>{fr ? "BibTeX original (facultatif)" : "Original BibTeX (optional)"}</span><textarea ref={field} name="bibtex" rows={7} maxLength={40000} defaultValue={initialValue} onChange={() => { setReport(null); setProposal(null); setImportMessage(""); }} /></label>
    <p className="muted">{fr ? "Collez une seule entrée, puis proposez le remplissage des champs. L’original et ses champs supplémentaires sont conservés ; les champs de la fiche déterminent l’affichage et l’export. Plusieurs auteurs se séparent par « and » dans BibTeX." : "Paste one entry, then review the proposed field values. The original and its extra fields are preserved; record fields determine display and export. Separate authors with “and” in BibTeX."}</p>
    <button type="button" className="secondary" disabled={pending} onClick={prepareImport}>{fr ? "Importer vers les champs…" : "Import into fields…"}</button>
    {proposal && proposal.length > 0 && <section aria-label={fr ? "Champs proposés" : "Proposed fields"}>
      <p>{fr ? "Choisissez les valeurs à appliquer. Les champs déjà remplis ne sont pas remplacés sans votre choix." : "Choose which values to apply. Existing values are only replaced when you select them."}</p>
      {proposal.map((change, index) => <label key={change.name} className="reference-import-choice"><input type="checkbox" checked={change.selected} onChange={e => setProposal(proposal.map((row, i) => i === index ? { ...row, selected: e.target.checked } : row))} /><span><strong>{change.label}</strong><br />{change.before && <><del>{change.before}</del> → </>}<ins>{change.after}</ins></span></label>)}
      <button type="button" className="secondary" onClick={applyImport}>{fr ? "Appliquer les champs sélectionnés" : "Apply selected fields"}</button>
    </section>}
    {importMessage && <p role="status">{importMessage}</p>}
    <button type="button" className="secondary" disabled={pending} onClick={validate}>{pending ? (fr ? "Vérification…" : "Checking…") : (fr ? "Vérifier le BibTeX / l’export" : "Check BibTeX / export")}</button>
    {report && <div role="status">{report.errors.length === 0 && <p>{fr ? "Syntaxe BibTeX valide." : "Valid BibTeX syntax."}</p>}{[...report.errors, ...report.warnings].map((message, index) => <p key={index}>{message}</p>)}</div>}
  </div>;
}
