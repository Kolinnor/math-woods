import test from 'node:test';
import assert from 'node:assert/strict';
import { recordedProblemDifficulty, recordedProblemTitle } from '../lib/problem-history.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { fr } from '../lib/i18n/dictionaries/fr.ts';
import { en } from '../lib/i18n/dictionaries/en.ts';
import * as revisionSnapshots from '../lib/problem-revisions.ts';
import * as revisionDiff from '../lib/revision-diff.ts';

const require = createRequire(import.meta.url);
function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS
  } }).outputText;
  new Function('require', 'exports', code)(name => modules[name] ?? require(name), exports);
  return exports;
}

test('historical titles preserve exact spelling and LaTeX, without inventing missing values', () => {
  for (const value of [null, undefined, [], {}, { schemaVersion: 1 }, { schemaVersion: 2, title: 'New' }, { schemaVersion: 1, title: null }, { schemaVersion: 1, title: '' }, { schemaVersion: 1, title: '  ' }]) {
    assert.equal(recordedProblemTitle(value), undefined);
  }
  for (const title of ['etude', 'Étude', 'Un vecteur $\\vec{u}$']) {
    assert.equal(recordedProblemTitle({ schemaVersion: 1, title }), title);
  }
});

test('history distinguishes missing metadata, an unset difficulty and valid historical values', () => {
  for (const value of [null, undefined, [], {}, { schemaVersion: 1 }, { schemaVersion: 2, difficulty: 40 }, { schemaVersion: 1, difficulty: '40' }, { schemaVersion: 1, difficulty: 0 }, { schemaVersion: 1, difficulty: 101 }]) assert.equal(recordedProblemDifficulty(value), undefined);
  assert.equal(recordedProblemDifficulty({ schemaVersion: 1, difficulty: null }), null);
  for (const difficulty of [1, 35, 50, 100]) assert.equal(recordedProblemDifficulty({ schemaVersion: 1, difficulty }), difficulty);
});

test('problem history shows title-only changes, unchanged statements and missing legacy titles in FR/EN', async () => {
  const { RevisionDiff } = load('components/RevisionDiff.tsx', { '@/lib/revision-diff': revisionDiff });
  for (const [locale, dictionary] of [['fr', fr], ['en', en]]) {
    for (const [beforeTitle, afterTitle] of [['etude', 'Étude'], ['Un vecteur $u$', 'Un vecteur $\\vec{u}$'], [undefined, 'Nouveau titre'], ['Identique', 'Identique'], [undefined, undefined]]) {
      const rows = [afterTitle, beforeTitle].map((title, index) => ({
        id: 2 - index, createdAt: new Date('2026-09-23T10:00:00Z'), editedBy: null,
        editSummary: '', markdown: 'Énoncé inchangé', problemSnapshot: title === undefined ? null : { schemaVersion: 1, title }
      }));
      const modules = {
        'next/link': { default: ({ children }) => React.createElement('a', null, children) },
        'next/navigation': { notFound() { throw Error('unexpected not found'); } },
        '@/lib/content-slug-redirect': { redirectHistoricalContentSlug: async () => {} },
        '@/components/RevisionDiff': { RevisionDiff },
        '@/components/AsyncMarkdownInline': { AsyncMarkdownInline: ({ markdown }) => React.createElement('span', null, markdown) },
        '@/components/UserName': { UserName: () => null },
        '@/lib/actions/problem-actions': {},
        '@/lib/auth': { requireUser: async () => ({ id: 1 }) },
        '@/lib/db': { prisma: {
          problem: { findUnique: async () => ({ id: 1, slug: 'current', title: 'TODAYS_TITLE_MUST_NOT_REPLACE_HISTORY', libraryReferences: [] }) },
          problemAttempt: { findFirst: async () => null },
          pageRevision: { findMany: async () => rows },
          problemAttributionTransfer: { findMany: async () => [] }
        } },
        '@/lib/i18n/server': { getInterfaceLocale: async () => locale, getTranslations: async () => dictionary },
        '@/lib/permissions': { canRollbackProblem: () => false, canEditProblem: () => false },
        '@/lib/problem-revisions': revisionSnapshots,
        '@/lib/problem-history': { recordedProblemDifficulty, recordedProblemTitle }
      };
      const { default: Page } = load('app/problems/[slug]/history/page.tsx', modules);
      const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: 'current' }) }));
      const card = html.slice(html.indexOf('id="revision-2"'), html.indexOf('id="revision-1"'));
      assert.ok(card.includes(dictionary.historyPage.noStatementChanges));
      assert.ok(!card.includes('TODAYS_TITLE_MUST_NOT_REPLACE_HISTORY'));
      if (beforeTitle && afterTitle && beforeTitle !== afterTitle) {
        assert.ok(card.includes(dictionary.historyPage.titleChanged));
        assert.ok(card.includes(beforeTitle)); assert.ok(card.includes(afterTitle)); assert.ok(card.includes('→'));
      } else {
        assert.ok(!card.includes(dictionary.historyPage.titleChanged));
        if (!afterTitle) assert.ok(card.includes(dictionary.historyPage.titleNotRecorded));
        else if (!beforeTitle) assert.ok(card.includes(dictionary.historyPage.previousTitleNotRecorded));
      }
    }
  }
});
