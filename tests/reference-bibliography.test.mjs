import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "@retorquere/bibtex-parser";
import { PrismaClient } from "@prisma/client";
import { inspectBibtex, generatedBibtex, exportReferenceBibtex, importBibtexFields, upgradeLegacyBibliography } from "../lib/reference-bibtex.ts";
import { normalizeReferenceDedupeKey } from "../lib/library.ts";
import { readReferenceBibliography, validateReferenceWork } from "../lib/reference-editions.ts";

const reference = (overrides = {}) => ({ id: 1, slug: "elements", canonicalTitle: "Éléments", referenceType: "BOOK", authors: "Euclid", ...overrides });
const form = values => { const data = new FormData(); Object.entries(values).forEach(([name, value]) => data.set(name, String(value))); return data; };

test("BibTeX syntax errors differ from optional completeness warnings", () => {
  assert.deepEqual(inspectBibtex("").errors, []);
  assert.equal(inspectBibtex("@book{a,title={Elements}}").errors.length, 0);
  assert.match(inspectBibtex("@book{a,title={Elements}}", "fr").warnings.join(" "), /author.*year.*publisher/);
  assert.ok(inspectBibtex("@book{a,title={Elements}").errors.length);
  assert.ok(inspectBibtex("@misc{a,title={A}} @misc{b,title={B}}").errors.length);
  assert.ok(inspectBibtex("@book{bad key,title={A}}").errors.length);
  assert.equal(readReferenceBibliography(form({ citationKey: "other", bibtex: "@misc{a,title={A}}" })).citationKey, "other");
  assert.equal(readReferenceBibliography(form({ bibtex: "@misc{a,title={A}}" })).citationKey, "a");
});

test("original TeX and supplemental fields survive while structured metadata determines export", () => {
  const raw = String.raw`@string{pub = {Cambridge}}
@book{Euclid1908,
  title = {{The Thirteen Books of {Euclid}'s Elements}},
  author = {Euclid},
  publisher = pub,
  year = {1908},
  note = {A formula: $a^{2}$; G\"odel}
}`;
  assert.deepEqual(inspectBibtex(raw).errors, []);
  const imported = importBibtexFields(raw).fields;
  assert.equal(imported.publisher, "Cambridge");
  const entry = reference({ ...imported, year: Number(imported.year), bibtex: raw });
  const exported = exportReferenceBibtex([entry]);
  assert.ok(exported.includes("{The Thirteen Books of {Euclid}'s Elements}"));
  assert.ok(exported.includes(String.raw`$a^{2}$; G\"odel`));
  assert.ok(exported.includes("publisher = {Cambridge}"));
  const corrected = generatedBibtex({ ...entry, canonicalTitle: "Corrected title", publisher: null, citationKey: "corrected" });
  assert.ok(corrected.includes("@book{corrected,"));
  assert.ok(corrected.includes("title = {{Corrected title}}"));
  assert.equal(corrected.includes("publisher ="), false);
  assert.equal(entry.bibtex, raw);
  assert.throws(() => exportReferenceBibtex([reference({ bibtex: raw }), reference({ bibtex: raw })]), /Duplicate citation key/);
});

test("generated metadata produces a parseable bibliography with edition, names, journal and special characters", () => {
  const text = generatedBibtex(reference({ canonicalTitle: "{ABC} & 50% of x_y #1 $z$", authors: "Euclid\nHeath, Thomas", year: 1908, edition: "Second", volume: "1", translator: "Heath, Thomas", journal: "Journal & Notes", issue: "2", pages: "10--20", url: "https://example.com/a_b?q=50%25", publisher: "A & B" }));
  const parsed = parse(text, { raw: true, unsupported: "ignore" });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries[0].fields.author.length, 2);
  assert.equal(parsed.entries[0].fields.volume, "1");
  assert.equal(parsed.entries[0].fields.url.trim(), "https://example.com/a_b?q=50%25");
  assert.ok(text.includes("url = {https://example.com/a_b?q=50%25}"));
  assert.match(text, /title = \{\{\\\{ABC\\\}/);
  assert.match(text, /number = \{2\}/);
  assert.match(text, /translator = \{Heath, Thomas\}/);
  const incomplete = exportReferenceBibtex([reference()]);
  assert.match(incomplete, /^% Missing bibliographic information/);
});

test("exports validate dependencies and expand macros so independent definitions cannot collide", () => {
  const child = reference({ citationKey: "child", bibtex: "@inbook{child,title={Part},crossref={parent}}" });
  assert.throws(() => exportReferenceBibtex([child]), /Missing related BibTeX entry: parent/);
  assert.doesNotThrow(() => exportReferenceBibtex([child, reference({ citationKey: "parent", bibtex: "@book{parent,title={Book}}" })]));
  const ordered = exportReferenceBibtex([reference({ citationKey: "parent", bibtex: "@book{parent,title={Book}}" }), child]);
  assert.ok(ordered.indexOf("@inbook{child") < ordered.indexOf("@book{parent"));
  assert.throws(() => exportReferenceBibtex([child, reference({ citationKey: "parent", bibtex: "@book{parent,title={Book},crossref={child}}" })]), /Cyclic/);
  assert.doesNotThrow(() => exportReferenceBibtex([reference({ citationKey: "a", bibtex: "@string{pub={A}} @misc{a,title=pub}" }), reference({ citationKey: "b", bibtex: "@string{pub={B}} @misc{b,title=pub}" })]));
});

test("legacy import fills missing metadata once; later explicit blanks remain authoritative", () => {
  const legacy = reference({ authors: null, bibliographyVersion: 0, bibtex: "@book{x,title={Other},author={Euclid},publisher={Old publisher},year={1908}}" });
  const upgraded = upgradeLegacyBibliography(legacy);
  assert.equal(upgraded.canonicalTitle, "Éléments");
  assert.equal(upgraded.authors, "Euclid");
  assert.equal(upgraded.year, 1908);
  assert.equal(upgraded.citationKey, "x");
  const edited = { ...upgraded, bibliographyVersion: 1, publisher: null };
  assert.equal(upgradeLegacyBibliography(edited).publisher, null);
  assert.equal(generatedBibtex(edited).includes("publisher ="), false);
  const free = generatedBibtex(reference({ referenceType: "OTHER", canonicalTitle: "", authors: null, freeText: "Source inconnue, exercice 3" }));
  assert.ok(free.startsWith("@misc{")); assert.ok(free.includes("note = {Source inconnue, exercice 3}"));
  assert.equal(free.includes("title ="), false); assert.equal(free.includes("author ="), false);
});

test("editions do not collide with the general work, while ISBN and DOI remain authoritative", () => {
  const base = { title: "Elements", authors: "Euclid" };
  assert.equal(normalizeReferenceDedupeKey(base), "title:elements|euclid");
  assert.notEqual(normalizeReferenceDedupeKey(base), normalizeReferenceDedupeKey({ ...base, translator: "Heath" }));
  assert.notEqual(normalizeReferenceDedupeKey({ ...base, volume: "1" }), normalizeReferenceDedupeKey({ ...base, volume: "2" }));
  assert.equal(normalizeReferenceDedupeKey({ ...base, isbn: "123-4", volume: "1" }), normalizeReferenceDedupeKey({ ...base, isbn: "1234", volume: "2" }));
});

test("preambles and list-valued supplemental fields remain parseable", () => {
  const bibtex = '@preamble{"hello"} @book{x,title={Title},keywords={one,two},note={Preserve me}}';
  const generated = generatedBibtex(reference({ bibtex }));
  const parsed = parse(generated, { raw: true, unsupported: "ignore" });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.preamble, ['"hello"']);
  assert.deepEqual(parsed.entries[0].fields.keywords, ['one', 'two']);
});

test("work links reject cycles, nesting, private targets and non-books without changing existing records", { skip: !process.env.CITATION_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.CITATION_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55436", "Use only the disposable test database");
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.findFirstOrThrow();
      const create = (slug, data = {}) => tx.libraryReference.create({ data: { slug: `bibtest-${slug}-${Date.now()}`, dedupeKey: `bibtest-${slug}-${Date.now()}`, canonicalTitle: slug, referenceType: "BOOK", status: "PUBLISHED", createdById: user.id, ...data } });
      const work = await create("work"), edition = await create("edition", { workId: work.id }), privateWork = await create("private", { status: "DRAFT" });
      assert.equal(await validateReferenceWork(tx, form({ workId: work.id }), "BOOK", edition.id), work.id);
      await assert.rejects(validateReferenceWork(tx, form({ workId: edition.id }), "BOOK", work.id));
      await assert.rejects(validateReferenceWork(tx, form({ workId: edition.id }), "BOOK"));
      await assert.rejects(validateReferenceWork(tx, form({ workId: work.id }), "ARTICLE"));
      await assert.rejects(validateReferenceWork(tx, form({ workId: privateWork.id }), "BOOK"));
      await assert.rejects(validateReferenceWork(tx, form({ workId: work.id }), "BOOK", work.id));
      await tx.libraryReference.update({ where: { id: work.id }, data: { status: "ARCHIVED" } });
      assert.equal(await validateReferenceWork(tx, form({ workId: work.id }), "BOOK", edition.id), work.id, "Existing archived parent is preserved");
      assert.equal(await validateReferenceWork(tx, form({ workId: "" }), "BOOK", edition.id), null);
      throw new Error("ROLLBACK_TEST");
    }).catch(error => { if (error.message !== "ROLLBACK_TEST") throw error; });
  } finally { await db.$disconnect(); }
});
