export const CONCEPT_REVIEW_EXERCISE_TARGET = 3;

const PLACEHOLDER_PATTERN = /\b(to be completed|a completer|à compléter|por completar|zu erganzen|da completare)\b/i;
const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*#*\s*$/gm;
const DEFINITION_HEADINGS = [
  "definition",
  "formal definition",
  "intuitive definition",
  "définition",
  "definition formelle",
  "définition formelle",
  "definición",
  "definicion",
  "definição",
  "definizione"
];
const EXAMPLE_HEADINGS = ["example", "examples", "exemple", "exemples", "ejemplo", "ejemplos", "beispiel", "beispiele", "esempio", "esempi", "exemplo", "exemplos"];

function normalizedHeading(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function meaningfulText(value: string) {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[`*_>#\-$]/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionBodies(markdown: string, acceptedHeadings: readonly string[]) {
  const matches = [...markdown.matchAll(HEADING_PATTERN)];
  return matches.flatMap((match, index) => {
    const heading = normalizedHeading(match[1] ?? "");
    if (!acceptedHeadings.some((candidate) => normalizedHeading(candidate) === heading)) return [];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return [markdown.slice(start, end)];
  });
}

function hasMeaningfulSection(markdown: string, headings: readonly string[]) {
  return sectionBodies(markdown, headings).some((body) => {
    const text = meaningfulText(body);
    return text.length >= 12 && !PLACEHOLDER_PATTERN.test(text);
  });
}

export function conceptReviewChecklist(markdown: string, exerciseCount: number) {
  const coreSections = sectionBodies(markdown, DEFINITION_HEADINGS);
  const fallbackCore = meaningfulText(markdown);
  const hasCoreContent = coreSections.length > 0
    ? hasMeaningfulSection(markdown, DEFINITION_HEADINGS)
    : fallbackCore.length >= 30 && !PLACEHOLDER_PATTERN.test(fallbackCore);

  return {
    hasCoreContent,
    hasExamples: hasMeaningfulSection(markdown, EXAMPLE_HEADINGS),
    exerciseCount: Math.max(0, exerciseCount),
    exerciseTarget: CONCEPT_REVIEW_EXERCISE_TARGET,
    hasExerciseTarget: exerciseCount >= CONCEPT_REVIEW_EXERCISE_TARGET
  };
}
