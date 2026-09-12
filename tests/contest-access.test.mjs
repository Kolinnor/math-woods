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
    '@/lib/daily-problem-schedule': schedule,
    '@/lib/problem-contests': contests,
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr' },
    'next/navigation': { notFound: () => { throw new Error('Not found'); }, redirect() {} },
    'next/cache': { revalidatePath() {} },
    '@/lib/rate-limit': { assertRateLimit: async () => {} },
    '@/lib/slug': { ensureSlug: () => 'test' },
    '@/lib/tip-images': { normalizeTipImageUrl: () => null, normalizeTipImagePosition: () => 50 },
    ...overrides
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, Date, FormData });
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
  for (const [key, value] of Object.entries({ titleEn: 'Test', titleFr: 'Test', startDateKey: '2026-09-12' })) form.set(key, value);
  await actions.saveContestAction(form);
  assert.equal(saved.createdById, 1);
  assert.equal(saved.publishedAt, null);
  assert.equal(saved.summaryFr, '');
  db.$transaction = async () => { throw new Error('Owner reached transaction'); };
  form.set('contestId', '1'); form.set('winnerSubmissionId', '1');
  await assert.rejects(actions.publishContestResultsAction(form), /Owner reached transaction/);
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
