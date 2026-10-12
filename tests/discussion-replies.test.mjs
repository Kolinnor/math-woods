import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { discussionReplyPreview } from '../lib/discussion-reply-preview.ts';
import * as permissions from '../lib/permissions.ts';
import * as visibility from '../lib/problem-visibility.ts';
import * as solutionVisibility from '../lib/problem-solution-visibility.ts';
import * as limits from '../lib/content-limits.ts';
import * as languages from '../lib/languages.ts';

const require = createRequire(import.meta.url);
function load(file, modules) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => name in modules ? modules[name] : name.startsWith('@/') ? {} : require(name));
  return exports;
}

function fixture() {
  let problem = { id: 10, authorId: 1, status: 'PUBLISHED', verificationMode: 'NONE', translationGroupId: 'group' };
  const rows = [
    { id: 1, targetId: 10, authorId: 5, deletedAt: null },
    { id: 2, targetId: 20, authorId: 6, deletedAt: null },
    { id: 3, targetId: 10, authorId: 7, deletedAt: new Date() },
    { id: 4, targetId: 10, authorId: 8, deletedAt: null, parentId: 1 }
  ];
  const model = { findFirst: async ({ where }) => rows.find(row => row.id === where.id && row.deletedAt === where.deletedAt && row.targetId === (where.conceptId ?? where.proofId ?? where.thread?.problemId)) ?? null };
  const prisma = {
    discussionPost: model, proofComment: model, conceptTalkPost: model,
    problem: { findUnique: async () => problem },
    problemProof: { findUnique: async () => ({ problem }) },
    problemAttempt: { findFirst: async () => null }
  };
  const { resolveDiscussionReply } = load('lib/discussion-replies.ts', {
    '@/lib/db': { prisma }, '@/lib/permissions': permissions,
    '@/lib/problem-visibility': visibility, '@/lib/problem-solution-visibility': solutionVisibility
  });
  return { resolveDiscussionReply, setProblem(value) { problem = value; } };
}

for (const kind of ['problem', 'proof', 'concept']) {
  test(`${kind}: allow ordinary comments and replies, reject deleted, cross-discussion and malformed targets`, async () => {
    const { resolveDiscussionReply } = fixture();
    const resolve = value => resolveDiscussionReply({ kind, id: 10 }, value, { id: 9, role: 'USER' });
    assert.equal(await resolve(null), null);
    assert.equal(await resolve(''), null);
    assert.equal((await resolve('1')).authorId, 5);
    assert.equal((await resolve('4')).id, 4); // Replies can themselves receive replies.
    for (const id of ['2', '3', '999']) await assert.rejects(resolve(id), /no longer available/);
    for (const id of ['-1', '0', '1.5', '1e0', 'NaN', ' 1', '9007199254740992', new File(['1'], 'id')]) {
      await assert.rejects(resolve(id), /Invalid reply target/);
    }
  });
}

test('reply endpoints retain archived-problem and unrevealed-solution access checks', async () => {
  const f = fixture();
  f.setProblem({ authorId: 1, status: 'ARCHIVED', verificationMode: 'NONE' });
  await assert.rejects(f.resolveDiscussionReply({ kind: 'problem', id: 10 }, '1', { id: 9, role: 'USER' }), /not found/);
  assert.equal((await f.resolveDiscussionReply({ kind: 'problem', id: 10 }, '1', { id: 1, role: 'USER' })).id, 1);
  f.setProblem({ authorId: 1, status: 'PUBLISHED', verificationMode: 'AUTHOR_REVIEW', translationGroupId: 'group' });
  await assert.rejects(f.resolveDiscussionReply({ kind: 'proof', id: 10 }, '1', { id: 9, role: 'USER' }), /not found/);
});

test('quotes link to the original, escape user text, truncate long content and conceal hints/deleted posts', () => {
  const { DiscussionReplyQuote } = load('components/DiscussionReplyQuote.tsx', {});
  for (const locale of ['fr', 'en']) {
    const post = { id: 42, author: { username: 'alice', displayName: '<Alice>' }, bodyMarkdown: '<script>alert(1)</script> $x^2$' };
    const reply = discussionReplyPreview(post, locale);
    const html = renderToStaticMarkup(DiscussionReplyQuote({ reply, anchorPrefix: 'comment', locale }));
    assert.ok(html.includes('href="#comment-42"'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes(locale === 'fr' ? 'En réponse à' : 'In reply to'));
    assert.ok(discussionReplyPreview({ ...post, bodyMarkdown: 'A'.repeat(1000) }, locale).excerpt.length <= 180);
    assert.ok(!discussionReplyPreview({ ...post, type: 'HINT' }, locale).excerpt.includes('alert'));
    const removed = renderToStaticMarkup(DiscussionReplyQuote({ reply: null, anchorPrefix: 'post', locale }));
    assert.ok(removed.includes(locale === 'fr' ? 'supprimé' : 'deleted'));
    assert.ok(!removed.includes('href='));
  }
});

for (const [kind, file, method] of [
  ['problem', 'problem-actions', 'createDiscussionPostAction'],
  ['proof', 'proof-actions', 'createProofCommentAction'],
  ['concept', 'concept-community-actions', 'createConceptTalkPostAction']
]) {
  test(`${kind}: creation persists the validated parent and sends the targeted notification only after saving`, async () => {
    const writes = [], notifications = [], acknowledgements = [];
    const problem = { id: 10, slug: 'example', title: 'Example', authorId: 1, status: 'PUBLISHED', verificationMode: 'NONE', thread: { id: 12 } };
    const model = {
      findFirst: async ({ where }) => where.id === 5 && where.deletedAt === null && (where.conceptId ?? where.proofId ?? where.thread?.problemId) === 10
        ? { id: 5, authorId: 7 } : null,
      create: async ({ data }) => { writes.push(data); return { id: 99 }; }
    };
    const prisma = {
      problem: { findUnique: async () => problem },
      problemProof: { findFirst: async () => ({ authorId: 1, translatedById: null, problem }), findUnique: async () => ({ problem }) },
      concept: { findFirst: async () => ({ title: 'Example' }) },
      problemAttempt: { findFirst: async () => null },
      discussionPost: model, proofComment: model, conceptTalkPost: model
    };
    const modules = {
      '@/lib/db': { prisma }, '@/lib/permissions': permissions,
      '@/lib/problem-visibility': visibility, '@/lib/problem-solution-visibility': solutionVisibility,
      '@/lib/auth': { requireVerifiedUser: async () => ({ id: 2, role: 'USER' }) },
      '@/lib/rate-limit': { assertRateLimit: async () => {} },
      '@/lib/content-limits': limits, '@/lib/languages': languages,
      '@/lib/markdown': { renderMarkdown: async text => `<p>${text}</p>` },
      '@/lib/user-display': { displayNameForUser: () => 'Alice' },
      '@/lib/discussion-follows': { notifyDiscussionFollowers: async input => { assert.equal(writes.length, 1); notifications.push(input); } },
      '@/lib/citation-draft-receipt': { acknowledgeCitationDraft: async data => { assert.equal(writes.length, 1); acknowledgements.push(data); } },
      'next/cache': { revalidatePath() {} },
      'next/navigation': { redirect() { throw Error('Unexpected redirect for inline reply'); } }
    };
    modules['@/lib/discussion-replies'] = load('lib/discussion-replies.ts', modules);
    const actions = load(`lib/actions/${file}.ts`, modules);
    const data = new FormData(); data.set('bodyMarkdown', 'My reply'); data.set('language', 'fr');
    data.set('replyInline', '1'); data.set('replyToAuthorId', '999');
    const post = () => actions[method](10, kind === 'problem' ? true : 'example', data);
    for (const parentId of ['6', '-1', '5.1']) {
      data.set('parentId', parentId);
      await assert.rejects(post(), /reply target|Reply target/);
      assert.equal(writes.length, 0); assert.equal(notifications.length, 0); assert.equal(acknowledgements.length, 0);
    }
    data.set('parentId', '5');
    await post();
    assert.equal(writes[0].parentId, 5); assert.equal(writes[0].authorId, 2);
    assert.equal(writes[0].bodyMarkdown, 'My reply');
    assert.equal(notifications.length, 1); assert.equal(notifications[0].replyToAuthorId, 7);
    assert.ok(notifications[0].href.endsWith(kind === 'proof' ? '#comment-99' : '#post-99'));
    assert.equal(acknowledgements.length, 1);
  });
}
