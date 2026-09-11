import test from 'node:test';
import assert from 'node:assert/strict';
import { withCitationImages } from '../lib/citation-images.ts';
import { parseProblemCitations, visibleProblemCitations } from '../lib/problem-citations.ts';
import { repairPlan } from '../scripts/repair-reference-images-20260911.mjs';
import { lostReferenceImages, assertReferenceImagesPreserved } from '../scripts/reference-image-audit.mjs';

const image = { iconUrl: 'https://example.org/portrait.png', iconSize: 130, imageAlt: 'Portrait', imageCredit: 'Auteur', imageCreditUrl: 'https://example.org/source', imageLicense: 'CC BY' };
const ref = { id: 1, status: 'PUBLISHED', ...image };
const citation = { citationKey: 'image-test', referenceId: 1, text: 'Phil Caldero', url: null, locator: null, note: null, role: 'SOURCE', isPrimary: true, spoiler: false };

test('enriches only visible citations, with bounded image and preserved credits', () => {
  const secret = { ...citation, citationKey: 'secret', referenceId: 2, spoiler: true };
  const links = [{ reference: ref }, { reference: { ...ref, id: 2, iconUrl: 'https://example.org/solution.png' } }];
  const result = withCitationImages(visibleProblemCitations([citation, secret], false), links);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].image, { url: image.iconUrl, size: 56, alt: 'Portrait', credit: 'Auteur', creditUrl: image.imageCreditUrl, license: 'CC BY' });
  assert.ok(!JSON.stringify(result).includes('solution.png'));
  assert.equal(withCitationImages(visibleProblemCitations([secret], true), links)[0].image.url, 'https://example.org/solution.png');
  assert.equal('image' in parseProblemCitations(result)[0], false, 'Media must not enter editable/exported citation snapshots');
});

test('free references, unavailable catalogue entries and unsafe URLs keep their text', () => {
  for (const reference of [null, { ...ref, status: 'DRAFT' }, { ...ref, iconUrl: 'javascript:alert(1)' }, { ...ref, iconUrl: null }]) {
    assert.deepEqual(withCitationImages([citation], [{ reference }]), [citation]);
  }
  const free = { ...citation, referenceId: null };
  assert.deepEqual(withCitationImages([free], [{ reference: ref }]), [free]);
});

function inventory() {
  const videos = ['ib34ogdciuo', 'k8iz5b7cz1g', 'riymew4yyya', '8yndbmqymye'].map((v, i) => ({ id: i + 67, slug: `phil-caldero-${v}`, referenceType: 'VIDEO', status: 'PUBLISHED', authors: 'Phil Caldero', url: `https://www.youtube.com/watch?v=${v}`, iconUrl: null }));
  const problems = [145, 280, 365, 366, 389].map(id => ({ id, knownSourceId: 2, isOriginal: false, libraryReferences: [{ ...citation, id, problemId: id, referenceId: null, text: 'Math Woods', note: 'Keep this passage', spoiler: true }] }));
  return { libraryReference: [{ ...ref, slug: 'phil-caldero', referenceType: 'CHANNEL' }, { ...ref, id: 2, slug: 'math-woods', canonicalTitle: 'Math Woods' }, ...videos], knownSources: [{ id: 2, slug: 'math-woods', iconUrl: image.iconUrl }], problems, problemLibraryReference: problems.flatMap(p => p.libraryReferences), conceptLibraryReference: [] };
}

test('repair targets four videos and five links without altering citation text/privacy or Original', () => {
  const before = inventory(), unchanged = structuredClone(before);
  const plan = repairPlan(before);
  assert.equal(plan.references.length, 4);
  assert.equal(plan.citations.length, 5);
  assert.deepEqual(plan.references[0].data, image);
  assert.deepEqual(plan.remainingWarnings, []);
  assert.deepEqual(before, unchanged);
  for (const change of plan.references) Object.assign(before.libraryReference.find(r => r.id === change.id), change.data);
  for (const change of plan.citations) before.problemLibraryReference.find(c => c.id === change.id).referenceId = change.referenceId;
  assert.equal(repairPlan(before).references.length, 0);
  assert.equal(repairPlan(before).citations.length, 0);
});

test('repair preserves a newer illustration and rejects ambiguous data', () => {
  const before = inventory();
  before.libraryReference[2].iconUrl = 'https://example.org/new.png';
  assert.equal(repairPlan(before).references.length, 3);
  before.problems[0].libraryReferences[0].text = 'Another reference';
  assert.throws(() => repairPlan(before), /Review changed citations/);
});

test('guard catches an image lost through reassignment even if the original entry survives', () => {
  const before = inventory();
  before.problemLibraryReference[0].referenceId = 1;
  const after = structuredClone(before);
  after.problemLibraryReference[0].referenceId = 67;
  assert.match(lostReferenceImages(before, after)[0], /Illustrated citation lost/);
  assert.throws(() => assertReferenceImagesPreserved(before, after));
  after.libraryReference.find(r => r.id === 67).iconUrl = image.iconUrl;
  assertReferenceImagesPreserved(before, after);
});
