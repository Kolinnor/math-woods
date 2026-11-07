export class ConceptProofValidationError extends Error {}

export type ConceptProof = { id: string; title: string; markdown: string };
export const PROOF_LIMITS = { count: 10, title: 160, markdown: 60000, total: 120000 };

export function parseConceptProofs(value: unknown): ConceptProof[] {
  if (!Array.isArray(value) || value.length > PROOF_LIMITS.count) throw new ConceptProofValidationError("Invalid proofs (maximum 10).");
  const ids = new Set<string>();
  let total = 0;
  return value.map(item => {
    if (!item || typeof item !== "object") throw new ConceptProofValidationError("Invalid proof.");
    const { id, title, markdown } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id)
      || typeof title !== "string" || title.length > PROOF_LIMITS.title
      || typeof markdown !== "string" || markdown.length > PROOF_LIMITS.markdown) {
      throw new ConceptProofValidationError("Invalid proof or proof too long.");
    }
    ids.add(id);
    total += title.length + markdown.length;
    if (total > PROOF_LIMITS.total) throw new ConceptProofValidationError("Proofs are too long (maximum 120000 characters in total).");
    return { id, title: title.trim(), markdown };
  });
}

// Old forms and pending proposals do not own this new field.
export function submittedConceptProofs(form: FormData, previous: unknown = []): ConceptProof[] {
  if (!form.has("conceptProofs")) return parseConceptProofs(previous);
  let value: unknown;
  try { value = JSON.parse(String(form.get("conceptProofs"))); }
  catch { throw new ConceptProofValidationError("Invalid proofs."); }
  return parseConceptProofs(parseConceptProofs(value).map(proof => ({ ...proof,
    // Read the editor's actual textarea, including the last keystroke before submit.
    markdown: form.has(`conceptProof-${proof.id}`) ? String(form.get(`conceptProof-${proof.id}`)) : proof.markdown
  })));
}

export function proofsMarkdown(value: unknown = []): string {
  return parseConceptProofs(value).filter(proof => proof.markdown.trim())
    .map(proof => `### ${proof.title || "Proof"}\n\n${proof.markdown}`).join("\n\n");
}

export function contentWithProofs(body: string, source: { proofs?: unknown }): string {
  const proofs = proofsMarkdown(source.proofs ?? []);
  return proofs ? `${body}\n\n${proofs}` : body;
}

export function mergeConceptProofs(target: unknown, source: unknown): ConceptProof[] {
  const result = parseConceptProofs(target);
  for (const proof of parseConceptProofs(source)) {
    if (result.some(item => item.title === proof.title && item.markdown === proof.markdown)) continue;
    let id = proof.id;
    for (let n = 1; result.some(item => item.id === id); n++) id = `merged-${n}-${proof.id}`;
    result.push({ ...proof, id });
  }
  // Refuse a merge that would silently discard content or exceed editing limits.
  return parseConceptProofs(result);
}

export function proofsCopy(locale: string) {
  return locale === "fr" ? {
    title: "Preuves", proof: "Preuve", add: "Ajouter une preuve", remove: "Retirer cette preuve",
    undo: "Annuler le retrait", titleLabel: "Titre de la preuve (facultatif)", placeholder: "Par exemple : preuve géométrique",
    help: "Les preuves apparaissent après l’énoncé, repliées par défaut. Vous pouvez en proposer plusieurs et citer vos sources dans le texte.",
    up: "Monter", down: "Descendre", restored: "Brouillon des preuves restauré.",
    conflict: "Un brouillon de preuves existe, mais la version publiée a changé.",
    restore: "Récupérer mon brouillon", discard: "Garder la version publiée", all: "Voir toutes les preuves", changed: "Preuves modifiées"
  } : {
    title: "Proofs", proof: "Proof", add: "Add a proof", remove: "Remove this proof", undo: "Undo removal",
    titleLabel: "Proof title (optional)", placeholder: "For example: geometric proof",
    help: "Proofs appear after the statement, collapsed by default. You can offer several proofs and cite sources in their text.",
    up: "Move up", down: "Move down", restored: "Proof draft restored.",
    conflict: "A proof draft exists, but the published version has changed.",
    restore: "Recover my draft", discard: "Keep published version", all: "View all proofs", changed: "Changed proofs"
  };
}
