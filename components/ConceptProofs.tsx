import { ConceptProofsSection } from "@/components/ConceptProofsSection";
import { parseConceptProofs } from "@/lib/concept-proofs";
import { renderMarkdownForContentLanguage } from "@/lib/translated-markdown";

export async function ConceptProofs({ value, language, locale }: { value: unknown; language: string; locale: string }) {
  const proofs = await Promise.all(parseConceptProofs(value).filter(proof => proof.markdown.trim()).map(async proof => ({
    id: proof.id, title: proof.title, html: await renderMarkdownForContentLanguage(proof.markdown, language)
  })));
  return <ConceptProofsSection proofs={proofs} locale={locale} />;
}
