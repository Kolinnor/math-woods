export type ConceptLanguageRow = {
  id: number;
  language: string;
};

export function overlappingConceptLanguages(
  first: readonly ConceptLanguageRow[],
  second: readonly ConceptLanguageRow[]
) {
  const firstLanguages = new Set(first.map(({ language }) => language));
  return [...new Set(second.map(({ language }) => language).filter((language) => firstLanguages.has(language)))].sort();
}

export function orderedUniqueIds(...groups: readonly (readonly number[])[]) {
  const seen = new Set<number>();
  return groups.flatMap((group) => group.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }));
}
