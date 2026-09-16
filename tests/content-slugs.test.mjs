import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as slug from '../lib/slug.ts';
import * as languages from '../lib/languages.ts';
import * as translations from '../lib/translation-routing.ts';
import * as wiki from '../lib/wikilinks.ts';
import { renderInlineMarkdown, renderMarkdown } from '../lib/markdown.ts';

function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, require: name => {
    if (!(name in modules)) throw Error(`Missing dependency ${name}`);
    return modules[name];
  }});
  return exports;
}
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(w => matches(row, w))
    : typeof value === 'object' && value !== null ? ('not' in value ? row[key] !== value.not : value.in.includes(row[key])) : row[key] === value);
}
function table(rows = []) {
  return { rows,
    async findFirst({ where }) { return rows.find(row => matches(row, where)) ?? null; },
    async findUnique({ where }) { return rows.find(row => matches(row, where)) ?? null; },
    async deleteMany({ where }) { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1); },
    async upsert({ where, create, update }) { const row = rows.find(row => matches(row, where)); if (row) Object.assign(row, update); else rows.push({ id: rows.length + 1, ...create }); }
  };
}
function fixture(type) {
  const current = { id: 7, title: 'Test', slug: 'test', language: 'fr', translationGroupId: 'g' };
  const locks = [], writes = [];
  const tx = { concept: table(type === 'concept' ? [current] : []), problem: table(type === 'problem' ? [current] : []), conceptAlias: table(), conceptRedirect: table(), problemRedirect: table(),
    $executeRaw: async (...args) => { writes.push(args); }, internalLink: { updateMany: async args => writes.push(args) }
  };
  const helpers = load('lib/content-slug.ts', { '@/lib/slug': slug, '@/lib/transaction-lock': { acquireTransactionLock: async (_, key) => locks.push(key) } });
  const rename = async title => { current.slug = await helpers.renamedContentSlug(tx, type, { ...current }, title, 3); current.title = title; return current.slug; };
  return { tx, current, locks, writes, rename, ...helpers };
}

for (const type of ['concept', 'problem']) {
  test(`${type}: successive title edits, restoration and reserved old URLs keep the same page identity`, async () => {
    const f = fixture(type), redirects = type === 'concept' ? f.tx.conceptRedirect : f.tx.problemRedirect;
    assert.equal(await f.rename('Test modifié'), 'test-modifie');
    assert.equal(redirects.rows[0].sourceSlug, 'test');
    assert.equal(redirects.rows[0][type === 'concept' ? 'targetConceptId' : 'targetProblemId'], 7);
    assert.equal(await f.rename('Troisième titre'), 'troisieme-titre');
    assert.deepEqual(redirects.rows.map(row => row.sourceSlug), ['test', 'test-modifie']);
    assert.equal(await f.availableContentSlug(f.tx, type, 'Test'), 'test-2', 'new pages cannot steal historical URLs');
    assert.equal(await f.rename('Test'), 'test');
    assert.deepEqual(redirects.rows.map(row => row.sourceSlug), ['test-modifie', 'troisieme-titre']);
    assert.ok(f.locks.every(key => key === `content-slugs:${type}`));
    if (type === 'concept') { assert.ok(redirects.rows.every(row => row.isRename)); assert.equal(f.writes.length, 6); }
  });
  test(`${type}: collisions, accents, unchanged titles and language suffixes`, async () => {
    const f = fixture(type);
    f.tx[type].rows.push({ id: 8, title: 'Éléments', slug: 'elements' });
    assert.equal(await f.rename('Éléments'), 'elements-2');
    assert.equal(await f.rename('Éléments'), 'elements-2');
    assert.equal(await f.rename('ÉLÉMENTS !'), 'elements-2');
    assert.equal(await f.availableContentSlug(f.tx, type, 'Éléments', undefined, 'en'), 'elements-en');
    assert.equal(f.current.id, 7);
  });
}

test('concept aliases and merged histories remain reserved during renaming', async () => {
  const f = fixture('concept');
  f.tx.conceptAlias.rows.push({ id: 1, aliasSlug: 'reserve', conceptId: 8 });
  assert.equal(await f.rename('Réservé'), 'reserve-2');
  f.tx.conceptAlias.rows.push({ id: 2, aliasSlug: 'mon-alias', conceptId: 7 });
  assert.equal(await f.rename('Mon alias'), 'mon-alias');
  f.tx.conceptRedirect.rows.push({ id: 20, sourceSlug: 'fusion', targetConceptId: 7, isRename: false });
  assert.equal(await f.rename('Fusion'), 'fusion-2');
  assert.ok(f.tx.conceptRedirect.rows.some(row => row.sourceSlug === 'fusion' && !row.isRename));
});

test('historical routes preserve discussion/proof paths and query parameters without permanent redirect loops', async () => {
  let path = '/problems/test/proofs/12/discussion?viewLanguage=fr&sort=oldest';
  const db = { problemRedirect: { findUnique: async () => ({ targetProblem: { slug: 'test-modifie' } }) }, conceptRedirect: { findUnique: async ({ where }) => {
    assert.equal(where.isRename, true); return { targetConcept: { slug: 'test-modifie' } };
  } } };
  const helper = load('lib/content-slug-redirect.ts', {
    '@/lib/db': { prisma: db }, '@/lib/auth-return': { AUTH_RETURN_TO_HEADER: 'return-to' },
    'next/headers': { headers: async () => new Headers({ 'return-to': path }) },
    'next/navigation': { redirect: href => { throw Error(href); } }
  });
  await assert.rejects(helper.redirectHistoricalContentSlug('problem', 'test'), { message: '/problems/test-modifie/proofs/12/discussion?viewLanguage=fr&sort=oldest' });
  await assert.rejects(helper.redirectHistoricalContentSlug('concept', 'test', 'http://localhost/concepts/test/export?format=bibtex'), { message: '/concepts/test-modifie/export?format=bibtex' });
  assert.equal(helper.renamedContentHref('problem', 'test', 'nouveau', '//evil.example'), '/problems/nouveau');
  db.problemRedirect.findUnique = async () => ({ targetProblem: { slug: 'test' } });
  assert.equal(await helper.redirectHistoricalContentSlug('problem', 'test'), undefined);
});

test('the editor resolves current titles and URLs while retaining publication restrictions', async () => {
  const concept = { title: 'Test modifié $x$', slug: 'test-modifie-x', language: 'fr', aliases: [{ alias: 'Autre nom' }] };
  let published = true;
  const db = { concept: { findUnique: async () => null, findFirst: async () => null }, conceptRedirect: { findUnique: async () => ({ targetConcept: concept }) },
    problemRedirect: { findUnique: async () => ({ targetProblemId: 7 }) }, problem: { findFirst: async ({ where }) => {
      assert.equal(where.id, 7); assert.equal(where.status, 'PUBLISHED'); assert.equal(where.listed, true);
      return published ? { title: 'Nouveau problème', slug: 'nouveau-probleme', language: 'fr' } : null;
    } }
  };
  const helper = load('lib/editor-link-target.ts', { '@/lib/db': { prisma: db }, '@/lib/slug': slug, '@/lib/markdown': { renderInlineMarkdown } });
  const result = await helper.resolveEditorLinkTarget('concept', 'test');
  assert.equal(result.slug, concept.slug); assert.equal(result.title, concept.title); assert.match(result.titleHtml, /katex/);
  assert.equal((await helper.resolveEditorLinkTarget('problem', 'test')).slug, 'nouveau-probleme');
  published = false; assert.equal(await helper.resolveEditorLinkTarget('problem', 'test'), null);
  assert.equal(await helper.resolveEditorLinkTarget('unknown', 'test'), null);
});

test('old wiki links render as existing concepts and use their current canonical URL', async () => {
  const db = { concept: { findMany: async ({ where }) => {
    if (where.OR) {
      assert.ok(where.OR.some(filter => filter.mergeRedirects));
      return [{ title: 'Test modifié', slug: 'test-modifie', language: 'fr', translationGroupId: 'g', translatedFromConceptId: null, aliases: [], mergeRedirects: [{ sourceSlug: 'test' }] }];
    }
    return [{ title: 'Test modifié', slug: 'test-modifie', language: 'fr', translationGroupId: 'g', translatedFromConceptId: null }];
  } } };
  const helper = load('lib/translated-markdown.ts', { '@/lib/db': { prisma: db }, '@/lib/languages': languages, '@/lib/markdown': { renderMarkdown }, '@/lib/translation-routing': translations, '@/lib/wikilinks': wiki });
  const html = await helper.renderMarkdownForContentLanguage('[[test|mon explication]]', 'fr');
  assert.match(html, /href="\/concepts\/test-modifie"/); assert.match(html, /mon explication/); assert.doesNotMatch(html, /wiki-missing/);
  assert.match(await helper.prepareMarkdownForTranslation('[[test|Test]]', 'fr'), /Test modifié/);
});
