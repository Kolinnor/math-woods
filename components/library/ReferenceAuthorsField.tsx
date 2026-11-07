"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Unlink, X } from "lucide-react";
import { referenceAuthorText, type ReferenceAuthorInput } from "@/lib/reference-authors";

type Person = { id: number; name: string; lifespan: string | null };

export function ReferenceAuthorsField({ locale, authors, onChange }: { locale: "fr" | "en"; authors: ReferenceAuthorInput[]; onChange: (rows: ReferenceAuthorInput[]) => void }) {
  const fr = locale === "fr", id = useId();
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]), [message, setMessage] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const focusNew = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  useEffect(() => {
    if (focusNew.current) { list.current?.lastElementChild?.querySelector("input")?.focus(); focusNew.current = false; }
  }, [authors]);
  useEffect(() => {
    setResults([]);
    if (!open || query.trim().length < 2) { setMessage(""); return; }
    const controller = new AbortController();
    setMessage(fr ? "Recherche…" : "Searching…");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/library/mathematicians/suggest?lang=${locale}&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) {
          setResults(data.mathematicians);
          setMessage(data.mathematicians.length ? "" : fr ? "Aucun mathématicien trouvé. Vous pouvez ajouter un auteur libre." : "No mathematicians found. You can add a free author name.");
        }
      } catch { if (!controller.signal.aborted) setMessage(fr ? "Recherche indisponible. Réessayez ou ajoutez un auteur libre." : "Search unavailable. Try again or add a free author name."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, locale, fr]);
  function close() { setOpen(false); setQuery(""); addButton.current?.focus(); }
  function add(row: ReferenceAuthorInput) { focusNew.current = true; onChange([...authors, row]); setOpen(false); setQuery(""); }
  function move(index: number, delta: number) {
    const next = [...authors];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }
  return <fieldset className="reference-authors-field">
    <legend>{fr ? "Auteurs ou créateurs" : "Authors or creators"}</legend>
    <input type="hidden" name="authors" value={referenceAuthorText(authors)} />
    <input type="hidden" name="authorEntries" value={JSON.stringify(authors)} />
    <ol className="reference-author-list" ref={list}>{authors.map((author, index) => <li key={index}>
      <div className="reference-author-name">
        <label><span className="sr-only">{fr ? `Nom de l’auteur ${index + 1}` : `Author ${index + 1} name`}</span><input required maxLength={1200} value={author.name} placeholder={fr ? "Nom de la personne ou de l’organisme" : "Person or organization name"} onChange={event => onChange(authors.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /></label>
        <small>{author.mathematicianId ? (fr ? "Fiche de mathématicien liée" : "Linked mathematician record") : (fr ? "Auteur libre" : "Free author name")}</small>
      </div>
      <div className="reference-author-controls">
        <button type="button" className="secondary" disabled={index === 0} aria-label={fr ? `Monter l’auteur ${index + 1}` : `Move author ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" className="secondary" disabled={index === authors.length - 1} aria-label={fr ? `Descendre l’auteur ${index + 1}` : `Move author ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
        {author.mathematicianId !== null && <button type="button" className="secondary" title={fr ? "Passer en auteur libre" : "Use a free author name"} aria-label={fr ? `Détacher l’auteur ${index + 1} de sa fiche` : `Unlink author ${index + 1} from their record`} onClick={() => onChange(authors.map((row, i) => i === index ? { ...row, mathematicianId: null } : row))}><Unlink size={16} aria-hidden="true" /></button>}
        <button type="button" className="secondary" aria-label={fr ? `Retirer l’auteur ${index + 1}` : `Remove author ${index + 1}`} onClick={() => { onChange(authors.filter((_, i) => i !== index)); addButton.current?.focus(); }}><X size={16} aria-hidden="true" /></button>
      </div>
    </li>)}</ol>
    <div className="reference-author-buttons">
      <button type="button" className="secondary" ref={addButton} aria-expanded={open} aria-controls={`${id}-search`} onClick={() => open ? close() : setOpen(true)}><Plus size={16} aria-hidden="true" />{fr ? "Ajouter un mathématicien" : "Add a mathematician"}</button>
      <button type="button" className="secondary" onClick={() => add({ name: "", mathematicianId: null })}><Plus size={16} aria-hidden="true" />{fr ? "Ajouter un auteur libre" : "Add a free author"}</button>
    </div>
    {open && <div id={`${id}-search`} className="reference-author-search">
      <label><span>{fr ? "Rechercher un mathématicien" : "Find a mathematician"}</span><input ref={search} value={query} maxLength={160} placeholder={fr ? "Ex. : Poincaré" : "E.g. Poincaré"} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); if (event.key === "Escape") close(); }} /></label>
      <p className="muted" role="status">{message || (query.trim().length < 2 ? (fr ? "Saisissez au moins deux caractères." : "Enter at least two characters.") : "")}</p>
      <ul className="problem-reference-results">{results.map(person => {
        const selected = authors.some(author => author.mathematicianId === person.id);
        return <li key={person.id}><span><strong>{person.name}</strong>{person.lifespan && <small>{person.lifespan}</small>}</span><button type="button" className="secondary" disabled={selected} onClick={() => add({ name: person.name, mathematicianId: person.id })}>{selected ? (fr ? "Déjà ajouté" : "Already added") : (fr ? "Choisir" : "Choose")}</button></li>;
      })}</ul>
      <button type="button" className="secondary" onClick={close}>{fr ? "Fermer la recherche" : "Close search"}</button>
    </div>}
    <p className="muted reference-author-help">{fr ? "Respectez l’ordre des auteurs de la publication. Un auteur libre peut être une personne ou un organisme." : "Keep the publication’s author order. A free author can be a person or an organization."}</p>
  </fieldset>;
}
