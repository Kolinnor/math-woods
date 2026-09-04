"use client";

import { LibraryReferenceRole } from "@prisma/client";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { referenceRoleLabel } from "@/lib/library";

type ReferenceOption = { id: number; title: string; type: string };
type SelectedReference = { referenceId: number; role: LibraryReferenceRole; locator: string; note: string; isPrimary: boolean };

export function LibraryReferencePicker({
  locale,
  options,
  initial = [],
  allowPrimary = false
}: {
  locale: "en" | "fr";
  options: ReferenceOption[];
  initial?: SelectedReference[];
  allowPrimary?: boolean;
}) {
  const [selected, setSelected] = useState(initial);
  const [nextId, setNextId] = useState("");
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const available = options.filter((option) => !selected.some((item) => item.referenceId === option.id));
  const fr = locale === "fr";

  function addReference() {
    const referenceId = Number(nextId);
    if (!Number.isInteger(referenceId) || selected.some((item) => item.referenceId === referenceId)) return;
    setSelected((current) => [...current, { referenceId, role: allowPrimary ? LibraryReferenceRole.SOURCE : LibraryReferenceRole.FURTHER_READING, locator: "", note: "", isPrimary: allowPrimary && current.length === 0 }]);
    setNextId("");
  }

  function updateReference(index: number, patch: Partial<SelectedReference>) {
    setSelected((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return patch.isPrimary ? { ...item, isPrimary: false } : item;
      return { ...item, ...patch };
    }));
  }

  return (
    <section className="library-reference-picker">
      <input type="hidden" name="libraryReferencesSubmitted" value="1" />
      <div className="library-reference-picker-heading">
        <div><h2>{fr ? "Références" : "References"}</h2><p>{fr ? "Choisissez des fiches du catalogue et précisez, si nécessaire, la page ou le passage." : "Choose catalogue records and add a page or passage when useful."}</p></div>
        <a href="/library/references/new" target="_blank" rel="noreferrer">{fr ? "Nouvelle référence" : "New reference"}</a>
      </div>
      {selected.map((item, index) => (
        <div className="library-reference-picker-row" key={item.referenceId}>
          <input type="hidden" name="libraryReferenceIds" value={item.referenceId} />
          <strong>{optionById.get(item.referenceId)?.title ?? `#${item.referenceId}`}</strong>
          <select name={`libraryReferenceRole-${item.referenceId}`} value={item.role} onChange={(event) => updateReference(index, { role: event.target.value as LibraryReferenceRole })}>{Object.values(LibraryReferenceRole).map((role) => <option value={role} key={role}>{referenceRoleLabel(role, locale)}</option>)}</select>
          <input name={`libraryReferenceLocator-${item.referenceId}`} value={item.locator} onChange={(event) => updateReference(index, { locator: event.target.value })} placeholder={fr ? "Page, chapitre…" : "Page, chapter…"} />
          <input name={`libraryReferenceNote-${item.referenceId}`} value={item.note} onChange={(event) => updateReference(index, { note: event.target.value })} placeholder={fr ? "Précision facultative" : "Optional detail"} />
          {allowPrimary && <label className="library-reference-primary"><input type="radio" name="libraryPrimaryReferenceId" value={item.referenceId} checked={item.isPrimary} onChange={() => updateReference(index, { isPrimary: true })} /><span>{fr ? "Principale" : "Primary"}</span></label>}
          <button type="button" className="icon-button" onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={fr ? "Retirer" : "Remove"}><X size={16} /></button>
        </div>
      ))}
      <div className="library-reference-picker-add">
        <select value={nextId} onChange={(event) => setNextId(event.target.value)}><option value="">{fr ? "Choisir une référence" : "Choose a reference"}</option>{available.map((option) => <option value={option.id} key={option.id}>{option.title}</option>)}</select>
        <button type="button" className="secondary" disabled={!nextId} onClick={addReference}><Plus size={16} />{fr ? "Ajouter" : "Add"}</button>
      </div>
    </section>
  );
}
