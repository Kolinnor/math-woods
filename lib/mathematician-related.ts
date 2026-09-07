export const RELATED_CATEGORIES = ["WORK", "SOURCE", "CONCEPT", "PROBLEM", "LEGACY"] as const;
export type RelatedCategory = typeof RELATED_CATEGORIES[number];
export type MathematicianRelatedInput = {
  key: string; category: RelatedCategory; labelMarkdown: string; noteMarkdown: string;
  relation: string; referenceId: number | null; conceptId: number | null; problemId: number | null;
};
export type MathematicianRelatedView = MathematicianRelatedInput & { href?: string | null; titleHtml?: string; unavailable?: boolean };

export const relatedCopy = {
  fr: {
    WORK: { title: "Œuvres", help: "Ajoutez des livres, articles ou autres publications écrits par cette personne, seule ou avec d’autres auteurs. Une source qui parle de sa vie appartient à « Sources et lectures »." },
    SOURCE: { title: "Sources et lectures", help: "Ajoutez les références utilisées pour documenter cette fiche ou pour approfondir la vie et les travaux de cette personne. Les appels de référence dans le texte sont facultatifs." },
    CONCEPT: { title: "Concepts associés", help: "Choisissez des concepts portant le nom de cette personne ou qu’elle a développés de manière déterminante. Une simple proximité thématique ne suffit pas." },
    PROBLEM: { title: "Problèmes historiques", help: "Choisissez des problèmes historiquement associés à cette personne. Un exercice moderne qui utilise seulement son théorème n’a pas sa place ici." },
    LEGACY: { title: "Références à classer", help: "Ces liens existaient avant la séparation des œuvres et des sources. Leur contenu et leurs notes ont été conservés. Choisissez leur catégorie quand vous savez quel est leur rôle." }
  },
  en: {
    WORK: { title: "Works", help: "Add books, articles or other publications written by this person, alone or with co-authors. References about their life belong under ‘Sources and further reading’." },
    SOURCE: { title: "Sources and further reading", help: "Add references used to document this entry or to learn more about this person’s life and work. In-text reference links are optional." },
    CONCEPT: { title: "Associated concepts", help: "Choose concepts named after this person or that they played a crucial part in developing. A shared topic alone is not enough." },
    PROBLEM: { title: "Historical problems", help: "Choose problems historically associated with this person. Modern exercises that merely use their theorem do not belong here." },
    LEGACY: { title: "References to classify", help: "These links predate the separation of works and sources. Their content and notes have been preserved. Choose a category when you know their role." }
  }
};

export function submittedMathematicianRelated(form: FormData): MathematicianRelatedInput[] | undefined {
  if (!form.has("relatedItems")) {
    if (["referenceIds", "conceptIds", "problemIds"].some(name => form.has(name))) throw new Error(form.get("language") === "fr" ? "Ce formulaire de liens est ancien. Rechargez la fiche avant de modifier ses liens." : "This link form is outdated. Reload the entry before editing its links.");
    return undefined;
  }
  const raw = form.get("relatedItems");
  if (typeof raw !== "string" || raw.length > 100000) throw new Error("Invalid related items.");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("At most 100 related items per language.");
  const keys = new Set<string>(); const targets = new Set<string>();
  return rows.map(row => {
    if (!row || typeof row !== "object" || typeof row.key !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.key) || keys.has(row.key)) throw new Error("Invalid related item key.");
    keys.add(row.key);
    if (!RELATED_CATEGORIES.includes(row.category)) throw new Error("Invalid related item category.");
    const text = (name: string) => { const value = form.get(`related-${row.key}-${name}`); if (typeof value !== "string" || value.length > 4000) throw new Error("Invalid related item text."); return value.trim(); };
    const ids = ["referenceId", "conceptId", "problemId"].map(field => { const id = row[field] ?? null; if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw new Error("Invalid related target."); return id; });
    if (ids.filter(id => id !== null).length > 1 || (ids[0] !== null && !["WORK", "SOURCE", "LEGACY"].includes(row.category)) || (ids[1] !== null && row.category !== "CONCEPT") || (ids[2] !== null && row.category !== "PROBLEM")) throw new Error("Invalid related target category.");
    const target = `${row.category}:${ids.join(":")}`;
    if (ids.some(id => id !== null) && targets.has(target)) throw new Error("Duplicate related item.");
    targets.add(target);
    const relation = row.relation ?? "";
    if (!["", "EPONYM", "CONTRIBUTION"].includes(relation) || (relation && row.category !== "CONCEPT")) throw new Error("Invalid historical relation.");
    return { key: row.key, category: row.category, relation, referenceId: ids[0], conceptId: ids[1], problemId: ids[2], labelMarkdown: text("label"), noteMarkdown: text("note") };
  });
}
