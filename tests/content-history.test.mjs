import * as conceptProofs from "../lib/concept-proofs.ts";
import * as additionalLinks from '../lib/additional-concept-links.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as history from '../lib/content-history.ts';
import { buildProblemRevisionSnapshot, parseProblemRevisionSnapshot, mergeProblemRevisionSnapshots, changedProblemSnapshotFields } from '../lib/problem-revisions.ts';
import { buildConceptRevisionSnapshot, changedConceptSnapshotFields, parseConceptRevisionSnapshot } from '../lib/concept-revisions.ts';
import { latestConceptTextRevisionIdFromRevisions, latestProblemTextRevisionIdFromRevisions } from '../lib/translation-text-revisions.ts';
import { parseEditorDraftReceipt } from '../lib/editor-draft-receipts.ts';
import * as limits from '../lib/content-limits.ts';

const require = createRequire(import.meta.url);
function load(file, modules = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => name in modules ? modules[name] : require(name));
  return exports;
}
const base = {
  title: 'Title', language: 'fr', bodyMarkdown: 'Statement', difficulty: null, domains: [], tags: [], spoilerTags: [],
  relatedGroups: [], libraryReferences: [], qualityStatus: 'UNREVIEWED', isExercise: false, isConjecture: false,
  showRelatedProblems: true, styles: [], aliases: [], references: [], practiceExercises: [], domainCode: 'other',
  kind: 'DEFINITION', status: 'STUB', ...history.contentHistory()
};
const filled = { historyMarkdown: 'Origines : [[Euclide]] et $x^2$.', historyEnabled: true, historySpoiler: true };

test('history is absent by default, preserves hidden text and ignores obsolete forms', () => {
  const form = new FormData();
  assert.deepEqual(history.submittedContentHistory(form), history.contentHistory());
  assert.equal(history.visibleHistory(history.contentHistory()), false);
  assert.deepEqual(history.submittedContentHistory(form, filled, true), filled);
  history.historyFormData(form, filled);
  assert.deepEqual(history.submittedContentHistory(form, undefined, true), filled);
  assert.equal(history.submittedContentHistory(form).historySpoiler, false, 'concepts do not accept problem spoiler flags');
  form.delete('historyEnabled');
  const hidden = history.submittedContentHistory(form, filled, true);
  assert.equal(hidden.historyMarkdown, filled.historyMarkdown);
  assert.equal(history.visibleHistory(hidden), false);
  form.set('historyMarkdown', '  '); form.set('historyEnabled', 'on');
  assert.equal(history.visibleHistory(history.submittedContentHistory(form)), false);
  form.set('historyMarkdown', 'x'.repeat(60001));
  assert.throws(() => history.submittedContentHistory(form), /60,000/);
  const oldProposal = new FormData(); history.historyFormData(oldProposal, {});
  assert.equal(oldProposal.has('historyMarkdown'), false);
});

test('hidden history and spoiler history never create public backlinks', () => {
  assert.equal(history.contentWithHistory('Statement', filled), 'Statement');
  assert.equal(history.contentWithHistory('Statement', { ...filled, historySpoiler: false }), `Statement\n\n${filled.historyMarkdown}`);
  assert.equal(history.contentWithHistory('Statement', { ...filled, historySpoiler: false, historyEnabled: false }), 'Statement');
});

test('snapshots round-trip history; concurrent edits merge unrelated changes and detect history conflicts', () => {
  const original = buildProblemRevisionSnapshot(base);
  const edited = buildProblemRevisionSnapshot({ ...base, ...filled });
  const parsed = parseProblemRevisionSnapshot(JSON.parse(JSON.stringify(edited)));
  for (const field of history.HISTORY_FIELDS) assert.equal(parsed[field], filled[field]);
  assert.deepEqual(changedProblemSnapshotFields(original, edited), [...history.HISTORY_FIELDS]);
  const current = { ...original, title: 'New title' };
  const merge = mergeProblemRevisionSnapshots(original, current, edited);
  assert.deepEqual(merge.conflicts, []); assert.equal(merge.merged.title, 'New title');
  assert.equal(merge.merged.historyMarkdown, filled.historyMarkdown);
  assert.deepEqual(mergeProblemRevisionSnapshots(original, { ...original, historyMarkdown: 'Other edit' }, edited).conflicts, ['historyMarkdown']);
  const legacy = { ...original }; for (const field of history.HISTORY_FIELDS) delete legacy[field];
  assert.deepEqual(mergeProblemRevisionSnapshots(legacy, original, edited).conflicts, []);
  assert.equal(mergeProblemRevisionSnapshots(legacy, edited, legacy).merged.historyMarkdown, filled.historyMarkdown);
  const concept = buildConceptRevisionSnapshot({ ...base, ...filled, historySpoiler: false });
  assert.deepEqual(changedConceptSnapshotFields(buildConceptRevisionSnapshot(base), concept), ['historyMarkdown', 'historyEnabled']);
  assert.equal(parseConceptRevisionSnapshot(JSON.parse(JSON.stringify(concept))).historyMarkdown, filled.historyMarkdown);
});

test('history edits invalidate translation freshness, without a false change for legacy empty history', () => {
  const snapshots = [{}, history.contentHistory(), filled, filled, { ...filled, historyEnabled: false }];
  const problem = snapshots.map((snapshot, index) => ({ id: index + 1, markdown: 'Same', problemSnapshot: { title: 'Same', ...snapshot } }));
  const concept = snapshots.map((snapshot, index) => ({ id: index + 1, markdown: 'Same', conceptTitle: 'Same', conceptSnapshot: snapshot }));
  for (const [rows, latest] of [[problem, latestProblemTextRevisionIdFromRevisions], [concept, latestConceptTextRevisionIdFromRevisions]]) {
    assert.equal(latest(rows.slice(0, 2)), 1);
    assert.equal(latest(rows.slice(0, 4)), 3);
    assert.equal(latest(rows), 5);
  }
});

test('reader starts collapsed, warns before revealing spoilers and supports both interface languages', () => {
  const { ContentHistorySection } = load('components/ContentHistorySection.tsx', {
    '@/lib/content-history': history,
    '@/components/MarkdownBlock': { MarkdownBlock: ({ html }) => React.createElement('div', null, html) }
  });
  for (const locale of ['fr', 'en']) {
    const html = renderToStaticMarkup(React.createElement(ContentHistorySection, { html: 'SOLUTION SECRET', spoiler: true, locale }));
    assert.doesNotMatch(html, /SOLUTION SECRET|<details[^>]* open/);
    assert.ok(html.includes(history.historyCopy(locale).warning));
  }
  assert.equal(renderToStaticMarkup(React.createElement(ContentHistorySection, { html: '', locale: 'fr' })), '');
});

test('history drafts use the existing save-receipt guard', () => {
  for (const type of ['problem', 'concept']) {
    assert.ok(parseEditorDraftReceipt({ key: `math-woods-markdown-draft:${type}:17:history`, token: 'saved-token' }));
    assert.ok(parseEditorDraftReceipt({ key: `math-woods-text-field-draft:${type}:17:history-options`, token: 'saved-token' }));
  }
});

test('the preview API renders history only when enabled and rejects oversized input', async () => {
  const rendered = [], resolvedLinks = [];
  const { POST } = load('app/api/content-preview/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth': { getCurrentUser: async () => ({ id: 1 }) },
    '@/lib/concept-proofs': conceptProofs,
    '@/lib/content-limits': limits,
    '@/lib/additional-concept-links': additionalLinks, '@/lib/additional-concept-links-db': { uncitedAdditionalConceptLinks: async (...args) => { resolvedLinks.push(args); return args[0].map(slug => ({ slug, title: slug })); } }, '@/lib/content-history': history,
    '@/lib/rate-limit': { assertRateLimit: async () => {} },
    '@/lib/problem-citations': { parseProblemCitations: value => value },
    '@/lib/markdown': { renderInlineMarkdown: async value => value, renderMarkdown: async value => { rendered.push(value); return `<p>${value}</p>`; } }
  });
  const preview = overrides => POST({ json: async () => ({ title: 'Title', bodyMarkdown: 'Body', historyMarkdown: 'History', ...overrides }) });
  assert.equal((await preview({ historyEnabled: false })).body.historyHtml, '');
  assert.deepEqual(rendered, ['Body']);
  const enabled = await preview({ historyEnabled: true, historySpoiler: true });
  assert.equal(enabled.body.historyHtml, '<p>History</p>'); assert.equal(enabled.body.historySpoiler, true);
  assert.equal((await preview({ historyEnabled: true, historyMarkdown: 'x'.repeat(60001) })).status, 413);
  assert.equal((await preview({ historyMarkdown: {} })).status, 400);
  const linked = await preview({ additionalConceptSlugs: ['integrale'], language: 'fr', historyEnabled: true });
  assert.deepEqual(linked.body.additionalLinks, [{ slug: 'integrale', title: 'integrale' }]);
  assert.deepEqual(resolvedLinks.at(-1), [['integrale'], 'Body\n\nHistory', 'fr']);
  await preview({ additionalConceptSlugs: ['integrale'], language: 'fr', historyEnabled: true, historySpoiler: true });
  assert.deepEqual(resolvedLinks.at(-1), [['integrale'], 'Body', 'fr']);
  assert.equal((await preview({ additionalConceptSlugs: ['../unsafe'] })).status, 400);
});
