export const MAX_ADDITIONAL_CONCEPT_LINKS = 30;

export function parseAdditionalConceptSlugs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_ADDITIONAL_CONCEPT_LINKS ||
      value.some(slug => typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)) {
    throw new Error("Invalid additional concept links.");
  }
  return [...new Set(value)] as string[];
}

export function submittedAdditionalConceptSlugs(form: FormData, previous: string[] = []) {
  const raw = form.get("additionalConceptSlugs");
  if (raw === null) return previous;
  if (typeof raw !== "string" || raw.length > 6000) throw new Error("Invalid additional concept links.");
  return parseAdditionalConceptSlugs(JSON.parse(raw));
}

export function additionalLinksCopy(locale: string) {
  return locale === "fr" ? {
    title: "Liens complémentaires", add: "Ajouter des liens à la page", search: "Rechercher un concept…",
    help: "Privilégiez les liens directement sur les mots du texte. Cette section permet de relier un concept qui n’y est pas explicitement mentionné. À l’enregistrement, un lien complémentaire est retiré si le même concept est déjà cité dans le contenu. Ces liens sont publics : n’y ajoutez pas d’indice dévoilant la solution d’un problème.",
    remove: "Retirer", empty: "Aucun concept trouvé.", loading: "Recherche…", error: "La recherche a échoué. Réessayez.",
    limit: "30 liens maximum.",
  } : {
    title: "Additional links", add: "Add links to this page", search: "Search for a concept…",
    help: "Prefer links directly on words in the text. Use this section to link a concept that is not explicitly mentioned. On saving, an additional link is removed if the same concept is already cited in the content. These links are public: do not add clues that reveal a problem’s solution.",
    remove: "Remove", empty: "No concepts found.", loading: "Searching…", error: "Search failed. Please try again.",
    limit: "Up to 30 links.",
  };
}

export type AdditionalConceptLink = { slug: string; title: string; language?: string };
