import { MarkdownBlock } from "@/components/MarkdownBlock";
import { proofsCopy } from "@/lib/concept-proofs";

export type RenderedConceptProof = { id: string; title: string; html: string };
export function ConceptProofsSection({ proofs, locale }: { proofs: RenderedConceptProof[]; locale: string }) {
  if (!proofs.length) return null;
  const copy = proofsCopy(locale);
  return <section className="concept-proofs" aria-label={copy.title}>
    {proofs.map((proof, index) => <details key={proof.id} id={`concept-proof-${proof.id}`} className="concept-proof">
      <summary>{copy.proof}{proofs.length > 1 ? ` ${index + 1}` : ""}{proof.title ? ` — ${proof.title}` : ""}</summary>
      <div className="concept-proof-body"><MarkdownBlock html={proof.html} /></div>
    </details>)}
  </section>;
}
