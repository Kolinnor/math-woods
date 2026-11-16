import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLikePromptDue, LIKE_PROMPT_SOLVE_INTERVAL, likePromptCooldownElapsed, LIKE_PROMPT_COOLDOWN_MS } from '../lib/problem-like-prompt-shared.ts';

test('like invitation appears on every third solve since the latest like', () => {
  assert.equal(LIKE_PROMPT_SOLVE_INTERVAL, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(isLikePromptDue), [false, false, false, true, false, false, true, true]);
});

test('like invitation is wired to solves and resets with likes', () => {
  const rules = readFileSync(new URL('../lib/problem-like-prompt.ts', import.meta.url), 'utf8');
  assert.match(rules, /if \(likedGroups\.has\(translationGroupId\)\) return false;/);
  assert.match(rules, /\.filter\(\(group\) => !likedGroups\.has\(group\)\)/);
  assert.match(rules, /solvedAt: \{ gt: lastLikeAt \}/);
  assert.match(rules, /authorId: \{ not: userId \}/);
  const actions = readFileSync(new URL('../lib/actions/problem-actions.ts', import.meta.url), 'utf8');
  // Only a fresh solve (not a re-submit of an already solved problem) can queue the prompt.
  assert.equal(actions.match(/if \(await markSolvedNow\(problemId, problemSlug, user\)\) \{\s*await queueLikePromptAfterSolve\(user\.id, problem\.translationGroupId\);/g)?.length, 2);
  assert.match(actions, /return !wasAlreadySolved;/);
  const dialog = readFileSync(new URL('../components/ProblemLikePromptDialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /if \(onceKey && wasShown\(onceKey\)\) return;/);
  assert.doesNotMatch(dialog, /showModal|onCancel=/);
  assert.match(dialog, /event.key === "Escape"/);
  assert.doesNotMatch(dialog, /event\.target === event\.currentTarget/);
  const page = readFileSync(new URL('../app/problems/[slug]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /!favorite && attempt\?\.status === "SOLVED" && likePromptGroupId === problem\.translationGroupId/);
  const route = readFileSync(new URL('../app/api/problems/[problemId]/browser-state/route.ts', import.meta.url), 'utf8');
  assert.match(route, /cookieStore\.delete\(LIKE_PROMPT_COOKIE\)/);
});

test('like invitations have a daily cooldown without trapping corrupted timestamps', () => {
  const now = 1000000000;
  assert.equal(likePromptCooldownElapsed(null, now), true);
  assert.equal(likePromptCooldownElapsed(String(now - 1), now), false);
  assert.equal(likePromptCooldownElapsed(String(now - LIKE_PROMPT_COOLDOWN_MS), now), true);
  assert.equal(likePromptCooldownElapsed("invalid", now), true);
  assert.equal(likePromptCooldownElapsed(String(now + 1), now), true);
});
