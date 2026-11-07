"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { browserUUID } from "@/lib/browser-uuid";
import { clearAcknowledgedEditorDrafts, markEditorDraftSubmission } from "@/lib/editor-draft-receipts";
import { parseConceptProofs, PROOF_LIMITS, proofsCopy, type ConceptProof } from "@/lib/concept-proofs";

export function ConceptProofsEditor({ initial = [], locale, draftKey }: {
  initial?: ConceptProof[]; locale: string; draftKey: string;
}) {
  const copy = proofsCopy(locale);
  const root = useRef<HTMLElement>(null);
  const base = JSON.stringify(initial);
  const storageKey = `math-woods-text-field-draft:${draftKey}`;
  const [proofs, setProofs] = useState(initial);
  const current = useRef(proofs);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [conflict, setConflict] = useState<ConceptProof[] | null>(null);
  const [removed, setRemoved] = useState<{ proof: ConceptProof; index: number } | null>(null);
  const [generation, setGeneration] = useState(0);
  function update(next: ConceptProof[]) {
    current.current = next;
    setProofs(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value: JSON.stringify(next), baseValue: base, updatedAt: Date.now() }));
    } catch { /* Storage is optional. */ }
  }
  useEffect(() => {
    clearAcknowledgedEditorDrafts();
    let next = JSON.parse(base) as ConceptProof[];
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (draft?.value === base) localStorage.removeItem(storageKey);
      else if (draft?.value) {
        const saved = parseConceptProofs(JSON.parse(draft.value));
        if (draft.baseValue === base) { next = saved; setRestored(true); }
        else setConflict(saved);
      }
    } catch { /* Invalid drafts must not block editing. */ }
    current.current = next;
    setProofs(next);
    setReady(true);
  }, [base, storageKey]);
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const submit = () => markEditorDraftSubmission(form, storageKey, JSON.stringify(current.current));
    form.addEventListener("submit", submit, true);
    return () => form.removeEventListener("submit", submit, true);
  }, [storageKey]);
  function edit(id: string, change: Partial<ConceptProof>) {
    const next = current.current.map(proof => proof.id === id ? { ...proof, ...change } : proof);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) update(next);
  }
  function move(index: number, offset: number) {
    const next = [...current.current];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  }
  return <section ref={root} className="concept-proofs-editor">
    <input type="hidden" name="conceptProofs" value={JSON.stringify(proofs)} />
    {restored && <p role="status" className="muted text-sm">{copy.restored}</p>}
    {conflict && <div className="quality-banner quality-needs-work">
      <p>{copy.conflict}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="secondary" onClick={() => { update(conflict); setGeneration(value => value + 1); setConflict(null); setRestored(true); }}>{copy.restore}</button>
        <button type="button" className="secondary" onClick={() => { update(current.current); setConflict(null); }}>{copy.discard}</button>
      </div>
    </div>}
    {proofs.length > 0 && <><h2>{copy.title}</h2><p className="muted text-sm">{copy.help}</p></>}
    {ready && proofs.map((proof, index) => <div key={`${generation}-${proof.id}`} className="concept-proof-editor">
      <div className="concept-proof-editor-heading">
        <h3>{copy.proof} {index + 1}</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${copy.up} — ${copy.proof} ${index + 1}`}>↑</button>
          <button type="button" className="secondary" disabled={index === proofs.length - 1} onClick={() => move(index, 1)} aria-label={`${copy.down} — ${copy.proof} ${index + 1}`}>↓</button>
          <button type="button" className="secondary" onClick={() => { setRemoved({ proof: current.current[index], index }); update(current.current.filter(item => item.id !== proof.id)); }}>{copy.remove}</button>
        </div>
      </div>
      <label className="grid gap-2">{copy.titleLabel}<input value={proof.title} maxLength={PROOF_LIMITS.title}
        placeholder={copy.placeholder} onChange={event => edit(proof.id, { title: event.target.value })} /></label>
      <ProofBodyEditor name={`conceptProof-${proof.id}`} initialValue={proof.markdown}
        ariaLabel={copy.proof}
        onValueChange={markdown => edit(proof.id, { markdown })} />
    </div>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="secondary" disabled={!ready || proofs.length >= PROOF_LIMITS.count}
        onClick={() => update([...current.current, { id: browserUUID(), title: "", markdown: "" }])}>+ {copy.add}</button>
      {removed && <button type="button" className="secondary" disabled={proofs.length >= PROOF_LIMITS.count}
        onClick={() => { const next = [...current.current]; next.splice(removed.index, 0, removed.proof); update(next); setRemoved(null); }}>{copy.undo}</button>}
    </div>
  </section>;
}

function ProofBodyEditor({ initialValue, ...props }: { initialValue: string; name: string; ariaLabel: string; onValueChange: (value: string) => void }) {
  const initial = useRef(initialValue);
  return <MarkdownEditor {...props} initialValue={initial.current} localDrafts={false} maxLength={PROOF_LIMITS.markdown} minHeight="12rem" />;
}
