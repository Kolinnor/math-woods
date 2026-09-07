import test from 'node:test';
import assert from 'node:assert/strict';
import { recordedProblemDifficulty } from '../lib/problem-history.ts';

test('history distinguishes missing metadata, an unset difficulty and valid historical values', () => {
  for (const value of [null, undefined, [], {}, { schemaVersion: 1 }, { schemaVersion: 2, difficulty: 40 }, { schemaVersion: 1, difficulty: '40' }, { schemaVersion: 1, difficulty: 0 }, { schemaVersion: 1, difficulty: 101 }]) assert.equal(recordedProblemDifficulty(value), undefined);
  assert.equal(recordedProblemDifficulty({ schemaVersion: 1, difficulty: null }), null);
  for (const difficulty of [1, 35, 50, 100]) assert.equal(recordedProblemDifficulty({ schemaVersion: 1, difficulty }), difficulty);
});
