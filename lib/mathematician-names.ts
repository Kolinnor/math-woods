type NamedPerson = { name: string; aliases?: string[]; translations: { language: string; displayName: string; teaser?: string }[] };

export function mathematicianName(person: NamedPerson, locale: string) {
  return person.translations.find(t => t.language === locale)?.displayName
    || person.translations.find(t => t.language === "en")?.displayName
    || person.translations.find(t => t.language === "fr")?.displayName
    || person.translations[0]?.displayName || person.name;
}

export function normalizeMathematicianName(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ł/g, "l")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function parseMathematicianAliases(value: unknown, name: string, locale: "fr" | "en") {
  const error = locale === "fr" ? "Indiquez au maximum 20 autres noms, un par ligne (160 caractères par nom)." : "Enter up to 20 other names, one per line (160 characters per name).";
  if (typeof value !== "string" || value.length > 4000) throw new Error(error);
  const aliases = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (aliases.length > 20 || aliases.some(s => s.length > 160 || !normalizeMathematicianName(s))) throw new Error(error);
  const seen = new Set([normalizeMathematicianName(name)]);
  return aliases.filter(alias => {
    const key = normalizeMathematicianName(alias);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function rankMathematicians<T extends NamedPerson & { id: number }>(people: T[], query: string, locale: string, similar = false) {
  const normalized = normalizeMathematicianName(query);
  const words = normalized.split(" ").filter(Boolean);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return people.map(person => {
    const names = [person.name, ...person.translations.map(t => t.displayName), ...(person.aliases ?? [])].map(normalizeMathematicianName);
    const matches = (text: string) => words.every(word => text.includes(word));
    const score = !normalized ? 0 : names.includes(normalized) ? 0
      : names.some(matches) ? 1
      : similar && words.some(word => word.length >= 3 && names.some(name => name.split(" ").some(part => part.startsWith(word)))) ? 2
      : !similar && person.translations.some(t => matches(normalizeMathematicianName(t.teaser ?? ""))) ? 3 : Infinity;
    return { person, score };
  }).filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || collator.compare(mathematicianName(a.person, locale), mathematicianName(b.person, locale)) || a.person.id - b.person.id)
    .map(item => item.person);
}
