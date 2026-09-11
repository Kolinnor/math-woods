import assert from 'node:assert/strict';

export const IMAGE_FIELDS = ['iconUrl', 'iconSize', 'imageAlt', 'imageCredit', 'imageCreditUrl', 'imageLicense'];

// Run on inventories before/after catalogue corrections or merges. Keeping the
// old record alone is insufficient when its citations lose their illustration.
export function lostReferenceImages(before, after) {
  const issues = [];
  const afterUrls = new Set(after.libraryReference.map(r => r.iconUrl).filter(Boolean));
  for (const ref of before.libraryReference) {
    if (ref.iconUrl && !afterUrls.has(ref.iconUrl)) issues.push(`Image removed from catalogue: ${ref.slug}`);
  }
  for (const table of ['problemLibraryReference', 'conceptLibraryReference']) {
    const beforeRefs = new Map(before.libraryReference.map(r => [r.id, r]));
    const afterRefs = new Map(after.libraryReference.map(r => [r.id, r]));
    for (const citation of before[table] ?? []) {
      const image = beforeRefs.get(citation.referenceId)?.iconUrl;
      if (!image) continue;
      const owner = table === 'problemLibraryReference' ? 'problemId' : 'conceptId';
      const retained = (after[table] ?? []).some(c => c[owner] === citation[owner] && afterRefs.get(c.referenceId)?.iconUrl === image);
      if (!retained) issues.push(`Illustrated citation lost: ${table}/${citation[owner]} (${beforeRefs.get(citation.referenceId).slug})`);
    }
  }
  return [...new Set(issues)];
}

export function assertReferenceImagesPreserved(before, after) {
  assert.deepEqual(lostReferenceImages(before, after), [], 'Catalogue change would lose reference illustrations; review the image mapping first.');
}

export function auditReferenceImages({ libraryReference, knownSources, problems }) {
  const refs = new Map(libraryReference.map(r => [r.id, r]));
  const sources = new Map(knownSources.map(s => [s.id, s]));
  const issues = [];
  for (const problem of problems) {
    const source = sources.get(problem.knownSourceId);
    if (!source?.iconUrl || problem.isOriginal) continue;
    const illustrated = problem.libraryReferences.some(c => {
      const ref = refs.get(c.referenceId);
      return ref?.status === 'PUBLISHED' && ref.iconUrl;
    });
    if (!illustrated) issues.push({ problemId: problem.id, slug: problem.slug, source: source.name, issue: 'Legacy illustration no longer used' });
  }
  for (const ref of libraryReference) {
    if (!ref.iconUrl || !ref.mergedIntoId) continue;
    if (refs.get(ref.mergedIntoId)?.iconUrl !== ref.iconUrl) issues.push({ referenceId: ref.id, slug: ref.slug, issue: 'Merged illustration needs review' });
  }
  return issues;
}
