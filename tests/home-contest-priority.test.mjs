import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrioritizeHomeContest } from '../lib/home-contest-priority.ts';

const contest = (publishedAt, endDateKey = '2026-12-31') => ({ publishedAt: publishedAt ? new Date(publishedAt) : null, endDateKey });
test('publication day and following morning get priority, ending exactly at Paris noon', () => {
  const entry = contest('2026-09-12T08:00:00Z');
  for (const time of ['2026-09-12T08:00:00Z', '2026-09-12T21:59:59Z', '2026-09-13T09:59:59Z']) assert.equal(shouldPrioritizeHomeContest(entry, new Date(time)), true, time);
  for (const time of ['2026-09-12T07:59:59Z', '2026-09-13T10:00:00Z', '2026-09-14T08:00:00Z']) assert.equal(shouldPrioritizeHomeContest(entry, new Date(time)), false, time);
});
test('late publications use the Paris calendar date, not a rolling 36-hour window', () => {
  const entry = contest('2026-09-12T22:30:00Z'); // September 13 in Paris
  assert.equal(shouldPrioritizeHomeContest(entry, new Date('2026-09-14T09:59:59Z')), true);
  assert.equal(shouldPrioritizeHomeContest(entry, new Date('2026-09-14T10:00:00Z')), false);
});
test('Paris noon remains correct across summer and winter clock changes', () => {
  for (const [publication, before, after] of [
    ['2026-03-28T10:00:00Z', '2026-03-29T09:59:59Z', '2026-03-29T10:00:00Z'],
    ['2026-10-24T10:00:00Z', '2026-10-25T10:59:59Z', '2026-10-25T11:00:00Z']
  ]) {
    assert.equal(shouldPrioritizeHomeContest(contest(publication), new Date(before)), true);
    assert.equal(shouldPrioritizeHomeContest(contest(publication), new Date(after)), false);
  }
});
test('drafts, future publications and ended contests never get priority', () => {
  const now = new Date('2026-09-13T08:00:00Z');
  assert.equal(shouldPrioritizeHomeContest(contest(null), now), false);
  assert.equal(shouldPrioritizeHomeContest(contest('2026-09-14T08:00:00Z'), now), false);
  assert.equal(shouldPrioritizeHomeContest(contest('2026-09-12T08:00:00Z', '2026-09-12'), now), false);
});
