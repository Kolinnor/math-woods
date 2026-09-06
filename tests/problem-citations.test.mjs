import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { citationAdditionalDetails, parseProblemCitations, citationUrl, mergeProblemCitations, translatedProblemCitations, preserveHiddenCitations, visibleProblemCitations } from "../lib/problem-citations.ts";
import { parseProblemRevisionSnapshot, mergeProblemRevisionSnapshots, changedProblemSnapshotFields } from "../lib/problem-revisions.ts";
import { syncProblemCitations } from "../lib/problem-citations-db.ts";
import { reconcileProblemReferences, EUCLID_PASSAGES } from "../scripts/reconcile-problem-references.mjs";

const citation = (overrides = {}) => ({ citationKey: "test-key", referenceId: null, text: "Olympiades 2018, exercice 3", url: null, locator: null, note: null, role: "SOURCE", isPrimary: false, spoiler: false, ...overrides });

test("free and catalogue citations coexist; empty, duplicate and unsafe data are rejected", () => {
  const free = citation();
  const book = citation({ citationKey: "book", referenceId: 10, text: "Euclide — Éléments", locator: "Livre I, proposition 10" });
  assert.deepEqual(parseProblemCitations([free, book]), [free, book]);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:pass@example.com"]) assert.throws(() => citationUrl(url));
  assert.equal(citationUrl("https://example.com"), "https://example.com/");
  assert.throws(() => parseProblemCitations([citation({ text: " " })]));
  assert.throws(() => parseProblemCitations([free, free]));
  assert.throws(() => parseProblemCitations([book, { ...book, citationKey: "other" }]));
  assert.throws(() => parseProblemCitations([citation({ referenceId: -1 })]));
  assert.throws(() => parseProblemCitations(Array.from({ length: 21 }, (_, i) => citation({ citationKey: String(i) }))));
});

test("missing legacy snapshots preserve references; conflicting edits cannot silently overwrite them", () => {
  const base = [citation()];
  const current = [citation({ note: "Editor's note" })];
  const submitted = [citation({ note: "Another note" })];
  assert.deepEqual(mergeProblemCitations(base, current, undefined), { merged: current, conflict: false });
  assert.deepEqual(mergeProblemCitations(base, current, base), { merged: current, conflict: false });
  assert.equal(mergeProblemCitations(base, current, submitted).conflict, true);
  assert.equal(mergeProblemCitations(undefined, current, submitted).conflict, true);
  assert.equal(mergeProblemCitations(base, current, current).conflict, false);
  const snapshot = { schemaVersion: 1, title: "Test", bodyMarkdown: "Statement", domains: [], tags: [], spoilerTags: [], relatedProblemGroups: [], citations: base };
  assert.deepEqual(parseProblemRevisionSnapshot(snapshot).citations, base);
  assert.deepEqual(changedProblemSnapshotFields(snapshot, { ...snapshot, citations: submitted }), ["citations"]);
  assert.deepEqual(mergeProblemRevisionSnapshots(snapshot, { ...snapshot, citations: current }, { ...snapshot, citations: submitted }).conflicts, ["citations"]);
  assert.equal(mergeProblemRevisionSnapshots(snapshot, { ...snapshot, isOriginal: true }, snapshot).merged.isOriginal, true);
  assert.deepEqual(changedProblemSnapshotFields({ ...snapshot, isOriginal: false }, { ...snapshot, isOriginal: true }), ['isOriginal']);
});

test('one details field preserves all existing passages, notes and URLs without truncation', () => {
  const legacy = citation({ locator: 'Livre I, proposition 10', note: 'Note conservée', url: 'https://example.com/' });
  const details = citationAdditionalDetails(legacy);
  assert.equal(details, 'Livre I, proposition 10\n\nNote conservée\n\nhttps://example.com/');
  const [saved] = parseProblemCitations([{ ...legacy, locator: null, url: null, note: details }]);
  assert.equal(citationAdditionalDetails(saved), details);
  assert.equal(parseProblemCitations([citation({ note: 'a'.repeat(8000) })])[0].note.length, 8000);
  assert.throws(() => parseProblemCitations([citation({ note: 'a'.repeat(8001) })]));
});

test("hidden citations are not sent to unsolved readers and survive their edits", () => {
  const visible = citation();
  const hidden = citation({ citationKey: "secret", referenceId: 20, text: "Secret solution", spoiler: true });
  assert.deepEqual(visibleProblemCitations([visible, hidden], false), [visible]);
  assert.deepEqual(visibleProblemCitations([visible, hidden], true), [visible, hidden]);
  assert.deepEqual(preserveHiddenCitations([visible, hidden], [], false), [hidden]);
  assert.throws(() => preserveHiddenCitations([hidden], [{ ...hidden, spoiler: false }], false));
  assert.throws(() => preserveHiddenCitations([hidden], [{ ...hidden, citationKey: "forged" }], false));
  assert.deepEqual(preserveHiddenCitations([hidden], [], true), []);
});

test("catalogue metadata propagates while translated notes and existing divergent passages survive", () => {
  const original = citation({ referenceId: 10, text: "Éléments", locator: "I.10", note: "Note française" });
  const translated = { ...original, citationKey: "translated-key", text: "Elements", note: "English note" };
  const updated = { ...original, locator: "I.11", spoiler: true };
  const result = translatedProblemCitations([original], [updated], [translated]);
  assert.equal(result[0].locator, "I.11");
  assert.equal(result[0].spoiler, true);
  assert.equal(result[0].text, "Elements");
  assert.equal(result[0].note, "English note");
  assert.equal(translatedProblemCitations([original], [updated], [{ ...translated, locator: "different edition p. 12" }])[0].locator, "different edition p. 12");
  assert.deepEqual(translatedProblemCitations([citation()], [citation({ text: "Changed free source" })], [citation()]), [citation()]);
});

const connection = process.env.CITATION_TEST_DATABASE_URL;
test("PostgreSQL: stable citation identities, archived records, atomic rollback and Euclid reconciliation", { skip: !connection }, async (t) => {
  const url = new URL(connection);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55436", "Database tests only run in the dedicated local container");
  const prisma = new PrismaClient({ datasourceUrl: connection });
  t.after(() => prisma.$disconnect());
  const prefix = `citation-test-${Date.now()}`;
  const user = await prisma.user.create({ data: { username: prefix, profileSlug: prefix } });
  const problem = await prisma.problem.create({ data: { slug: prefix, title: "Test", bodyMarkdown: "Test", bodyHtml: "<p>Test</p>", authorId: user.id } });
  const refs = [];
  const concepts = [];
  t.after(async () => {
    await prisma.problem.delete({ where: { id: problem.id } });
    await prisma.concept.deleteMany({ where: { id: { in: concepts } } });
    await prisma.libraryReference.deleteMany({ where: { id: { in: refs } } });
    await prisma.user.delete({ where: { id: user.id } });
  });
  async function reference(title, data = {}) {
    const row = await prisma.libraryReference.create({ data: { slug: `${prefix}-${refs.length}`, canonicalTitle: title, dedupeKey: `legacy-origin:${prefix}-${refs.length}`, status: "PUBLISHED", ...data } });
    refs.push(row.id); return row;
  }
  const book = await reference("Euclide. Eléments");
  const linked = citation({ referenceId: book.id, text: book.canonicalTitle });
  await prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [linked]));
  const first = await prisma.problemLibraryReference.findFirst({ where: { problemId: problem.id } });
  await prisma.libraryReference.update({ where: { id: book.id }, data: { status: "ARCHIVED" } });
  await prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [{ ...linked, note: "Updated note" }]));
  assert.equal((await prisma.problemLibraryReference.findFirst({ where: { problemId: problem.id } })).id, first.id);
  await assert.rejects(prisma.$transaction(async tx => { await syncProblemCitations(tx, problem.id, []); throw new Error("simulated failure"); }), /simulated failure/);
  assert.equal(await prisma.problemLibraryReference.count({ where: { problemId: problem.id } }), 1);
  const unavailable = await reference("Draft", { status: "DRAFT" });
  await assert.rejects(prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [{ ...linked, referenceId: unavailable.id }])));
  assert.equal((await prisma.problemLibraryReference.findFirst({ where: { problemId: problem.id } })).referenceId, book.id);
  await prisma.libraryReference.update({ where: { id: book.id }, data: { status: "PUBLISHED" } });
  const old = await reference([...EUCLID_PASSAGES.keys()][0]);
  await prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [linked, citation({ citationKey: "old", referenceId: old.id, text: old.canonicalTitle, note: "Preserve me" })]));
  await assert.rejects(reconcileProblemReferences(prisma, { check: false }), /already cites both/);
  assert.equal((await prisma.libraryReference.findUnique({ where: { id: old.id } })).mergedIntoId, null);
  await prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [citation({ citationKey: "old", referenceId: old.id, text: old.canonicalTitle, note: "Preserve me" })]));
  const concept = await prisma.concept.create({ data: { slug: prefix, title: "Test", bodyMarkdown: "Test", bodyHtml: "Test" } });
  concepts.push(concept.id);
  const definition = await reference("Euclide - Eléments - Livre 1 - Définition 10", { dedupeKey: `legacy-concept-title:${prefix}` });
  await prisma.conceptLibraryReference.create({ data: { conceptId: concept.id, referenceId: definition.id, note: "Concept note" } });
  const plan = await reconcileProblemReferences(prisma);
  assert.equal(plan.length, 2);
  assert.equal((await prisma.libraryReference.findUnique({ where: { id: old.id } })).mergedIntoId, null);
  await reconcileProblemReferences(prisma, { check: false });
  const migrated = await prisma.problemLibraryReference.findFirst({ where: { problemId: problem.id } });
  assert.equal(migrated.referenceId, book.id);
  assert.equal(migrated.locator, "Livre 1, proposition 9");
  assert.equal(migrated.note, "Preserve me");
  const conceptLink = await prisma.conceptLibraryReference.findFirst({ where: { conceptId: concept.id } });
  assert.equal(conceptLink.locator, "Livre 1, définition 10");
  assert.equal(conceptLink.note, "Concept note");
  assert.equal((await prisma.libraryReference.findUnique({ where: { id: old.id } })).mergedIntoId, book.id);
  assert.deepEqual(await reconcileProblemReferences(prisma), []);
  const unchanged = await prisma.libraryReference.findUnique({ where: { id: book.id } });
  await reconcileProblemReferences(prisma, { check: false });
  assert.equal((await prisma.libraryReference.findUnique({ where: { id: book.id } })).updatedAt.getTime(), unchanged.updatedAt.getTime());
  await prisma.libraryReference.delete({ where: { id: unavailable.id } });
  await prisma.$transaction(tx => syncProblemCitations(tx, problem.id, [citation({ referenceId: unavailable.id, text: "Deleted historical book" })], { historical: [unavailable.id] }));
  const restored = await prisma.problemLibraryReference.findFirst({ where: { problemId: problem.id } });
  assert.equal(restored.referenceId, null);
  assert.equal(restored.text, "Deleted historical book");
});

test("PostgreSQL: migration preserves populated legacy citations and keeps deleted books readable", { skip: !connection }, async () => {
  const url = new URL(connection);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55436");
  const db = new PrismaClient({ datasourceUrl: connection });
  const migration = readFileSync(new URL("../prisma/migrations/20260905150000_problem_citations/migration.sql", import.meta.url), "utf8");
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE SCHEMA citation_migration_test');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO citation_migration_test');
      await tx.$executeRawUnsafe('CREATE TABLE "LibraryReference" (id INTEGER PRIMARY KEY, "canonicalTitle" TEXT NOT NULL, url TEXT)');
      await tx.$executeRawUnsafe('CREATE TABLE "ProblemLibraryReference" (id INTEGER PRIMARY KEY, "problemId" INTEGER, "referenceId" INTEGER NOT NULL, locator TEXT, note TEXT, CONSTRAINT "ProblemLibraryReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"(id))');
      await tx.$executeRaw`INSERT INTO "LibraryReference" VALUES (1, 'Ancienne source', 'https://example.com'), (2, '@book{incomplete,', NULL)`;
      await tx.$executeRaw`INSERT INTO "ProblemLibraryReference" VALUES (1, 1, 1, 'p. 12', 'Note conservée'), (2, 2, 2, NULL, NULL)`;
      for (const sql of migration.split(';').map(part => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(sql);
      const rows = await tx.$queryRaw`SELECT * FROM "ProblemLibraryReference" ORDER BY id`;
      assert.equal(rows[0].citationKey, "legacy-1");
      assert.equal(rows[0].text, "Ancienne source");
      assert.equal(rows[0].locator, "p. 12");
      assert.equal(rows[0].note, "Note conservée");
      assert.equal(rows[0].spoiler, false);
      assert.equal((await tx.$queryRaw`SELECT searchable FROM "LibraryReference" WHERE id=2`)[0].searchable, false);
      await tx.$executeRaw`DELETE FROM "LibraryReference" WHERE id=1`;
      const [retained] = await tx.$queryRaw`SELECT * FROM "ProblemLibraryReference" WHERE id=1`;
      assert.equal(retained.referenceId, null);
      assert.equal(retained.text, "Ancienne source");
      await tx.$executeRawUnsafe('DROP SCHEMA citation_migration_test CASCADE');
    });
  } finally { await db.$disconnect(); }
});
