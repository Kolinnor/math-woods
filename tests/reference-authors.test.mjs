import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceAuthorsFromText, referenceAuthorText, submittedReferenceAuthors } from '../lib/reference-authors.ts';
import { validateReferenceAuthors } from '../lib/reference-authors-db.ts';
import { generatedBibtex, importBibtexFields } from '../lib/reference-bibtex.ts';

const form = rows => { const data = new FormData(); data.set('language', 'fr'); data.set('authorEntries', JSON.stringify(rows)); return data; };
const linked = { name: 'Henri Poincaré', mathematicianId: 12 };
const free = { name: 'Société mathématique de France', mathematicianId: null };

test('mixed authors preserve publication order and bibliography spelling independently of the linked name', () => {
  const data = form([free, { ...linked, name: 'Poincaré, Henri' }]);
  data.set('authors', 'forged stale text');
  const result = submittedReferenceAuthors(data);
  assert.equal(result.authors, 'Société mathématique de France\nPoincaré, Henri');
  assert.deepEqual(result.entries.map(row => row.mathematicianId), [null, 12]);
  const bibtex = generatedBibtex({ id: 1, slug: 'test', canonicalTitle: 'Analysis situs', referenceType: 'ARTICLE', authors: result.authors });
  assert.match(bibtex, /Société mathématique de France.*and Poincaré, Henri/);
  assert.equal(bibtex.includes('mathematicianId'), false);
  assert.deepEqual(submittedReferenceAuthors(form([])), { authors: null, entries: [] });
});

test('legacy free text remains intact, without guessing an identity or splitting names on commas', () => {
  const data = new FormData(); data.set('authors', 'Poincaré, Henri\nPaul Appell');
  assert.deepEqual(submittedReferenceAuthors(data), { authors: 'Poincaré, Henri\nPaul Appell', entries: [{ name: 'Poincaré, Henri', mathematicianId: null }, { name: 'Paul Appell', mathematicianId: null }] });
  assert.deepEqual(referenceAuthorsFromText('Henri Poincaré', [linked]), [linked]);
  assert.equal(referenceAuthorsFromText('Henri Poincaré\nHenri Poincaré', [linked]).every(row => row.mathematicianId === null), true);
});

test('BibTeX import retains unambiguous links through name inversion and order changes', () => {
  const fields = importBibtexFields('@article{test,title={Analysis situs},author={Paul Appell and Henri Poincaré}}').fields;
  const rows = referenceAuthorsFromText(fields.authors, [linked, free]);
  assert.deepEqual(rows, [{ name: 'Appell, Paul', mathematicianId: null }, { ...linked, name: 'Poincaré, Henri' }]);
  assert.equal(referenceAuthorText(rows), 'Appell, Paul\nPoincaré, Henri');
  assert.deepEqual(referenceAuthorsFromText('Jules Henri Poincaré', [linked]), [{ name: 'Jules Henri Poincaré', mathematicianId: null }]);
  assert.deepEqual(referenceAuthorsFromText('', [linked]), []);
});

test('malformed authors, empty names, repeated identities and oversized lists are rejected', () => {
  for (const rows of [null, {}, [linked, linked], [{ ...linked, mathematicianId: '12' }], [{ ...linked, mathematicianId: -1 }], [{ name: 'A' }], [{ ...free, name: '' }], [{ ...free, name: 'A\nB' }], [{ ...free, name: 'a'.repeat(1201) }], Array(101).fill(free)]) {
    assert.throws(() => submittedReferenceAuthors(form(rows)));
  }
  const data = form([]); data.set('authorEntries', '{');
  assert.throws(() => submittedReferenceAuthors(data), /invalide/);
});

test('new links follow picker visibility, archived existing links survive, unavailable IDs are rejected', async () => {
  let query;
  const tx = {
    libraryReferenceAuthor: { findMany: async ({ where }) => { assert.equal(where.referenceId, 7); return [{ mathematicianId: 12 }]; } },
    mathematician: { findMany: async args => { query = args; return [{ id: 12 }]; } }
  };
  await validateReferenceAuthors(tx, [linked, free], 5, 'fr', 7);
  assert.deepEqual(query.where, { id: { in: [12] }, OR: [{ status: 'PUBLISHED' }, { createdById: 5, status: { in: ['DRAFT', 'PENDING_REVIEW', 'NEEDS_WORK'] } }, { id: { in: [12] } }] });
  await validateReferenceAuthors(tx, [linked], 5, 'fr');
  assert.deepEqual(query.where.OR[2], { id: { in: [] } });
  tx.mathematician.findMany = async () => [];
  await assert.rejects(validateReferenceAuthors(tx, [linked], 5, 'fr'), /plus disponible/);
  await validateReferenceAuthors({}, [free], 5, 'fr');
});
