import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as policy from '../lib/discussion-follow-policy.ts';
import * as notificationPolicy from '../lib/notification-policy.ts';
import * as permissions from '../lib/permissions.ts';
import * as visibility from '../lib/problem-visibility.ts';
import * as solutionVisibility from '../lib/problem-solution-visibility.ts';
import { localizeNotification } from '../lib/notification-copy.ts';

const require = createRequire(import.meta.url);
const clean = value => JSON.parse(JSON.stringify(value));
function load(file, modules) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    if (name in modules) return modules[name];
    if (['@prisma/client', 'react/jsx-runtime', 'lucide-react'].includes(name)) return require(name);
    throw new Error(`Unexpected import: ${name}`);
  } });
  return exports;
}

function fixture() {
  const preferences = [];
  const posts = [];
  const notifications = [];
  const disabledUsers = new Set();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const model = kind => ({
    findFirst: async ({ where }) => posts.find(row => row.kind === kind && row.authorId === where.authorId && row.targetId === (where.proofId ?? where.conceptId ?? where.thread.problemId)) ?? null,
    findMany: async ({ where }) => posts.filter(row => row.kind === kind && row.targetId === (where.proofId ?? where.conceptId ?? where.thread.problemId))
  });
  const db = {
    discussionPost: model('problem'), proofComment: model('proof'), conceptTalkPost: model('concept'),
    discussionFollow: {
      findFirst: async ({ where }) => preferences.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }) => preferences.filter(row => matches(row, where)),
      upsert: async ({ where, create, update }) => {
        const row = preferences.find(row => matches(row, Object.values(where)[0]));
        if (row) Object.assign(row, update); else preferences.push(clean(create));
      }
    },
    notificationPreference: { findUnique: async ({ where }) => disabledUsers.has(where.userId_type.userId) ? { enabled: false } : null },
    notification: { create: async ({ data }) => { notifications.push(data); return data; } },
    problem: { findUnique: async () => ({ id: 10, slug: 'example', authorId: 8, status: 'PUBLISHED', verificationMode: 'NONE', translationGroupId: 'group' }) },
    problemProof: { findUnique: async () => ({ problem: await db.problem.findUnique() }) },
    concept: { findUnique: async () => ({ slug: 'concept' }) },
    problemAttempt: { findFirst: async () => null }
  };
  const modules = {
    '@/lib/db': { prisma: db }, '@/lib/discussion-follow-policy': policy,
    '@/lib/notification-policy': notificationPolicy, '@/lib/problem-edit-notifications': {},
    '@/lib/auth': { requireUser: async () => ({ id: 2, role: 'USER' }) },
    '@/lib/permissions': permissions, '@/lib/problem-visibility': visibility,
    '@/lib/problem-solution-visibility': solutionVisibility,
    '@/lib/rate-limit': { assertRateLimit: async () => {} }, 'next/cache': { revalidatePath() {} }
  };
  modules['@/lib/notifications'] = load('lib/notifications.ts', modules);
  const follows = load('lib/discussion-follows.ts', modules);
  const actions = load('lib/actions/discussion-follow-actions.ts', modules);
  return { db, preferences, posts, notifications, disabledUsers, modules, ...follows, ...actions };
}

for (const kind of ['problem', 'proof', 'concept']) {
  test(`${kind}: automatic participation, persistent opt-out, re-follow and isolated targets`, async () => {
    const f = fixture();
    const target = { kind, id: 10 };
    const send = () => f.notifyDiscussionFollowers({ target, authorIds: [1, 1], actorId: 3, actorName: 'Alice', contentTitle: 'Example', href: '/discussion#post-9' });
    assert.equal((await f.getDiscussionFollowing(target, 2, false)).following, false);
    f.posts.push({ kind, targetId: 10, authorId: 2, deletedAt: new Date() });
    assert.equal((await f.getDiscussionFollowing(target, 2, false)).following, true);
    // Duplicate participants and the actor must never generate duplicate/self notifications.
    f.posts.push({ kind, targetId: 10, authorId: 2 }, { kind, targetId: 10, authorId: 3 });
    f.posts.push({ kind, targetId: 11, authorId: 99 });
    await send();
    assert.deepEqual(f.notifications.map(n => n.userId), [1, 2]);
    assert.ok(f.notifications.every(n => n.href === '/discussion#post-9'));
    f.notifications.length = 0;
    await f.setDiscussionFollowingAction(target, false);
    f.posts.push({ kind, targetId: 10, authorId: 2 });
    assert.deepEqual(clean(await f.getDiscussionFollowing(target, 2, true)), { following: false, muted: true });
    await send();
    assert.deepEqual(f.notifications.map(n => n.userId), [1]);
    assert.equal((await f.getDiscussionFollowing({ kind, id: 11 }, 2, true)).following, true);
    await f.setDiscussionFollowingAction(target, true);
    f.notifications.length = 0;
    await send();
    assert.deepEqual(f.notifications.map(n => n.userId), [1, 2]);
    f.disabledUsers.add(2);
    f.notifications.length = 0;
    await send();
    assert.deepEqual(f.notifications.map(n => n.userId), [1]);
    assert.equal(f.preferences.length, 1);
  });
}

test('explicit followers need not post; unfollow overrides automatic authors and participants', () => {
  assert.deepEqual(policy.discussionRecipientIds([1, 2, 3, 3], [
    { userId: 1, following: false }, { userId: 2, following: false },
    { userId: 4, following: true }, { userId: 3, following: true }
  ], 3), [4]);
});

test('server action rejects invalid targets, unauthenticated users and inaccessible solutions', async () => {
  const f = fixture();
  for (const target of [null, { kind: 'user', id: 10 }, { kind: 'problem', id: -1 }, { kind: 'proof', id: 1.5 }]) {
    await assert.rejects(f.setDiscussionFollowingAction(target, false), /Invalid discussion preference/);
  }
  await assert.rejects(f.setDiscussionFollowingAction({ kind: 'problem', id: 10 }, 'false'), /Invalid/);
  f.db.problem.findUnique = async () => null;
  await assert.rejects(f.setDiscussionFollowingAction({ kind: 'problem', id: 10 }, false), /not found/);
  f.db.problemProof.findUnique = async () => ({ problem: { id: 10, slug: 'private', authorId: 8, status: 'PUBLISHED', verificationMode: 'AUTHOR_REVIEW', translationGroupId: 'group' } });
  await assert.rejects(f.setDiscussionFollowingAction({ kind: 'proof', id: 10 }, true), /not found/);
  const anonymous = load('lib/actions/discussion-follow-actions.ts', { ...f.modules, '@/lib/auth': { requireUser: async () => { throw new Error('Sign in'); } } });
  await assert.rejects(anonymous.setDiscussionFollowingAction({ kind: 'concept', id: 10 }, true), /Sign in/);
  assert.equal(f.preferences.length, 0);
});

test('controls explain automatic following and persistent muting in French and English', async () => {
  for (const locale of ['fr', 'en']) {
    for (const [following, muted] of [[false, false], [true, false], [false, true]]) {
      const { DiscussionFollowControl } = load('components/DiscussionFollowControl.tsx', {
        '@/lib/discussion-follows': { getDiscussionFollowing: async () => ({ following, muted }) },
        '@/lib/actions/discussion-follow-actions': { setDiscussionFollowingAction: async () => {} }
      });
      const html = renderToStaticMarkup(await DiscussionFollowControl({ target: { kind: 'problem', id: 10 }, userId: 2, isAuthor: false, locale }));
      assert.ok(html.includes(locale === 'fr' ? (following ? 'Ne plus suivre cette discussion' : 'Suivre cette discussion') : (following ? 'Unfollow this discussion' : 'Follow this discussion')));
      if (muted) assert.ok(html.includes(locale === 'fr' ? 'même si vous participez à nouveau' : 'even if you post again'));
    }
  }
});

test('solution and concept discussion notifications describe followed content without claiming ownership', async () => {
  for (const kind of ['proof', 'concept']) {
    const f = fixture();
    await f.notifyDiscussionFollowers({ target: { kind, id: 10 }, authorIds: [1], actorId: 2, actorName: 'Alice', contentTitle: 'Example', href: '/discussion' });
    const text = localizeNotification(f.notifications[0], 'fr');
    assert.ok(text.body.includes('Example'));
    assert.ok(text.body.includes(kind === 'proof' ? 'une solution' : 'du concept'));
    assert.ok(!text.body.includes('votre solution'));
  }
});
