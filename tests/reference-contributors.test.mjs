import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceContributors } from '../lib/reference-contributors.ts';

const person = id => ({ id, username: `person${id}`, profileSlug: `person-${id}`, displayName: null, avatarUrl: null, avatarBackground: null });
test('reference credits keep the creator first and combine multiple roles without duplicate people', () => {
  const rows = referenceContributors(person(1), [
    { user: person(2), edited: true, reviewed: false },
    { user: person(1), edited: true, reviewed: false },
    { user: person(2), edited: false, reviewed: true },
    { user: person(3), edited: false, reviewed: true }
  ]);
  assert.deepEqual(rows.map(row => [row.user.id, row.created, row.edited, row.reviewed]), [[1, true, true, false], [2, false, true, true], [3, false, false, true]]);
});
test('legacy creator and missing/deleted creator cases do not invent contribution history', () => {
  assert.deepEqual(referenceContributors(null, []), []);
  assert.deepEqual(referenceContributors(person(1), []).map(row => [row.created, row.edited, row.reviewed]), [[true, false, false]]);
  assert.deepEqual(referenceContributors(null, [{ user: person(2), edited: true, reviewed: false }]).map(row => row.user.id), [2]);
});
