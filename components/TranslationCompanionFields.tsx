"use client";

import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import {
  TRANSLATED_HINT_BODY_PREFIX,
  TRANSLATED_PROOF_BODY_PREFIX,
  TRANSLATED_PROOF_HINT_BODY_PREFIX,
  translationBodyFieldName
} from "@/lib/translation-companions";

type SourceHint = {
  id: number;
  bodyMarkdown: string;
};

type SourceProof = {
  id: number;
  bodyMarkdown: string;
  authorName: string;
  hint: SourceHint | null;
};

type TranslationCompanionLabels = {
  title: string;
  help: string;
  alsoTranslate: string;
  hints: string;
  hint: string;
  solutions: string;
  solution: string;
  by: string;
  solutionHint: string;
};

function CompanionEditor({
  checked,
  draftKey,
  initialValue,
  name,
  onChange,
  toggleLabel
}: {
  checked: boolean;
  draftKey: string;
  initialValue: string;
  name: string;
  onChange: (checked: boolean) => void;
  toggleLabel: string;
}) {
  return (
    <div className={checked ? "translation-companion-item selected" : "translation-companion-item"}>
      <label className="translation-companion-toggle">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{toggleLabel}</span>
      </label>
      {checked && <MarkdownEditor name={name} initialValue={initialValue} draftKey={draftKey} />}
    </div>
  );
}

export function TranslationCompanionFields({
  draftSession,
  hints,
  proofs,
  labels
}: {
  draftSession: string;
  hints: SourceHint[];
  proofs: SourceProof[];
  labels: TranslationCompanionLabels;
}) {
  const [selectedHints, setSelectedHints] = useState<Set<number>>(() => new Set());
  const [selectedProofs, setSelectedProofs] = useState<Set<number>>(() => new Set());
  const [selectedProofHints, setSelectedProofHints] = useState<Set<number>>(() => new Set());

  function updateSelection(setter: (value: Set<number>) => void, current: Set<number>, id: number, checked: boolean) {
    const next = new Set(current);
    if (checked) next.add(id);
    else next.delete(id);
    setter(next);
  }

  if (hints.length === 0 && proofs.length === 0) return null;

  return (
    <section className="problem-compose-card translation-companions">
      <div>
        <div className="problem-compose-section-title">{labels.title}</div>
        <p className="muted text-sm">{labels.help}</p>
      </div>

      {hints.length > 0 && (
        <div className="translation-companion-group">
          <h2>{labels.hints}</h2>
          {hints.map((hint, index) => {
            const checked = selectedHints.has(hint.id);
            return (
              <div key={hint.id}>
                {checked && <input type="hidden" name="translateHintIds" value={hint.id} />}
                <p className="translation-companion-label">{labels.hint} {index + 1}</p>
                <CompanionEditor
                  checked={checked}
                  draftKey={`problem:translate:${draftSession}:hint:${hint.id}`}
                  initialValue={hint.bodyMarkdown}
                  name={translationBodyFieldName(TRANSLATED_HINT_BODY_PREFIX, hint.id)}
                  toggleLabel={labels.alsoTranslate}
                  onChange={(value) => updateSelection(setSelectedHints, selectedHints, hint.id, value)}
                />
              </div>
            );
          })}
        </div>
      )}

      {proofs.length > 0 && (
        <div className="translation-companion-group">
          <h2>{labels.solutions}</h2>
          {proofs.map((proof, index) => {
            const checked = selectedProofs.has(proof.id);
            const hintChecked = proof.hint ? selectedProofHints.has(proof.hint.id) : false;
            return (
              <div key={proof.id} className="translation-companion-proof">
                {checked && <input type="hidden" name="translateProofIds" value={proof.id} />}
                <p className="translation-companion-label">
                  {labels.solution} {index + 1} {labels.by} {proof.authorName}
                </p>
                <CompanionEditor
                  checked={checked}
                  draftKey={`problem:translate:${draftSession}:proof:${proof.id}`}
                  initialValue={proof.bodyMarkdown}
                  name={translationBodyFieldName(TRANSLATED_PROOF_BODY_PREFIX, proof.id)}
                  toggleLabel={labels.alsoTranslate}
                  onChange={(value) => {
                    updateSelection(setSelectedProofs, selectedProofs, proof.id, value);
                    if (!value && proof.hint) {
                      updateSelection(setSelectedProofHints, selectedProofHints, proof.hint.id, false);
                    }
                  }}
                />
                {checked && proof.hint && (
                  <div className="translation-companion-nested">
                    {hintChecked && <input type="hidden" name="translateProofHintIds" value={proof.hint.id} />}
                    <p className="translation-companion-label">{labels.solutionHint}</p>
                    <CompanionEditor
                      checked={hintChecked}
                      draftKey={`problem:translate:${draftSession}:proof-hint:${proof.hint.id}`}
                      initialValue={proof.hint.bodyMarkdown}
                      name={translationBodyFieldName(TRANSLATED_PROOF_HINT_BODY_PREFIX, proof.hint.id)}
                      toggleLabel={labels.alsoTranslate}
                      onChange={(value) =>
                        updateSelection(setSelectedProofHints, selectedProofHints, proof.hint!.id, value)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
