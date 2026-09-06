import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { parseConceptCitations, submittedConceptCitations } from '../lib/concept-citations.ts';
import { syncConceptCitations } from '../lib/concept-citations-db.ts';
import { buildConceptRevisionSnapshot, changedConceptSnapshotFields, conceptRevisionSnapshotInclude, parseConceptRevisionSnapshot } from '../lib/concept-revisions.ts';
import { pageBibliographyResponse } from '../lib/page-bibliography.ts';
import { parse } from '@retorquere/bibtex-parser';

const citation = (overrides = {}) => ({ citationKey: 'free', referenceId: null, text: 'Article libre https://example.com/article', url: null, locator: null, note: null, role: 'FURTHER_READING', isPrimary: false, spoiler: false, ...overrides });
test('concept references remain public and missing legacy fields do not erase citations', () => {
  assert.deepEqual(parseConceptCitations([citation({ spoiler: true, isPrimary: true })]), [citation()]);
  assert.equal(submittedConceptCitations(new FormData()), undefined);
  const form = new FormData(); form.set('conceptCitations', '[]');
  assert.deepEqual(submittedConceptCitations(form), []);
});

const connection = process.env.CITATION_TEST_DATABASE_URL;
function database() {
  const url = new URL(connection);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55436');
  return new PrismaClient({ datasourceUrl: connection });
}
test('PostgreSQL: concept identities, revisions, archived and deleted records, public page export scope', { skip: !connection }, async () => {
  const db = database();
  try {
    await db.$transaction(async tx => {
      const prefix = `concept-ref-${Date.now()}`;
      const concept = await tx.concept.create({ data: { slug: prefix, title: 'Test', bodyMarkdown: 'Test', bodyHtml: 'Test' } });
      const create = (suffix, extra = {}) => tx.libraryReference.create({ data: { slug: `${prefix}-${suffix}`, dedupeKey: `${prefix}-${suffix}`, canonicalTitle: suffix, referenceType: 'BOOK', citationKey: suffix, status: 'PUBLISHED', ...extra } });
      const book = await create('source', { bibtex: '@book{source,title={Old},keywords={retained}}' });
      const hidden = await create('private', { status: 'DRAFT' });
      const unrelated = await create('unrelated');
      const linked = citation({ citationKey: 'book', referenceId: book.id, text: 'Book', note: 'Chapitre 2' });
      await syncConceptCitations(tx, concept.id, [citation(), linked]);
      const first = await tx.concept.findUniqueOrThrow({ where: { id: concept.id }, include: conceptRevisionSnapshotInclude });
      const before = buildConceptRevisionSnapshot(first);
      const old = { ...before }; delete old.citations;
      assert.equal(parseConceptRevisionSnapshot(old).citations, undefined);
      assert.deepEqual(changedConceptSnapshotFields(old, before), []);
      await tx.libraryReference.update({ where: { id: book.id }, data: { status: 'ARCHIVED' } });
      await syncConceptCitations(tx, concept.id, [citation(), { ...linked, note: 'Chapitre 3' }]);
      const after = await tx.concept.findUniqueOrThrow({ where: { id: concept.id }, include: conceptRevisionSnapshotInclude });
      assert.equal(after.libraryReferences[1].id, first.libraryReferences[1].id);
      assert.deepEqual(changedConceptSnapshotFields(before, buildConceptRevisionSnapshot(after)), ['citations']);
      await assert.rejects(syncConceptCitations(tx, concept.id, [citation({ referenceId: hidden.id })]));
      assert.equal(await tx.conceptLibraryReference.count({ where: { conceptId: concept.id } }), 2);
      await tx.libraryReference.update({ where: { id: book.id }, data: { status: 'PUBLISHED' } });
      const page = { type: 'concept', slug: prefix, title: 'Test', language: 'fr' };
      const json = await pageBibliographyResponse(tx, page, before.citations, 'json');
      assert.equal(json.status, 200); assert.match(json.headers.get('cache-control'), /no-store/);
      const data = await json.json(); assert.equal(data.references.length, 2);
      assert.equal(data.references[0].bibliography, null);
      assert.ok(data.references[1].bibliography.bibtex.includes('keywords = {retained}'));
      const bib = await pageBibliographyResponse(tx, page, before.citations, 'bibtex');
      const text = await bib.text(); assert.equal(bib.status, 200);
      const parsed = parse(text, { raw: true, unsupported: 'ignore' });
      assert.deepEqual(parsed.errors, []); assert.equal(parsed.entries.length, 2);
      assert.equal(parsed.entries[0].type, 'misc'); assert.equal(parsed.entries[0].fields.title, undefined);
      assert.equal(parsed.entries[0].fields.author, undefined);
      assert.equal(text.includes(unrelated.slug), false); assert.equal(text.includes(hidden.slug), false);
      await tx.libraryReference.update({ where: { id: book.id }, data: { bibtex: '@book{source,title={Old},crossref={unrelated}}' } });
      const dependent = await pageBibliographyResponse(tx, page, before.citations, 'bibtex');
      assert.equal(dependent.status, 200);
      assert.equal(parse(await dependent.text(), { raw: true, unsupported: 'ignore' }).entries.length, 3);
      const filteredDependency = await pageBibliographyResponse(tx, page, before.citations, 'bibtex', [unrelated.id]);
      assert.equal(filteredDependency.status, 422);
      assert.equal((await filteredDependency.text()).includes(unrelated.slug), false);
      await tx.libraryReference.delete({ where: { id: book.id } });
      assert.equal((await tx.conceptLibraryReference.findFirst({ where: { conceptId: concept.id, citationKey: 'book' } })).text, 'Book');
      await syncConceptCitations(tx, concept.id, before.citations, [book.id]);
      const restored = await tx.conceptLibraryReference.findFirst({ where: { conceptId: concept.id, citationKey: 'book' } });
      assert.equal(restored.referenceId, null); assert.equal(restored.note, 'Chapitre 2');
      assert.equal((await tx.conceptReference.findFirst({ where: { conceptId: concept.id, position: 1 } })).note, 'Chapitre 2');
      throw new Error('ROLLBACK_TEST');
    }, { timeout: 20000 }).catch(error => { if (error.message !== 'ROLLBACK_TEST') throw error; });
  } finally { await db.$disconnect(); }
});

test('PostgreSQL: concept migration preserves unmatched legacy references and distinct notes', { skip: !connection }, async () => {
  const db = database();
  const migration = readFileSync(new URL('../prisma/migrations/20260905230000_concept_citations/migration.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE SCHEMA concept_citation_migration_test');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO concept_citation_migration_test');
      await tx.$executeRawUnsafe('CREATE TABLE "LibraryReference" (id INTEGER PRIMARY KEY, "canonicalTitle" TEXT NOT NULL, authors TEXT, url TEXT)');
      await tx.$executeRawUnsafe('CREATE TABLE "ConceptLibraryReference" (id SERIAL PRIMARY KEY, "conceptId" INTEGER, "referenceId" INTEGER NOT NULL, locator TEXT, note TEXT, role TEXT, position INTEGER, CONSTRAINT "ConceptLibraryReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"(id))');
      await tx.$executeRawUnsafe('CREATE TABLE "ConceptReference" (id INTEGER PRIMARY KEY, "conceptId" INTEGER, title TEXT, url TEXT, note TEXT, position INTEGER)');
      await tx.$executeRaw`INSERT INTO "LibraryReference" VALUES (1, 'Éléments', 'Euclide', 'https://example.com/')`;
      await tx.$executeRaw`INSERT INTO "ConceptLibraryReference" ("conceptId", "referenceId", locator, note, role, position) VALUES (1, 1, 'Livre I', 'Même note', 'SOURCE', 0)`;
      await tx.$executeRaw`INSERT INTO "ConceptReference" VALUES (1, 1, 'Éléments', 'https://example.com/', 'Même note', 0), (2, 1, 'Éléments', 'https://example.com/', 'Autre note', 1), (3, 1, 'Article libre', NULL, 'LaTeX $x^2$', 2)`;
      for (const sql of migration.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(sql);
      const rows = await tx.$queryRaw`SELECT * FROM "ConceptLibraryReference" ORDER BY position`;
      assert.equal(rows.length, 3); assert.equal(rows[0].text, 'Euclide — Éléments');
      assert.equal(rows[0].locator, 'Livre I'); assert.equal(rows[1].note, 'Autre note'); assert.equal(rows[2].text, 'Article libre');
      assert.equal(rows[2].note, 'LaTeX $x^2$');
      await tx.$executeRaw`DELETE FROM "LibraryReference" WHERE id=1`;
      assert.equal((await tx.$queryRaw`SELECT * FROM "ConceptLibraryReference" WHERE "citationKey"='catalogue-1'`)[0].referenceId, null);
      await tx.$executeRawUnsafe('DROP SCHEMA concept_citation_migration_test CASCADE');
    });
  } finally { await db.$disconnect(); }
});
