import * as conceptDomains from "../lib/concept-domains.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as proofs from '../lib/concept-proofs.ts';
import * as snapshots from '../lib/concept-revisions.ts';
import { latestConceptTextRevisionIdFromRevisions } from '../lib/translation-text-revisions.ts';
import { parseEditorDraftReceipt } from '../lib/editor-draft-receipts.ts';
import * as history from '../lib/content-history.ts';
import * as limits from '../lib/content-limits.ts';
import * as additionalLinks from '../lib/additional-concept-links.ts';
import * as citations from '../lib/concept-citations.ts';
import * as feedback from '../lib/form-feedback.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  new Function('exports', 'require', code)(exports, name => name in mocks ? mocks[name] : require(name));
  return exports;
}
const first = { id: 'geometric', title: 'Preuve géométrique', markdown: 'Par [[homothetie]] : $a^2+b^2=c^2$.' };
const second = { id: 'algebraic', title: 'Preuve algébrique', markdown: 'Autre méthode.' };
const source = {
  title: 'Théorème', language: 'fr', bodyMarkdown: 'Énoncé', proofs: [], domainCode: 'other',
  kind: 'THEOREM', status: 'REVIEWED', needsReviewAfterEdit: false, canAppearInConceptBrowser: true,
  translatedFromRevisionId: null, aliases: [], references: [], libraryReferences: [], practiceExercises: [], ...history.contentHistory()
};

test('proofs default to absent; old forms preserve them and explicit removal clears them', () => {
  const form = new FormData();
  assert.deepEqual(proofs.submittedConceptProofs(form), []);
  assert.deepEqual(proofs.submittedConceptProofs(form, [first]), [first]);
  form.set('conceptProofs', '[]');
  assert.deepEqual(proofs.submittedConceptProofs(form, [first]), []);
  form.set('conceptProofs', JSON.stringify([first]));
  form.set('conceptProof-geometric', 'Last keystroke $x$.');
  assert.equal(proofs.submittedConceptProofs(form)[0].markdown, 'Last keystroke $x$.');
  form.set('conceptProof-geometric', 'x'.repeat(60001));
  assert.throws(() => proofs.submittedConceptProofs(form), proofs.ConceptProofValidationError);
});

test('proof validation rejects malformed, duplicated and oversized input', () => {
  for (const value of [null, {}, [first, first], [{ ...first, id: '<bad>' }], [{ ...first, title: 1 }],
    [{ ...first, title: 'x'.repeat(161) }], [{ ...first, markdown: 'x'.repeat(60001) }],
    Array.from({ length: 11 }, (_, index) => ({ ...first, id: String(index) })),
    Array.from({ length: 3 }, (_, index) => ({ ...first, id: String(index), markdown: 'x'.repeat(50000) }))]) {
    assert.throws(() => proofs.parseConceptProofs(value), proofs.ConceptProofValidationError);
  }
});

test('snapshot diffs track additions, edits, order and removals without inventing legacy values', () => {
  const before = snapshots.buildConceptRevisionSnapshot(source);
  const after = snapshots.buildConceptRevisionSnapshot({ ...source, proofs: [first, second] });
  assert.deepEqual(snapshots.parseConceptRevisionSnapshot(JSON.parse(JSON.stringify(after))).proofs, [first, second]);
  assert.deepEqual(snapshots.changedConceptSnapshotFields(before, after), ['proofs']);
  assert.deepEqual(snapshots.changedConceptSnapshotFields(after, { ...after, proofs: [second, first] }), ['proofs']);
  assert.deepEqual(snapshots.changedConceptSnapshotFields(after, before), ['proofs']);
  const legacy = { ...before }; delete legacy.proofs;
  assert.equal(snapshots.parseConceptRevisionSnapshot(legacy).proofs, undefined);
  assert.deepEqual(snapshots.changedConceptSnapshotFields(legacy, after), []);
  assert.equal(snapshots.parseConceptRevisionSnapshot({ ...after, proofs: [first, first] }), null);
});

test('proof-only changes invalidate translation freshness, metadata-only saves do not', () => {
  const rows = [{}, { proofs: [] }, { proofs: [first] }, { proofs: [first], status: 'REVIEWED' }, { proofs: [second] }, { proofs: [] }]
    .map((conceptSnapshot, index) => ({ id: index + 1, markdown: 'Same', conceptTitle: 'Same', conceptSnapshot }));
  assert.equal(latestConceptTextRevisionIdFromRevisions(rows.slice(0, 2)), 1);
  assert.equal(latestConceptTextRevisionIdFromRevisions(rows.slice(0, 4)), 3);
  assert.equal(latestConceptTextRevisionIdFromRevisions(rows.slice(0, 5)), 5);
  assert.equal(latestConceptTextRevisionIdFromRevisions(rows), 6);
});

test('links and exports include proof text; empty proofs produce no public section', () => {
  assert.equal(proofs.contentWithProofs('Statement', { proofs: [] }), 'Statement');
  assert.equal(proofs.contentWithProofs('Statement', { proofs: [{ ...first, markdown: ' ' }] }), 'Statement');
  assert.match(proofs.contentWithProofs('Statement', { proofs: [first] }), /\[\[homothetie\]\]/);
  assert.ok(parseEditorDraftReceipt({ key: 'math-woods-text-field-draft:concept:17:proofs', token: 'saved-token' }));
});

test('merging concepts retains distinct proofs, deduplicates identical content and resolves id collisions', () => {
  assert.deepEqual(proofs.mergeConceptProofs([first], [first]), [first]);
  const merged = proofs.mergeConceptProofs([first], [{ ...second, id: first.id }]);
  assert.equal(merged.length, 2);
  assert.notEqual(merged[0].id, merged[1].id);
  assert.equal(merged[1].markdown, second.markdown);
});

test('reader is empty by default, collapsed for every proof and safely escapes titles', () => {
  const { ConceptProofsSection } = load('components/ConceptProofsSection.tsx', {
    '@/lib/concept-proofs': proofs,
    '@/components/MarkdownBlock': { MarkdownBlock: ({ html }) => React.createElement('div', null, html) }
  });
  assert.equal(renderToStaticMarkup(React.createElement(ConceptProofsSection, { proofs: [], locale: 'fr' })), '');
  const html = renderToStaticMarkup(React.createElement(ConceptProofsSection, { locale: 'fr', proofs: [first, second].map(proof => ({ ...proof, title: '<script>test</script>', html: proof.markdown })) }));
  assert.equal((html.match(/<details/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<details[^>]*open|<script>/);
  assert.match(html, /Preuve 1/);
});

test('preview renders proofs and includes their real links when hiding additional links', async () => {
  let indexed = '';
  const { POST } = load('app/api/content-preview/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth': { getCurrentUser: async () => ({ id: 1 }) },
    '@/lib/concept-proofs': proofs, '@/lib/content-history': history, '@/lib/content-limits': limits,
    '@/lib/additional-concept-links': additionalLinks,
    '@/lib/additional-concept-links-db': { uncitedAdditionalConceptLinks: async (_, markdown) => { indexed = markdown; return []; } },
    '@/lib/rate-limit': { assertRateLimit: async () => {} },
    '@/lib/problem-citations': { parseProblemCitations: value => value },
    '@/lib/markdown': { renderInlineMarkdown: async value => value, renderMarkdown: async value => `<p>${value}</p>` }
  });
  const preview = value => POST({ json: async () => ({ title: 'Title', bodyMarkdown: 'Body', proofs: value }) });
  const result = await preview([first]);
  assert.equal(result.status, 200); assert.equal(result.body.proofs[0].html, `<p>${first.markdown}</p>`);
  assert.match(indexed, /\[\[homothetie\]\]/);
  assert.deepEqual((await preview([{ ...first, markdown: '' }])).body.proofs, []);
  assert.equal((await preview([first, first])).status, 400);
});

function actionFixture(initialProofs = []) {
  let row = { ...source, id: 42, slug: 'theoreme', translationGroupId: 'family', proofs: initialProofs,
    updatedAt: new Date('2026-11-07T12:00:00Z'), createdById: 1, translatedFromConceptId: null };
  let publish = true, proposal = null;
  const actor = { id: 2, username: 'Contributor', conceptGuideAcknowledgedAt: new Date() };
  const legacy = snapshots.buildConceptRevisionSnapshot(row); delete legacy.proofs;
  const revisions = [{ id: 1, markdown: row.bodyMarkdown, conceptTitle: row.title, conceptKind: row.kind, conceptSnapshot: legacy }];
  const links = [];
  const noop = async () => {};
  const db = {
    concept: {
      findUnique: async () => structuredClone(row), findMany: async () => [], findFirst: async () => null,
      update: async ({ data }) => { row = { ...row, ...data }; return structuredClone(row); }
    },
    pageRevision: {
      findFirst: async ({ where }) => where.id ? revisions.find(item => item.id === where.id) : revisions.at(-1),
      create: async ({ data }) => { const revision = { id: revisions.length + 1, ...data }; revisions.push(revision); return revision; },
      update: async ({ where, data }) => Object.assign(revisions.find(item => item.id === where.id), data)
    },
    conceptExercise: { deleteMany: noop }, notification: { updateMany: noop },
    conceptEditProposal: {
      findMany: async () => [], findFirst: async () => proposal ? { ...proposal, concept: structuredClone(row), proposer: actor } : null,
      create: async ({ data }) => { proposal = { id: 9, status: 'PENDING', ...data }; return proposal; },
      update: async ({ data }) => { proposal = { ...proposal, ...data }; return proposal; }
    }
  };
  db.$transaction = callback => callback(db);
  const modules = {
    '@prisma/client': require('@prisma/client'),
    'next/navigation': { redirect: href => { throw new Error(`REDIRECT:${href}`); } }, 'next/cache': { revalidatePath: () => {} },
    '@/lib/concept-domains': conceptDomains,
    '@/lib/db': { prisma: db }, '@/lib/auth': { requireVerifiedUser: async () => actor },
    '@/lib/concept-proofs': proofs, '@/lib/concept-revisions': snapshots, '@/lib/content-history': history,
    '@/lib/content-limits': limits, '@/lib/additional-concept-links': additionalLinks,
    '@/lib/form-feedback': feedback, '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr' },
    '@/lib/concept-edit-access': { canPublishConceptEditForConcept: async () => publish },
    '@/lib/rate-limit': { assertRateLimit: noop }, '@/lib/transaction-lock': { acquireTransactionLock: noop },
    '@/lib/permissions': { canProposeConceptEdit: () => true, canUseAdminTools: () => true, canRollbackConcept: () => true },
    '@/lib/languages': { editableContentLanguage: value => value },
    '@/lib/domains': { parseDomainCode: value => value, coarseDomainForCode: () => 'ALGEBRA' },
    '@/lib/concept-kinds': { parseConceptKind: value => value },
    '@/lib/concept-exercises': { parseConceptExerciseIds: () => [] },
    '@/lib/concept-metadata': { parseAliases: () => [], parseReferences: () => [], syncConceptAliases: noop, syncConceptReferences: noop },
    '@/lib/concept-citations': citations,
    '@/lib/problem-citations': { mergeProblemCitations: () => ({ conflict: false }), translatedProblemCitations: () => [] },
    '@/lib/concept-citations-db': { validateConceptCitations: noop, syncConceptCitations: noop },
    '@/lib/citation-draft-receipt': { acknowledgeCitationDraft: noop },
    '@/lib/markdown': { renderMarkdown: async value => value },
    '@/lib/content-slug': { renamedContentSlug: async (_, __, concept) => concept.slug },
    '@/lib/internal-links': { syncInternalLinks: async (_, __, text) => links.push(text), refreshLinksForConcept: noop, refreshLinksForConceptId: noop },
    '@/lib/daily-concept-reviews': { completeDailyConceptReviewForUser: noop },
    '@/lib/translation-properties': { conceptTranslationSharedChanges: () => [] },
    '@/lib/user-display': { displayNameForUser: () => 'Contributor' },
    '@/lib/notifications': { notifyOwnerOfSiteActivity: noop, notifyConceptAuthor: noop, notifyAdminsOfConceptEditProposal: noop, createNotification: noop },
    '@/lib/translation-routing': { contentLanguageViewHref: (prefix, slug) => `${prefix}/${slug}` }
  };
  const code = ts.transpileModule(readFileSync('lib/actions/concept-actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const actions = {};
  new Function('exports', 'require', code)(actions, name => modules[name] ?? {});
  const form = value => {
    const data = new FormData();
    Object.entries({ title: row.title, bodyMarkdown: row.bodyMarkdown, language: 'fr', domain: row.domainCode,
      kind: row.kind, baseUpdatedAt: row.updatedAt.toISOString(), canAppearInConceptBrowser: 'on' }).forEach(([key, item]) => data.set(key, item));
    if (value !== undefined) data.set('conceptProofs', JSON.stringify(value));
    return data;
  };
  return { actions, form, revisions, links, get row() { return row; }, get proposal() { return proposal; }, setPublish: value => { publish = value; } };
}

test('actual save records proofs, requests review and pins the pre-feature baseline for rollback', async () => {
  const f = actionFixture();
  await assert.rejects(f.actions.updateConceptAction(42, f.form([first])), /REDIRECT:\/concepts\//);
  assert.deepEqual(f.row.proofs, [first]); assert.equal(f.row.needsReviewAfterEdit, true);
  assert.deepEqual(f.revisions[0].conceptSnapshot.proofs, []);
  assert.deepEqual(f.revisions.at(-1).conceptSnapshot.proofs, [first]);
  assert.match(f.links.at(-1), /\[\[homothetie\]\]/);
  await assert.rejects(f.actions.rollbackConceptRevisionAction(42, 1), /REDIRECT:\/concepts\//);
  assert.deepEqual(f.row.proofs, []);
  assert.doesNotMatch(f.links.at(-1), /homothetie/);
});

test('actual proposals keep public proofs unchanged until approval, then credit the proposer', async () => {
  const f = actionFixture(); f.setPublish(false);
  await assert.rejects(f.actions.updateConceptAction(42, f.form([first])), /REDIRECT:\/concepts\//);
  assert.deepEqual(f.row.proofs, []);
  assert.deepEqual(f.proposal.snapshot.proofs, [first]);
  f.setPublish(true);
  await assert.rejects(f.actions.approveConceptEditProposalAction(9), /REDIRECT:\/concepts\//);
  assert.deepEqual(f.row.proofs, [first]);
  assert.equal(f.proposal.status, 'APPROVED');
  assert.equal(f.revisions.at(-1).editedById, f.proposal.proposerId);
});

test('an older form preserves proofs, while an outdated proof proposal is blocked', async () => {
  const f = actionFixture([first]);
  await assert.rejects(f.actions.updateConceptAction(42, f.form()), /REDIRECT:\/concepts\//);
  assert.deepEqual(f.row.proofs, [first]);
  f.setPublish(false);
  await assert.rejects(f.actions.updateConceptAction(42, f.form([second])), /REDIRECT:\/concepts\//);
  f.setPublish(true);
  await assert.rejects(f.actions.updateConceptAction(42, f.form([{ ...first, markdown: 'New public text' }])), /REDIRECT:\/concepts\//);
  await assert.rejects(f.actions.approveConceptEditProposalAction(9), /REDIRECT:\/moderation\/concept-edits\/9\?conflict=1/);
  assert.equal(f.row.proofs[0].markdown, 'New public text');
  assert.equal(f.proposal.status, 'PENDING');
});

test('migration leaves existing concepts untouched and defaults old and new concepts to no proofs', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Concept" (id SERIAL PRIMARY KEY, "bodyMarkdown" TEXT NOT NULL);
      INSERT INTO "Concept" ("bodyMarkdown") VALUES ('Existing statement');`);
    await db.exec(readFileSync('prisma/migrations/20261107120000_concept_proofs/migration.sql', 'utf8'));
    await db.exec(`INSERT INTO "Concept" ("bodyMarkdown") VALUES ('New statement');`);
    assert.deepEqual((await db.query('SELECT "bodyMarkdown", proofs FROM "Concept" ORDER BY id')).rows,
      [{ bodyMarkdown: 'Existing statement', proofs: [] }, { bodyMarkdown: 'New statement', proofs: [] }]);
    await db.query('UPDATE "Concept" SET proofs = $1 WHERE id = 1', [JSON.stringify([first, second])]);
    assert.deepEqual((await db.query('SELECT proofs FROM "Concept" WHERE id = 1')).rows[0].proofs, [first, second]);
  } finally { await db.close(); }
});
