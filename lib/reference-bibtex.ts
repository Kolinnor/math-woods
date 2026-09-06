import { parse } from "@retorquere/bibtex-parser";

export const MAX_BIBTEX_LENGTH = 40_000;
export type BibliographicReference = {
  id?: number; slug: string; canonicalTitle: string; referenceType: string;
  authors?: string | null; editors?: string | null; publisher?: string | null;
  year?: number | null; yearLabel?: string | null; edition?: string | null;
  volume?: string | null; translator?: string | null; journal?: string | null;
  issue?: string | null; pages?: string | null; url?: string | null;
  doi?: string | null; isbn?: string | null; citationKey?: string | null; bibtex?: string | null;
  citationNote?: string | null;
  freeText?: string | null;
  bibliographyVersion?: number;
};

export function validCitationKey(key: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,239}$/.test(key);
}

export function inspectBibtex(text: string, locale: "fr" | "en" = "en") {
  const fr = locale === "fr";
  const errors: string[] = [], warnings: string[] = [];
  let key: string | null = null;
  if (!text.trim()) return { errors, warnings, key };
  if (text.length > MAX_BIBTEX_LENGTH) return { errors: [fr ? "Entrée BibTeX trop longue (40 000 caractères maximum)." : "BibTeX entry is too long (40,000 characters maximum)."], warnings, key };
  try {
    const parsed = parse(text, { raw: true, unsupported: "ignore" });
    if (parsed.errors.length) errors.push(fr ? "Syntaxe BibTeX invalide : vérifiez les accolades, guillemets et virgules." : "Invalid BibTeX syntax: check braces, quotation marks and commas.");
    if (parsed.entries.length !== 1) errors.push(fr ? "Collez exactement une entrée BibTeX par fiche." : "Paste exactly one BibTeX entry per record.");
    const entry = parsed.entries[0];
    if (entry) {
      key = entry.key;
      if (!validCitationKey(key)) errors.push(fr ? "Clé de citation invalide : utilisez des lettres sans accent, des chiffres, des tirets ou des points." : "Invalid citation key: use unaccented letters, numbers, hyphens or dots.");
      const f = entry.fields, type = entry.type.toLowerCase();
      const required = type === "misc" ? [] : ["title"];
      if (["book", "inbook", "article", "incollection", "inproceedings", "phdthesis", "mastersthesis", "techreport"].includes(type)) {
        if (!f.author && !(["book", "inbook"].includes(type) && f.editor)) required.push("author");
        if (!f.year && !f.date) required.push("year");
      }
      if (["book", "inbook", "incollection"].includes(type)) required.push("publisher");
      if (type === "article" && !f.journaltitle) required.push("journal");
      if (["incollection", "inproceedings"].includes(type)) required.push("booktitle");
      const missing = required.filter(name => !f[name]);
      if (missing.length) warnings.push(`${fr ? "Informations bibliographiques manquantes" : "Missing bibliographic information"} : ${missing.join(", ")}.`);
      if (f.crossref || f.xdata) warnings.push(fr ? "Cette entrée dépend d’autres entrées (crossref/xdata), qui devront figurer dans l’export." : "This entry depends on other entries (crossref/xdata), which must be included in the export.");
    }
  } catch { errors.push(fr ? "Impossible de lire cette entrée BibTeX." : "Unable to parse this BibTeX entry."); }
  return { errors, warnings, key };
}

// Structured form fields are plain text. Supplied BibTeX is never rewritten.
export function bibtexText(value: string) {
  return value.replace(/[\\{}&%_#$~^]/g, char => ({ "\\": "\\textbackslash{}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" }[char] ?? `\\${char}`));
}

const fieldMapping: Record<string, keyof BibliographicReference> = { title: "canonicalTitle", author: "authors", editor: "editors", publisher: "publisher", year: "year", edition: "edition", volume: "volume", journal: "journal", journaltitle: "journal", number: "issue", pages: "pages", translator: "translator", url: "url", doi: "doi", isbn: "isbn" };
function referenceTypeForBibtex(type: string) {
  return ["book", "inbook", "mvbook", "bookinbook", "suppbook"].includes(type) ? "BOOK" : ["article", "incollection", "inproceedings", "conference"].includes(type) ? "ARTICLE" : ["phdthesis", "mastersthesis", "thesis"].includes(type) ? "THESIS" : "OTHER";
}
function plain(value: unknown): string {
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const name = value as Record<string, unknown>;
    return name.name ? plain(name.name) : [plain(name.lastName), plain(name.suffix), plain(name.firstName)].filter(Boolean).join(", ");
  }
  return typeof value === "string" ? value.replace(/<\/?(?:span|b|i|em|strong|sup|sub)(?:\s[^>]*)?>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() : "";
}

export function importBibtexFields(text: string, locale: "fr" | "en" = "en") {
  const report = inspectBibtex(text, locale);
  if (report.errors.length || !report.key) throw new Error(report.errors.join(" ") || (locale === "fr" ? "Collez une entrée BibTeX." : "Paste a BibTeX entry."));
  const entry = parse(text, { sentenceCase: false, caseProtection: false, applyCrossRef: false, unsupported: "ignore" }).entries[0];
  const fields: Record<string, string> = { citationKey: entry.key, referenceType: referenceTypeForBibtex(entry.type.toLowerCase()) };
  for (const [source, target] of Object.entries(fieldMapping)) {
    const value = plain(entry.fields[source]);
    if (!value) continue;
    if (target === "year" && (!/^-?\d+$/.test(value) || Number(value) < -5000 || Number(value) > 3000)) fields.yearLabel = value;
    else fields[target] = value;
  }
  if (!fields.year && typeof entry.fields.date === "string") {
    const year = entry.fields.date.match(/^(-?\d{1,4})(?:-|$)/)?.[1];
    if (year && Number(year) >= -5000 && Number(year) <= 3000) fields.year = year;
  }
  return { fields, warnings: report.warnings };
}

export function generatedBibtex(reference: BibliographicReference, locale: "fr" | "en" = "en") {
  if (reference.bibliographyVersion === 0 && reference.bibtex) reference = upgradeLegacyBibliography(reference);
  let type = reference.referenceType === "BOOK" ? "book" : reference.referenceType === "ARTICLE" ? "article" : "misc";
  const key = reference.citationKey || `mw-${reference.id ?? reference.slug}`;
  if (!validCitationKey(key)) throw new Error(`Invalid citation key: ${key}`);
  const names = (value?: string | null) => value?.split(/\r?\n/).map(name => name.trim()).filter(Boolean).join(" and ");
  const fields: Array<[string, string | null | undefined]> = [
    ["title", reference.canonicalTitle], ["author", names(reference.authors)], ["editor", names(reference.editors)],
    ["publisher", reference.publisher], ["year", reference.year?.toString()], ["edition", reference.edition],
    ["volume", reference.volume], ["journal", reference.journal], ["number", reference.issue], ["pages", reference.pages],
    ["url", reference.url], ["doi", reference.doi], ["isbn", reference.isbn], ["translator", names(reference.translator)],
    // translator is supported by BibLaTeX; note also preserves it in classic BibTeX styles.
    ["note", [reference.translator ? `Translation: ${reference.translator}` : null, reference.year == null ? reference.yearLabel : null].filter(Boolean).join("; ")]
  ];
  const output = new Map(fields.filter((field): field is [string, string] => Boolean(field[1])).map(([name, value]) => {
    // URL/DOI are verbatim fields: encoding braces keeps the entry balanced without changing underscores.
    const escaped = ["url", "doi"].includes(name) ? value.replace(/[{}\\\r\n]/g, char => encodeURIComponent(char)) : bibtexText(value);
    return [name, name === "title" ? `{${escaped}}` : escaped];
  }));
  let preambles: string[] = [];
  if (reference.bibtex?.trim()) {
    const report = inspectBibtex(reference.bibtex, locale);
    if (report.errors.length) throw new Error(report.errors.join(" "));
    const original = parse(reference.bibtex, { verbatimFields: [/.*/], removeOuterBraces: [], applyCrossRef: false, unsupported: "ignore" });
    const imported = importBibtexFields(reference.bibtex).fields;
    const entry = original.entries[0];
    if (referenceTypeForBibtex(entry.type.toLowerCase()) === reference.referenceType) type = entry.type.toLowerCase();
    preambles = original.preamble;
    for (const [name, value] of Object.entries(entry.fields)) {
      const raw = Array.isArray(value) && value.every(item => typeof item === "string") ? value.join(", ") : value;
      if (typeof raw !== "string") continue;
      const target = fieldMapping[name];
      if (!target) {
        // A changed year also supersedes an imported BibLaTeX date.
        if (name === "note" && output.has(name)) output.set(name, [raw, output.get(name)].filter(Boolean).join("; "));
        else if (name !== "date" || String(reference.year ?? "") === (imported.year ?? "")) output.set(name, raw);
      } else if (String(reference[target] ?? "").trim() === (imported[target] ?? "")) {
        // Reuse TeX spelling only when it represents the current authoritative value.
        const canonical = name === "journaltitle" ? "journal" : name;
        output.set(canonical, raw);
      }
    }
  }
  if (reference.freeText) { output.delete("title"); output.set("note", bibtexText(reference.freeText)); }
  if (reference.citationNote) output.set("note", [output.get("note"), bibtexText(reference.citationNote)].filter(Boolean).join("; "));
  return [...preambles.map(value => `@preamble{${value}}`), `@${type}{${key},\n${[...output].map(([name, value]) => `  ${name} = {${value}}`).join(",\n")}\n}`].join("\n");
}

export function upgradeLegacyBibliography<T extends BibliographicReference>(reference: T): T {
  if (reference.bibliographyVersion !== 0 || !reference.bibtex) return reference;
  const imported = importBibtexFields(reference.bibtex).fields;
  const copy = { ...reference } as Record<string, unknown>;
  for (const [name, value] of Object.entries(imported)) {
    if (name === "referenceType") continue;
    if (copy[name] === null || copy[name] === undefined || copy[name] === "") copy[name] = name === "year" ? Number(value) : value;
  }
  return copy as T;
}

export function referenceBibtexReport(reference: BibliographicReference, locale: "fr" | "en" = "en") {
  let text = "";
  try { text = generatedBibtex(reference, locale); }
  catch (error) { return { text, key: null, warnings: [], errors: [error instanceof Error ? error.message : (locale === "fr" ? "Bibliographie invalide." : "Invalid bibliography.")] }; }
  const report = inspectBibtex(text, locale);
  if (reference.bibtex) {
    const imported = importBibtexFields(reference.bibtex, locale).fields;
    const differences = Object.entries(imported).filter(([name, value]) => name !== "citationKey" && String(reference[name as keyof BibliographicReference] ?? "").trim() !== value).map(([name]) => name);
    if (differences.length) report.warnings.push(`${locale === "fr" ? "Les champs de la fiche priment sur le BibTeX original pour" : "Record fields take precedence over the original BibTeX for"} : ${differences.join(", ")}.`);
  }
  return { ...report, text };
}

export function exportReferenceBibtex(references: BibliographicReference[]) {
  const keys = new Set<string>(), macros = new Set<string>();
  const dependencies = new Map<string, string[]>();
  const entries = references.map(reference => {
    const report = referenceBibtexReport(reference);
    if (report.errors.length) throw new Error(`${reference.canonicalTitle}: ${report.errors.join(" ")}`);
    const key = report.key!.toLowerCase();
    if (keys.has(key)) throw new Error(`Duplicate citation key: ${report.key}`);
    keys.add(key);
    const parsed = parse(report.text, { raw: true, unsupported: "ignore" });
    for (const macro of Object.keys(parsed.strings)) {
      if (macros.has(macro.toLowerCase())) throw new Error(`Repeated BibTeX string definition: ${macro}`);
      macros.add(macro.toLowerCase());
    }
    const fields = parsed.entries[0].fields;
    const targets: string[] = [];
    for (const name of ["crossref", "xdata"]) if (typeof fields[name] === "string") targets.push(...fields[name].split(",").map(value => value.trim().toLowerCase()));
    dependencies.set(key, targets);
    return { key, text: [...report.warnings.map(warning => `% ${warning}`), report.text].join("\n") };
  });
  for (const targets of dependencies.values()) for (const key of targets) if (!keys.has(key)) throw new Error(`Missing related BibTeX entry: ${key}`);
  // Classic BibTeX requires a crossref parent AFTER its children in the .bib file.
  const visiting = new Set<string>(), visited = new Set<string>(), ordered: string[] = [];
  const byKey = new Map(entries.map(entry => [entry.key, entry.text]));
  function visit(key: string) {
    if (visiting.has(key)) throw new Error(`Cyclic BibTeX cross-reference: ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const [child, targets] of dependencies) if (targets.includes(key)) visit(child);
    visiting.delete(key); visited.add(key); ordered.push(byKey.get(key)!);
  }
  for (const entry of entries) visit(entry.key);
  return ordered.join("\n\n");
}
