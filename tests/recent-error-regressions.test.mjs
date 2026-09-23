import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as wikilinks from '../lib/wikilinks.ts';
import * as feedback from '../lib/form-feedback.ts';
import * as limits from '../lib/content-limits.ts';
import * as permissions from '../lib/permissions.ts';
import * as languages from '../lib/languages.ts';
import * as aliases from '../lib/concept-aliases.ts';
import * as titleGuard from '../lib/translation-title-guard.ts';
import * as contests from '../lib/problem-contests.ts';
import * as solutionVisibility from '../lib/problem-solution-visibility.ts';

const require = createRequire(import.meta.url);
const redirectError = new Error('NEXT_REDIRECT');
function load(file, overrides = {}) {
  const modules = {
    '@prisma/client': require('@prisma/client'), 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/wikilinks': wikilinks, '@/lib/form-feedback': feedback,
    '@/lib/content-limits': limits, '@/lib/permissions': permissions, '@/lib/languages': languages,
    '@/lib/problem-contests': contests,
    '@/lib/auth': { requireVerifiedUser: async () => ({ id: 1, role: 'OWNER' }), requireModerator: async () => ({ id: 1 }) },
    '@/lib/rate-limit': { assertRateLimit: async () => {}, isRateLimitError: e => e?.name === 'RateLimitError' },
    '@/lib/transaction-lock': { acquireTransactionLock: async () => {} },
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr' },
    '@/lib/citation-draft-receipt': { acknowledgeCitationDraft: async () => {} },
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect() { throw redirectError; } },
    ...overrides
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { exports, require: n => modules[n] ?? {}, Date, FormData });
  return exports;
}

test('edit summaries accept 240 trimmed characters and reject excess inline for all three editors', async () => {
  assert.equal(feedback.parseEditSummary('  ' + 'x'.repeat(240) + '  '), 'x'.repeat(240));
  assert.equal(feedback.parseEditSummary(null), '');
  assert.throws(() => feedback.parseEditSummary('x'.repeat(241)), feedback.EditSummaryValidationError);
  const db = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  const overrides = { '@/lib/db': { prisma: db } };
  const concept = load('lib/actions/concept-actions.ts', overrides);
  const problem = load('lib/actions/problem-actions.ts', overrides);
  const proof = load('lib/actions/proof-actions.ts', overrides);
  const data = new FormData(); data.set('editSummary', 'x'.repeat(241)); data.set('bodyMarkdown', 'Valid solution');
  for (const locale of ['fr', 'en']) {
    assert.match((await concept.updateConceptFormAction(1, locale, { error: '' }, data)).error, /240/);
    assert.match((await proof.updateProofFormAction(1, 'test', locale, { error: '' }, data)).error, /240/);
  }
  const result = await problem.updateProblemAction(1, { status: 'idle' }, data);
  assert.equal(result.status, 'invalid'); assert.match(result.error, /240/);
  assert.equal(data.get('editSummary').length, 241);
});

test('solution edits persist the optional reason atomically, skip no-ops and retain permission checks', async () => {
  let writes = 0, current = { id: 8, authorId: 1, translatedById: null, language: 'fr', bodyMarkdown: 'Before', problem: { slug: 'test', language: 'fr' } };
  const revisions = [], links = [];
  const db = {
    problemProof: { findUnique: async () => current, update: async ({ data }) => { writes++; current = { ...current, ...data }; } },
    pageRevision: { create: async ({ data }) => { revisions.push(data); } }
  };
  let inTransaction = false;
  db.$transaction = async callback => { inTransaction = true; try { return await callback(db); } finally { inTransaction = false; } };
  const actions = load('lib/actions/proof-actions.ts', {
    '@/lib/db': { prisma: db }, '@/lib/markdown': { renderMarkdown: async text => text },
    '@/lib/internal-links': { syncInternalLinks: async (...args) => { assert.equal(inTransaction, true); links.push(args); } },
    '@/lib/translation-routing': { contentLanguageViewHref: () => '/problems/test' },
    '@/lib/permissions': { ...permissions, canEditSolution: (user, proof) => user.id === proof.authorId }
  });
  const data = new FormData(); data.set('bodyMarkdown', 'After'); data.set('language', 'fr'); data.set('editSummary', '  Fixed a sign  ');
  await assert.rejects(actions.updateProofFormAction(8, 'test', 'fr', { error: '' }, data), e => e === redirectError);
  assert.equal(writes, 1); assert.equal(revisions.length, 1); assert.equal(links.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(revisions[0])), { pageType: 'PROOF', pageId: 8, markdown: 'After', editedById: 1, editSummary: 'Fixed a sign' });
  await assert.rejects(actions.updateProofFormAction(8, 'test', 'fr', { error: '' }, data), e => e === redirectError);
  assert.equal(revisions.length, 1, 'unchanged text and language do not create phantom edits');
  data.set('bodyMarkdown', 'Another edit'); data.delete('editSummary');
  await assert.rejects(actions.updateProofFormAction(8, 'test', 'fr', { error: '' }, data), e => e === redirectError);
  assert.equal(revisions[1].editSummary, null);
  current.authorId = 9;
  await assert.rejects(actions.updateProofFormAction(8, 'test', 'fr', { error: '' }, data), /cannot edit/);
  assert.equal(writes, 2);
  for (const body of ['', 'x'.repeat(60001)]) {
    data.set('bodyMarkdown', body);
    assert.ok((await actions.updateProofFormAction(8, 'test', 'fr', { error: '' }, data)).error);
  }
  assert.equal(writes, 2);
});

test('solution edit reasons are loaded only after the solution visibility check and excluded from the public feed', async () => {
  let reads = 0;
  const notFoundError = new Error('NOT_FOUND');
  const proof = { id: 8, language: 'fr', authorId: 1, translatedById: null,
    author: { username: 'author', profileSlug: 'author' }, comments: [], bodyMarkdown: 'A proof',
    problem: { id: 4, slug: 'test', title: 'Problem', status: 'PUBLISHED', verificationMode: 'SELF_CHECK' } };
  const shared = {
    '@/lib/auth': { getCurrentUser: async () => null },
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr', getTranslations: async () => ({ problemDetail: {}, nav: {}, translations: {} }) }
  };
  const page = load('app/problems/[slug]/proofs/[proofId]/discussion/page.tsx', {
    ...shared,
    'next/navigation': { notFound() { throw notFoundError; } },
    '@/lib/content-slug-redirect': { redirectHistoricalContentSlug: async () => {} },
    '@/lib/problem-visibility': { canViewProblem: () => true },
    '@/lib/problem-solution-visibility': solutionVisibility,
    '@/lib/server-time-zone': { getRequestTimeZone: async () => 'Europe/Paris' },
    '@/lib/translated-markdown': { renderMarkdownCollectionForContentLanguage: async () => ['A proof'] },
    '@/lib/db': { prisma: { problemProof: { findFirst: async () => proof }, pageRevision: { findMany: async query => {
      reads++; assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { pageType: 'PROOF', pageId: 8 });
      return [{ id: 1, editSummary: 'The answer is 42', editedBy: null, createdAt: new Date('2026-09-23') }];
    } } } }
  }).default;
  const params = Promise.resolve({ slug: 'test', proofId: '8' });
  await assert.rejects(page({ params }), e => e === notFoundError);
  assert.equal(reads, 0, 'no edit reasons queried for a locked solution');
  proof.problem.verificationMode = 'NONE';
  const rendered = await page({ params });
  assert.equal(reads, 1); assert.match(JSON.stringify(rendered), /The answer is 42/);
  const done = new Error('QUERY_CAPTURED');
  let where;
  const recent = load('app/recent-changes/page.tsx', { ...shared,
    '@/lib/db': { prisma: { pageRevision: { findMany: async query => { where = query.where; throw done; } } } }
  }).default;
  await assert.rejects(recent(), e => e === done);
  assert.deepEqual([...where.pageType.in], ['CONCEPT', 'PROBLEM']);
});

test('aliases, redirects and translations deduplicate after resolution while preserving distinct labels and missing targets', async () => {
  const fr = { id: 1, slug: 'nombre-premier', language: 'fr', translationGroupId: 'primes' };
  const en = { id: 2, slug: 'prime-number', language: 'en', translationGroupId: 'primes' };
  const rows = [];
  const db = {
    concept: { findMany: async ({ where }) => {
      const slug = where.OR[0].slug;
      return slug === 'prime-number' ? [en] : ['nombre-premier', 'premier'].includes(slug) ? [fr] : [];
    }, findFirst: async () => fr },
    conceptRedirect: { findUnique: async ({ where }) => where.sourceSlug === 'old-prime' ? { targetConcept: fr } : null },
    internalLink: { deleteMany: async () => { rows.length = 0; }, create: async ({ data }) => {
      assert.ok(!rows.some(row => row.targetSlug === data.targetSlug && row.label === data.label), 'Duplicate resolved link');
      rows.push(data);
    } }
  };
  const { syncInternalLinks } = load('lib/internal-links.ts', { '@/lib/db': { prisma: db } });
  const source = '[[nombre-premier|premier]] [[premier|premier]] [[prime-number|premier]] [[old-prime|premier]] [[nombre-premier|autre libellé]] [[missing|inconnu]]';
  for (const kind of ['CONCEPT', 'PROBLEM', 'PROOF']) {
    await syncInternalLinks(kind, 7, source, db, 'fr');
    assert.deepEqual(rows.map(r => [r.targetSlug, r.label, r.exists]), [
      ['nombre-premier', 'premier', true], ['nombre-premier', 'autre libellé', true], ['missing', 'inconnu', false]
    ]);
    await syncInternalLinks(kind, 7, source, db, 'fr');
    assert.equal(rows.length, 3);
  }
});

test('empty and overlong solutions return localized errors without database writes', async () => {
  const db = new Proxy({}, { get() { throw new Error('Unexpected database write'); } });
  const { createProofFormAction } = load('lib/actions/proof-actions.ts', { '@/lib/db': { prisma: db } });
  for (const locale of ['fr', 'en']) for (const body of ['', ' \n ', 'x'.repeat(60001)]) {
    const data = new FormData(); data.set('bodyMarkdown', body); data.set('language', 'fr');
    const result = await createProofFormAction(1, 'test', locale, { error: '' }, data);
    assert.match(result.error, body.length > 60000 ? /60[ ,]000/ : locale === 'fr' ? /Écrivez votre solution/ : /Write your solution/);
    assert.equal(data.get('bodyMarkdown'), body);
  }
});

test('proof form retains authentication and success redirects and does not hide unexpected failures', async () => {
  const data = new FormData(); data.set('bodyMarkdown', 'A valid proof'); data.set('language', 'fr');
  const anonymous = load('lib/actions/proof-actions.ts', { '@/lib/auth': { requireVerifiedUser: async () => { throw redirectError; } } });
  await assert.rejects(anonymous.createProofFormAction(1, 'test', 'fr', { error: '' }, data), e => e === redirectError);
  let written;
  const db = { problem: { findUnique: async () => ({ slug: 'test', language: 'fr' }) }, problemProof: { create: async ({ data }) => { written = data; return { id: 1 }; } } };
  db.$transaction = async callback => callback(db);
  const action = load('lib/actions/proof-actions.ts', {
    '@/lib/db': { prisma: db }, '@/lib/markdown': { renderMarkdown: async text => text },
    '@/lib/internal-links': { syncInternalLinks: async () => {} },
    '@/lib/achievements': { checkProofAchievements: async () => {} },
    '@/lib/notifications': { notifyProblemAuthor: async () => {} },
    '@/lib/user-display': { displayNameForUser: () => 'Author' },
    '@/lib/translation-routing': { contentLanguageViewHref: () => '/problems/test' }
  });
  await assert.rejects(action.createProofFormAction(1, 'test', 'fr', { error: '' }, data), e => e === redirectError);
  assert.equal(written.bodyMarkdown, 'A valid proof');
  db.problem.findUnique = async () => { throw new Error('Unexpected database failure'); };
  await assert.rejects(action.createProofFormAction(1, 'test', 'fr', { error: '' }, data), /Unexpected database failure/);
});

test('review status guard and stale-form feedback agree; no invalid review is written', async () => {
  for (const status of ['STUB', 'MISSING', 'CONTROVERSIAL', 'USABLE', 'REVIEWED', 'EXCELLENT']) {
    assert.equal(feedback.conceptStatusAllowsReview(status), ['USABLE', 'REVIEWED', 'EXCELLENT'].includes(status));
    if (feedback.conceptStatusAllowsReview(status)) continue;
    const db = { concept: { findUnique: async () => ({ id: 7, translationGroupId: 'family', status, createdById: 2, needsReviewAfterEdit: true }) } };
    db.$transaction = async callback => callback(db);
    const { markConceptReviewedFormAction } = load('lib/actions/concept-actions.ts', { '@/lib/db': { prisma: db } });
    for (const locale of ['fr', 'en']) {
      const result = await markConceptReviewedFormAction(7, locale, { error: '' }, new FormData());
      assert.match(result.error, locale === 'fr' ? /d’abord être marqué comme utilisable/ : /first be marked usable/);
    }
  }
});

test('recent users page marks notifications read without revalidating during rendering', async () => {
  let marked = false;
  const { default: page } = load('app/users/recent/page.tsx', {
    '@/lib/db': { prisma: { user: { findMany: async () => [] } } },
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr', getTranslations: async () => ({ users: { recentRegistrations: { count: () => '', joined: x => x } } }) },
    '@/lib/server-time-zone': { getRequestTimeZone: async () => 'Europe/Paris' },
    '@/lib/user-registration-summary': { RECENT_USER_REGISTRATION_DAYS: 7, USER_REGISTRATION_SUMMARY_HREF: '/users/recent' },
    '@/lib/notification-lifecycle': { markNotificationsReadForHref: async (_userId, _href, _type, options) => { assert.ok(!options?.revalidate); marked = true; } }
  });
  await page();
  assert.equal(marked, true);
});

test('alias namespace conflicts are recoverable validation errors and never replace existing aliases', async () => {
  for (const conflict of ['canonical', 'redirect', 'alias']) {
    let writes = 0;
    const db = {
      concept: { findUnique: async () => ({ slug: 'new-concept' }), findFirst: async () => conflict === 'canonical' ? { title: 'Sphere' } : null },
      conceptRedirect: { findFirst: async () => conflict === 'redirect' ? { sourceTitle: 'Sphere' } : null },
      conceptAlias: {
        findFirst: async () => conflict === 'alias' ? { alias: 'sphere', concept: { title: 'Sphere' } } : null,
        deleteMany: async () => { writes++; }, createMany: async () => { writes++; }
      }
    };
    const { syncConceptAliases } = load('lib/concept-metadata.ts', { '@/lib/db': { prisma: db }, '@/lib/concept-aliases': aliases });
    await assert.rejects(syncConceptAliases(7, aliases.parseAliases('sphere'), db), error => {
      assert.ok(error instanceof feedback.ConceptAliasConflictError);
      assert.equal(error.conceptTitle, 'Sphere');
      return true;
    });
    assert.equal(writes, 0);
  }
});

test('concept creation and editing explain alias conflicts in both languages while preserving redirects and unexpected failures', async () => {
  for (const locale of ['fr', 'en']) {
    let failure = new feedback.ConceptAliasConflictError('Sphere');
    const db = { $transaction: async () => { throw failure; }, concept: { findUnique: async () => { throw failure; } } };
    const actions = load('lib/actions/concept-actions.ts', {
      '@/lib/db': { prisma: db }, '@/lib/auth': { requireVerifiedUser: async () => ({ id: 1, role: 'OWNER', conceptGuideAcknowledgedAt: new Date() }) },
      '@/lib/i18n/server': { getInterfaceLocale: async () => locale },
      '@/lib/creation-submission': { creationSubmissionKey: () => null },
      '@/lib/concept-kinds': { parseConceptKind: () => 'DEFINITION' },
      '@/lib/domains': { parseDomainCode: () => 'GEOMETRY', coarseDomainForCode: () => 'GEOMETRY' },
      '@/lib/concept-metadata': { ...aliases, parseReferences: () => [] },
      '@/lib/concept-citations': { submittedConceptCitations: () => null },
      '@/lib/translation-link-warning': { translationLinkOverrideRequested: () => false },
      '@/lib/translation-title-guard': titleGuard,
      '@/lib/internal-links': { TranslationWikiLinksPreservedError: class extends Error {} },
      '@/lib/slug': { ensureSlug: value => value }, '@/lib/markdown': { renderMarkdown: async value => value }
    });
    const data = new FormData(); data.set('title', 'A new concept'); data.set('aliases', 'Sphere'); data.set('language', 'fr'); data.set('bodyMarkdown', 'Keep my $x^2$ draft.');
    const created = await actions.createConceptFormAction({ error: null }, data);
    assert.equal(created.errorKind, 'alias-conflict');
    const edited = await actions.updateConceptFormAction(7, locale, { error: '' }, data);
    for (const result of [created, edited]) {
      assert.match(result.error, /Sphere/);
      assert.match(result.error, locale === 'fr' ? /Retirez ou modifiez/ : /Remove or change/);
    }
    assert.equal(data.get('aliases'), 'Sphere'); assert.equal(data.get('bodyMarkdown'), 'Keep my $x^2$ draft.');
    for (const error of [redirectError, new Error('Database unavailable')]) {
      failure = error;
      await assert.rejects(actions.createConceptFormAction({ error: null }, data), e => e === error);
      await assert.rejects(actions.updateConceptFormAction(7, locale, { error: '' }, data), e => e === error);
    }
  }
});
