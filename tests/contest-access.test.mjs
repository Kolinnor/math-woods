import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as permissions from '../lib/permissions.ts';
import * as limits from '../lib/content-limits.ts';
import * as schedule from '../lib/daily-problem-schedule.ts';
import * as contests from '../lib/problem-contests.ts';
import * as contestForm from '../lib/contest-form.ts';
import * as tipImages from '../lib/tip-images.ts';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(file, role, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const user = role ? { id: 1, role, emailVerifiedAt: new Date() } : null;
  const modules = {
    '@prisma/client': require('@prisma/client'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/auth': { getCurrentUser: async () => user, requireVerifiedUser: async () => {
      if (!user) throw new Error('Sign in');
      return user;
    } },
    '@/lib/permissions': permissions,
    '@/lib/content-limits': limits,
    '@/lib/contest-form': contestForm,
    '@/lib/daily-problem-schedule': schedule,
    '@/lib/problem-contests': contests,
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr' },
    'next/navigation': { notFound: () => { throw new Error('Not found'); }, redirect() {}, unstable_rethrow() {} },
    'next/cache': { revalidatePath() {} },
    '@/lib/rate-limit': { assertRateLimit: async () => {}, isRateLimitError: error => error?.name === 'RateLimitError' },
    '@/lib/slug': { ensureSlug: () => 'test' },
    '@/lib/tip-images': tipImages,
    '@/lib/transaction-lock': { acquireTransactionLock: async () => {} },
    ...overrides
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, Date, FormData, console: { error() {} } });
  return exports;
}

test('visitors, users, moderators and admins cannot save contests or publish results', async () => {
  const db = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  for (const role of [null, 'USER', 'MODERATOR', 'ADMIN']) {
    const actions = load('lib/actions/contest-actions.ts', role, { '@/lib/db': { prisma: db } });
    for (const name of ['saveContestAction', 'publishContestResultsAction']) {
      await assert.rejects(actions[name](new FormData()), role ? /Only the site owner/ : /Sign in/);
    }
  }
});

test('owner can save without a summary and reaches the result publication transaction', async () => {
  let saved;
  const model = { findFirst: async () => null, updateMany: async () => ({ count: 0 }),
    create: async ({ data }) => { saved = data; return { id: 1 }; } };
  const db = { problemContest: model, $transaction: async cb => cb(db) };
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db } });
  const form = new FormData();
  for (const [key, value] of Object.entries({ titleEn: 'Test', titleFr: 'Test', startDateKey: '2026-09-12', rewardPoints: '300' })) form.set(key, value);
  await actions.saveContestAction(form);
  assert.equal(saved.createdById, 1);
  assert.equal(saved.publishedAt, null);
  assert.equal(saved.summaryFr, '');
  db.$transaction = async () => { throw new Error('Owner reached transaction'); };
  form.set('contestId', '1'); form.set('winnerSubmissionId', '1');
  await assert.rejects(actions.publishContestResultsAction(form), /Owner reached transaction/);
});

function validForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ titleEn: 'Test', titleFr: 'Essai', startDateKey: '2026-09-12', rewardPoints: '0', published: 'on' })) form.set(key, value);
  return form;
}

test('empty optional fields permit publication and a zero-point prize stays zero', async () => {
  let saved;
  const model = { findFirst: async () => null, updateMany: async () => ({ count: 0 }),
    create: async ({ data }) => { saved = data; return { id: 1 }; } };
  const db = { problemContest: model, $transaction: async cb => cb(db) };
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db } });
  assert.equal((await actions.saveContestFormAction('fr', { error: '' }, validForm())).error, '');
  assert.ok(saved.publishedAt instanceof Date);
  assert.equal(saved.rewardPoints, 0);
  for (const key of ['bodyEn', 'bodyFr', 'criteriaEn', 'criteriaFr', 'rulesEn', 'rulesFr']) assert.equal(saved[key], '');
  assert.equal(saved.imageUrl, null);
});

test('invalid fields return readable errors before touching the database', async () => {
  const db = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db } });
  for (const [key, value, pattern] of [
    ['titleEn', '', /Titre anglais.*obligatoire/], ['titleFr', '   ', /Titre français.*obligatoire/],
    ['titleEn', 'a'.repeat(161), /160 caractères/],
    ['startDateKey', '', /samedi/], ['startDateKey', '2026-09-13', /samedi/], ['startDateKey', '2026-02-31', /samedi/],
    ['rewardPoints', '', /récompense/], ['rewardPoints', '-1', /récompense/],
    ['rewardPoints', '0.5', /récompense/], ['rewardPoints', '10001', /récompense/],
    ['rulesFr', 'a'.repeat(4001), /4000 caractères/], ['imageUrl', 'http://example.com/photo.png', /HTTPS/]
  ]) {
    const form = validForm(); form.set(key, value);
    const result = await actions.saveContestFormAction('fr', { error: '' }, form);
    assert.match(result.error, pattern, key);
  }
  const form = validForm(); form.set('titleFr', '');
  assert.match((await actions.saveContestFormAction('en', { error: '' }, form)).error, /French title is required/);
});

test('duplicate weeks are explained and unexpected database details stay private', async () => {
  const db = { problemContest: { findFirst: async () => null }, $transaction: async () => {
    throw { code: 'P2002', meta: { target: ['startDateKey'] } };
  } };
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db } });
  assert.match((await actions.saveContestFormAction('fr', { error: '' }, validForm())).error, /existe déjà/);
  db.$transaction = async () => { throw new Error('SECRET_DATABASE_DETAIL'); };
  const result = await actions.saveContestFormAction('fr', { error: '' }, validForm());
  assert.match(result.error, /saisie est conservée/);
  assert.doesNotMatch(result.error, /SECRET_DATABASE_DETAIL/);
});

test('safe form action preserves authentication and successful-save redirects', async () => {
  const redirectError = { digest: 'NEXT_REDIRECT' };
  const navigation = { redirect() { throw redirectError; }, unstable_rethrow(error) { if (error === redirectError) throw error; } };
  const anonymous = load('lib/actions/contest-actions.ts', null, {
    'next/navigation': navigation,
    '@/lib/auth': { requireVerifiedUser: async () => { throw redirectError; } }
  });
  await assert.rejects(anonymous.saveContestFormAction('fr', { error: '' }, validForm()), error => error === redirectError);
  const model = { findFirst: async () => null, updateMany: async () => ({ count: 0 }), create: async () => ({ id: 1 }) };
  const db = { problemContest: model, $transaction: async cb => cb(db) };
  const owner = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db }, 'next/navigation': navigation });
  await assert.rejects(owner.saveContestFormAction('fr', { error: '' }, validForm()), error => error === redirectError);
  for (const role of ['USER', 'MODERATOR', 'ADMIN']) {
    let accessed = false;
    const restricted = load('lib/actions/contest-actions.ts', role, { '@/lib/db': { prisma: new Proxy({}, { get() { accessed = true; throw new Error('Unexpected database access'); } }) } });
    assert.ok((await restricted.saveContestFormAction('fr', { error: '' }, validForm())).error);
    assert.equal(accessed, false);
  }
});

test('editor and homepage preview reject direct access by every non-owner role', async () => {
  const db = { problemContest: { findMany: async () => [] } };
  for (const role of [null, 'USER', 'MODERATOR', 'ADMIN']) {
    for (const file of ['app/contest/edit/page.tsx', 'app/contest/preview/page.tsx']) {
      const page = load(file, role, { '@/lib/db': { prisma: db } }).default;
      await assert.rejects(page({ searchParams: Promise.resolve({ contest: '1', view: 'home' }) }), /Not found/);
    }
  }
});

test('problem notice follows the translation family and hides drafts, withdrawals and unpublished awards', async () => {
  const contest = { titleFr: 'Carrés et nombres premiers', titleEn: 'Squares and primes', startDateKey: '2026-09-12', publishedAt: new Date(), resultsPublishedAt: null };
  let entry = { translationGroupId: 'shared-by-en-and-fr', placement: 'WINNER', contest };
  const db = { problemContestSubmission: { findFirst: async ({ where }) => {
    assert.equal(where.translationGroupId, 'shared-by-en-and-fr');
    assert.equal(where.contest.publishedAt.not, null);
    assert.equal(where.problem.status, 'PUBLISHED');
    return entry?.contest.publishedAt ? entry : null;
  } } };
  const { ProblemContestNotice } = load('components/ProblemContestNotice.tsx', null, {
    '@/lib/db': { prisma: db },
    'next/link': { default: 'a' },
    'lucide-react': { Trophy: () => null },
    '@/components/AsyncMarkdownInline': { AsyncMarkdownInline: ({ markdown }) => markdown }
  });
  const render = async locale => renderToStaticMarkup(await ProblemContestNotice({ translationGroupId: entry?.translationGroupId ?? 'shared-by-en-and-fr', locale }));
  const participation = await render('fr');
  assert.match(participation, /Ce problème a été soumis au concours/);
  assert.match(participation, /Carrés et nombres premiers/);
  assert.match(participation, /href="\/contest\?week=2026-09-12"/);
  assert.doesNotMatch(participation, /lauréat/);
  assert.match(await render('en'), /Squares and primes/);
  contest.resultsPublishedAt = new Date();
  assert.match(await render('fr'), /Problème lauréat/);
  entry.placement = 'HONORABLE_MENTION';
  assert.match(await render('en'), /Honorable mention/);
  contest.publishedAt = null;
  assert.equal(await render('fr'), '');
  entry = null;
  assert.equal(await render('fr'), '');
});

test('a problem link can open a published contest older than the recent list, never a draft', async () => {
  const historic = { id: 7, startDateKey: '2025-01-04', endDateKey: '2025-01-10',
    publishedAt: new Date('2025-01-04'), resultsPublishedAt: new Date('2025-01-12'),
    titleFr: 'Ancienne édition', titleEn: 'Old contest', bodyEn: '', bodyFr: '', rulesEn: '', rulesFr: '', criteriaEn: '', criteriaFr: '', submissions: [] };
  let publicResult = historic;
  const visited = [];
  const db = { problemContest: {
    findMany: async ({ include }) => {
      assert.equal(include.submissions.where.problem.status, 'PUBLISHED');
      return [];
    },
    findFirst: async ({ where, include }) => {
      assert.equal(where.startDateKey, '2025-01-04');
      assert.equal(where.publishedAt.not, null);
      assert.equal(include.submissions.where.problem.status, 'PUBLISHED');
      return publicResult;
    }
  } };
  const page = load('app/contest/page.tsx', null, {
    '@/lib/db': { prisma: db },
    '@/lib/actions/contest-actions': { maybeSendContestLifecycleNotifications: async id => visited.push(id) },
    '@/lib/markdown': { renderMarkdown: async text => text }
  }).default;
  await page({ searchParams: Promise.resolve({ week: '2025-01-04' }) });
  assert.deepEqual(visited, [7]);
  publicResult = null;
  await page({ searchParams: Promise.resolve({ week: '2025-01-04' }) });
  assert.deepEqual(visited, [7]);
});

test('archiving any translation withdraws its family atomically, including previously archived families', async () => {
  for (const alreadyArchived of [false, true]) {
    for (const failArchive of alreadyArchived ? [false] : [false, true]) {
      let rows = [
        { id: 10, slug: 'source', translationGroupId: 'family', authorId: 1, translatedFromProblemId: null, version: 1, status: alreadyArchived ? 'ARCHIVED' : 'PUBLISHED' },
        { id: 11, slug: 'translation', translationGroupId: 'family', authorId: 2, translatedFromProblemId: 10, version: 1, status: alreadyArchived ? 'ARCHIVED' : 'PUBLISHED' }
      ];
      let entries = [{ id: 1, translationGroupId: 'family' }, { id: 2, translationGroupId: 'other-family' }];
      const invalidated = [];
      const locks = [];
      const tx = {
        problem: {
          findMany: async () => rows.filter(row => row.status !== 'ARCHIVED'),
          findUnique: async ({ where }) => rows.find(row => row.id === where.id),
          updateMany: async ({ where }) => { rows = rows.map(row => where.id.in.includes(row.id) ? { ...row, status: 'ARCHIVED', version: row.version + 1 } : row); }
        },
        problemContestSubmission: { deleteMany: async ({ where }) => {
          assert.deepEqual(locks, ['problem-edit:family']);
          entries = entries.filter(entry => entry.translationGroupId !== where.translationGroupId);
        } },
        internalLink: { deleteMany: async () => { if (failArchive) throw new Error('Simulated archive failure'); } },
        pageRevision: { findFirst: async () => ({ problemSnapshot: {} }), create: async () => {} }
      };
      const db = {
        problem: { findUnique: async () => rows[1], findMany: async () => rows },
        $transaction: async callback => {
          const savedRows = structuredClone(rows), savedEntries = structuredClone(entries);
          try { return await callback(tx); } catch (error) { rows = savedRows; entries = savedEntries; throw error; }
        }
      };
      const actions = load('lib/actions/problem-actions.ts', 'OWNER', {
        '@/lib/db': { prisma: db },
        '@/lib/transaction-lock': { acquireTransactionLock: async (_tx, key) => locks.push(key) },
        '@/lib/problem-revisions': { buildProblemRevisionSnapshot: () => ({}), problemRevisionSnapshotJson: value => value },
        '@/lib/notifications': { notifyAdminsOfProblemDeletion: async () => {} },
        '@/lib/user-display': { displayNameForUser: () => 'Owner' },
        'next/cache': { revalidatePath: path => invalidated.push(path) }
      });
      if (failArchive) {
        await assert.rejects(actions.deleteProblemAction(11), /Simulated archive failure/);
        assert.equal(entries.length, 2);
        assert.ok(rows.every(row => row.status === 'PUBLISHED'));
      } else {
        await actions.deleteProblemAction(11);
        assert.deepEqual(entries, [{ id: 2, translationGroupId: 'other-family' }]);
        assert.ok(rows.every(row => row.status === 'ARCHIVED'));
        assert.ok(invalidated.includes('/contest'));
        assert.ok(invalidated.includes('/contest/edit'));
      }
    }
  }
});

test('a concurrent archive cannot be followed by a stale contest submission', async () => {
  let status = 'PUBLISHED';
  let written = false;
  let locked = false;
  const db = {
    problem: {
      findUnique: async () => ({ translationGroupId: 'family' }),
      findFirst: async ({ where }) => {
        assert.ok(locked);
        assert.equal(where.status, 'PUBLISHED');
        return status === 'PUBLISHED' ? { id: 10, translationGroupId: 'family' } : null;
      }
    },
    problemContest: { findUnique: async () => ({ startDateKey: '2026-09-12', endDateKey: '2026-09-18' }) },
    problemContestSubmission: { upsert: async () => { written = true; } }
  };
  db.$transaction = async cb => cb(db);
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', {
    '@/lib/db': { prisma: db },
    '@/lib/problem-contests': { ...contests, contestIsOpen: () => true },
    '@/lib/transaction-lock': { acquireTransactionLock: async (_tx, key) => {
      assert.equal(key, 'problem-edit:family');
      status = 'ARCHIVED'; // A deletion completes while this submission waits for its lock.
      locked = true;
    } }
  });
  const form = new FormData(); form.set('contestId', '3'); form.set('problemId', '10');
  await assert.rejects(actions.submitContestProblemAction(form), /Choose an original problem/);
  assert.equal(written, false);
});

test('an archived entry cannot be selected as winner through a stale results form', async () => {
  const db = { problemContest: { findUnique: async ({ include }) => {
    assert.equal(include.submissions.where.problem.status, 'PUBLISHED');
    return { submissions: [{ id: 2, userId: 2, placement: null }] };
  } } };
  db.$transaction = async cb => cb(db);
  const actions = load('lib/actions/contest-actions.ts', 'OWNER', { '@/lib/db': { prisma: db } });
  const form = new FormData(); form.set('contestId', '3'); form.set('winnerSubmissionId', '1');
  await assert.rejects(actions.publishContestResultsAction(form), /does not belong to this contest/);
});
