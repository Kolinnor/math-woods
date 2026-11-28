import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatLikePromptPresses,
  isLikePromptDue,
  LIKE_PROMPT_PRESS_INTERVAL,
  parseLikePromptPresses
} from '../lib/problem-like-prompt-shared.ts';

test('like invitation appears once three presses have accumulated', () => {
  assert.equal(LIKE_PROMPT_PRESS_INTERVAL, 3);
  assert.deepEqual([0, 1, 2, 3, 4].map(isLikePromptDue), [false, false, false, true, true]);
});

test('press counter belongs to one account and survives corrupted values', () => {
  assert.equal(parseLikePromptPresses(formatLikePromptPresses(7, 2), 7), 2);
  assert.equal(parseLikePromptPresses(formatLikePromptPresses(7, 2), 8), 0);
  assert.equal(parseLikePromptPresses(undefined, 7), 0);
  assert.equal(parseLikePromptPresses('7:abc', 7), 0);
  assert.equal(parseLikePromptPresses('7:-3', 7), 0);
});

test('like invitation counts solve and add-to-list presses and resets with likes', () => {
  const rules = readFileSync(new URL('../lib/problem-like-prompt.ts', import.meta.url), 'utf8');
  // Never invite to like one's own problem or one already liked; reset after prompting.
  assert.match(rules, /authorId: userId/);
  assert.match(rules, /return !ownProblem && !like;/);
  assert.match(rules, /formatLikePromptPresses\(userId, prompt \? 0 : presses\)/);
  const actions = readFileSync(new URL('../lib/actions/problem-actions.ts', import.meta.url), 'utf8');
  // Only a fresh solve (not a re-submit of an already solved problem) counts as a press.
  assert.equal(actions.match(/if \(await markSolvedNow\(problemId, problemSlug, user\)\) \{\s*await registerLikePromptPress\(user\.id, problem\.translationGroupId\);/g)?.length, 2);
  assert.match(actions, /return !wasAlreadySolved;/);
  // Only an attempt that actually adds the problem to the list counts as a press.
  assert.match(actions, /if \(!existingAttempt && createdAttempts\.count > 0\) \{\s*await registerLikePromptPress\(user\.id, problem\.translationGroupId\);/);
  assert.match(actions, /skipDuplicates: true\s*\}\);\s*await resetLikePromptPresses\(user\.id\);/);
  const dialog = readFileSync(new URL('../components/ProblemLikePromptDialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /if \(onceKey && wasShown\(onceKey\)\) return;/);
  assert.doesNotMatch(dialog, /showModal|onCancel=|likePromptCooldownElapsed/);
  assert.match(dialog, /event.key === "Escape"/);
  assert.match(dialog, /triggerParticleBurst\([^)]*"exclamation"\)/);
  const page = readFileSync(new URL('../app/problems/[slug]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /!favorite && attempt && likePromptGroupId === problem\.translationGroupId/);
  const route = readFileSync(new URL('../app/api/problems/[problemId]/browser-state/route.ts', import.meta.url), 'utf8');
  assert.match(route, /operation === "solve" \|\| operation === "attempt"/);
  assert.match(route, /cookieStore\.delete\(LIKE_PROMPT_COOKIE\)/);
});
