import { ensureSlug } from "./slug.ts";
import { findLatexRanges } from "./latex-ranges.ts";

export function parseAliases(input: FormDataEntryValue | null) {
  const source = String(input ?? "");
  const ranges = findLatexRanges(source);
  const parts: string[] = [];
  let start = 0;
  let rangeIndex = 0;
  for (let position = 0; position < source.length; position += 1) {
    const range = ranges[rangeIndex];
    if (range && position === range.from) {
      position = range.to - 1;
      rangeIndex += 1;
    } else if (source[position] === "," || source[position] === "\n") {
      parts.push(source.slice(start, position));
      start = position + 1;
    }
  }
  parts.push(source.slice(start));
  const aliases = parts
    .map((alias) => alias.trim())
    .filter(Boolean);

  return Array.from(new Map(aliases.map((alias) => [ensureSlug(alias), alias])).entries())
    .filter(([aliasSlug]) => Boolean(aliasSlug))
    .map(([aliasSlug, alias]) => ({ aliasSlug, alias }));
}
