import { RevisionDiff } from "@/components/RevisionDiff";
import { proofsCopy, type ConceptProof } from "@/lib/concept-proofs";
import type { Dictionary } from "@/lib/i18n/types";

export function ConceptProofsRevision({ before, after, revisionId, beforeRevisionId, locale, labels }: {
  before?: ConceptProof[]; after?: ConceptProof[]; revisionId: number; beforeRevisionId?: number;
  locale: string; labels: Dictionary["historyPage"];
}) {
  if (!after) return null;
  const copy = proofsCopy(locale), previous = before ?? [];
  const ids = [...new Set([...after, ...previous].map(proof => proof.id))];
  if (!ids.length) return null;
  const changed = before !== undefined && JSON.stringify(before) !== JSON.stringify(after);
  return <details className="mt-3 concept-proofs-revision" open={changed}>
    <summary>{changed ? copy.changed : copy.all}</summary>
    {ids.map(id => {
      const oldProof = previous.find(proof => proof.id === id), proof = after.find(item => item.id === id);
      const oldIndex = previous.findIndex(item => item.id === id), index = after.findIndex(item => item.id === id);
      if (changed && JSON.stringify(oldProof) === JSON.stringify(proof) && oldIndex === index) return null;
      const heading = (value: ConceptProof | undefined, position: number) => value ? `${copy.proof} ${position + 1}${value.title ? ` — ${value.title}` : ""}` : "—";
      return <div className="mt-3" key={id}>
        <div className="revision-field-diff"><del>{heading(oldProof, oldIndex)}</del><span>→</span><ins>{heading(proof, index)}</ins></div>
        {beforeRevisionId !== undefined && <RevisionDiff beforeMarkdown={oldProof?.markdown ?? ""} afterMarkdown={proof?.markdown ?? ""}
          revisionId={revisionId} beforeRevisionId={beforeRevisionId} labels={labels} defaultOpen={changed} />}
        {beforeRevisionId === undefined && <pre className="whitespace-pre-wrap break-words">{proof?.markdown}</pre>}
      </div>;
    })}
  </details>;
}
