import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as links from '../lib/additional-concept-links.ts';
import * as references from '../lib/concept-link-references.ts';
import * as history from '../lib/content-history.ts';
import * as wikilinks from '../lib/wikilinks.ts';
import * as slug from '../lib/slug.ts';
import { buildProblemRevisionSnapshot, mergeProblemRevisionSnapshots, changedProblemSnapshotFields } from '../lib/problem-revisions.ts';
import { buildConceptRevisionSnapshot, changedConceptSnapshotFields } from '../lib/concept-revisions.ts';
const require = createRequire(import.meta.url);
function load(file, modules) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => name in modules ? modules[name] : require(name), exports);
  return exports;
}
function fixture() {
  const concepts = [
    { id: 1, slug: 'integrale', title: 'Intégrale', language: 'fr', translationGroupId: 'integral', aliases: [{ aliasSlug: 'integration' }] },
    { id: 2, slug: 'integral', title: 'Integral', language: 'en', translationGroupId: 'integral', aliases: [] },
    { id: 3, slug: 'derivee', title: 'Dérivée', language: 'fr', translationGroupId: 'derivative', aliases: [] },
    { id: 9, slug: 'page', title: 'Page', language: 'fr', translationGroupId: 'self', aliases: [] }
  ];
  const redirects = [{ sourceSlug: 'ancien-nom', targetConcept: concepts[0] }];
  const writes = [], updates = [];
  const db = {
    concept: {
      findMany: async ({ where }) => where.translationGroupId
        ? concepts.filter(row => (where.translationGroupId.in ?? [where.translationGroupId]).includes(row.translationGroupId) && (!where.language || row.language === where.language))
        : concepts.filter(row => where.OR.some(filter =>
          filter.slug && (filter.slug.in ?? [filter.slug]).includes(row.slug) ||
          filter.title?.equals?.toLowerCase() === row.title.toLowerCase() ||
          filter.title?.in?.some(title => title.toLowerCase() === row.title.toLowerCase()) ||
          filter.aliases && row.aliases.some(alias => (filter.aliases.some.aliasSlug.in ?? [filter.aliases.some.aliasSlug]).includes(alias.aliasSlug)))),
      findFirst: async ({ where }) => concepts.find(row => row.translationGroupId === where.translationGroupId && row.language === where.language) ?? null,
      findUnique: async () => concepts[3],
      update: async args => updates.push(args)
    },
    conceptRedirect: {
      findMany: async ({ where }) => redirects.filter(row => where.sourceSlug.in.includes(row.sourceSlug)),
      findUnique: async ({ where }) => redirects.find(row => row.sourceSlug === where.sourceSlug) ?? null
    },
    problem: { update: async args => updates.push(args) },
    internalLink: { deleteMany: async () => { writes.length = 0; }, create: async ({ data }) => writes.push(data) }
  };
  const resolver = load('lib/additional-concept-links-db.ts', { '@/lib/db': { prisma: db }, './concept-link-references.ts': references });
  const { syncInternalLinks } = load('lib/internal-links.ts', {
    '@/lib/db': { prisma: db }, '@/lib/additional-concept-links-db': resolver,
    './concept-link-references.ts': references, './content-history.ts': history,
    '@/lib/slug': slug, '@/lib/wikilinks': wikilinks
  });
  return { db, writes, updates, sync: syncInternalLinks, resolve: resolver.resolveAdditionalConceptLinks, uncited: resolver.uncitedAdditionalConceptLinks };
}

test('additional links are optional, bounded, explicit about clearing, and reject malformed input', () => {
  const form = new FormData();
  assert.deepEqual(links.submittedAdditionalConceptSlugs(form, ['integrale']), ['integrale']);
  form.set('additionalConceptSlugs', '[]'); assert.deepEqual(links.submittedAdditionalConceptSlugs(form, ['integrale']), []);
  assert.deepEqual(links.parseAdditionalConceptSlugs(['integrale', 'integrale']), ['integrale']);
  for (const value of [null, {}, ['../secret'], ['https://example.test'], [4], ['<script>'], Array(31).fill('integrale')]) assert.throws(() => links.parseAdditionalConceptSlugs(value));
});

test('manual links resolve aliases, renames and translations to one localized concept', async () => {
  const f = fixture();
  const result = await f.resolve(['integration', 'integral', 'ancien-nom', 'derivee'], 'fr');
  assert.deepEqual(result.map(row => row.slug), ['integrale', 'derivee']);
  assert.equal(result[0].title, 'Intégrale');
});

test('manual links participate in backlinks and disappear once the same concept is cited, without returning after that citation is removed', async () => {
  for (const type of ['PROBLEM', 'CONCEPT']) {
    for (const citation of ['[[integrale]]', '[[integration|intégration]]', '[[integral]]', '[[ancien-nom]]', '[intégrale](/concepts/integral)', '[intégrale](https://mathwoods.org/concepts/ancien-nom#definition)']) {
      const f = fixture();
      await f.sync(type, 9, 'Texte sans lien', f.db, 'fr', ['integrale', 'derivee']);
      assert.deepEqual(f.writes.map(row => row.targetSlug), ['integrale', 'derivee']);
      await f.sync(type, 9, citation, f.db, 'fr', ['integrale', 'derivee']);
      assert.deepEqual(f.updates.at(-1).data.additionalConceptSlugs, ['derivee']);
      assert.equal(f.writes.filter(row => row.targetSlug === 'integrale').length, 1);
      await f.sync(type, 9, 'Texte sans lien', f.db, 'fr', f.updates.at(-1).data.additionalConceptSlugs);
      assert.deepEqual(f.writes.map(row => row.targetSlug), ['derivee']);
    }
  }
});

test('self-links and deleted targets are omitted; code and hidden historical notes do not remove a public manual link', async () => {
  const f = fixture();
  await f.sync('CONCEPT', 9, 'Texte', f.db, 'fr', ['page', 'deleted', 'integrale']);
  assert.deepEqual(f.updates.at(-1).data.additionalConceptSlugs, ['integrale']);
  for (const markdown of ['`[[integrale]]`', '`[intégrale](/concepts/integrale)`', '```md\n[[integrale]]\n```', history.contentWithHistory('Texte', { historyMarkdown: '[[integrale]]', historyEnabled: false }), history.contentWithHistory('Texte', { historyMarkdown: '[[integrale]]', historyEnabled: true, historySpoiler: true })]) {
    await f.sync('CONCEPT', 9, markdown, f.db, 'fr', ['integrale']);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].label, 'Intégrale');
  }
});

test('additional links are tracked in snapshots and merge with independent concurrent edits', () => {
  const source = { title: 'A', bodyMarkdown: 'Body', additionalConceptSlugs: [], domains: [], tags: [], spoilerTags: [], relatedGroups: [], aliases: [], references: [], practiceExercises: [] };
  const before = buildProblemRevisionSnapshot(source), after = { ...before, additionalConceptSlugs: ['integrale'] };
  assert.deepEqual(changedProblemSnapshotFields(before, after), ['additionalConceptSlugs']);
  const merge = mergeProblemRevisionSnapshots(before, { ...before, title: 'B' }, after);
  assert.deepEqual(merge.conflicts, []); assert.equal(merge.merged.title, 'B'); assert.deepEqual(merge.merged.additionalConceptSlugs, ['integrale']);
  assert.deepEqual(mergeProblemRevisionSnapshots(before, { ...before, additionalConceptSlugs: ['derivee'] }, after).conflicts, ['additionalConceptSlugs']);
  const old = { ...before }; delete old.additionalConceptSlugs;
  assert.deepEqual(mergeProblemRevisionSnapshots(old, after, old).merged.additionalConceptSlugs, ['integrale']);
  const concept = buildConceptRevisionSnapshot(source);
  assert.deepEqual(changedConceptSnapshotFields(concept, { ...concept, additionalConceptSlugs: ['integrale'] }), ['additionalConceptSlugs']);
});


test('readers and previews hide real citations by title, alias, translation or Markdown reference, but keep links mentioned only in code', async () => {
  const f = fixture();
  for (const markdown of ['[[Intégrale]]', '[[integration]]', '[[integral]]', '[intégrale][i]\n\n[i]: /concepts/ancien-nom']) {
    assert.deepEqual((await f.uncited(['integrale', 'derivee'], markdown, 'fr', f.db)).map(row => row.slug), ['derivee']);
  }
  assert.deepEqual((await f.uncited(['integrale'], '`[[Intégrale]]`', 'fr', f.db)).map(row => row.slug), ['integrale']);
  assert.deepEqual(await f.uncited([], '[[Intégrale]]', 'fr', {}), []);
});
