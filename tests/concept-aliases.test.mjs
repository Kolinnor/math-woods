import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as translations from '../lib/translation-routing.ts';
import * as languages from '../lib/languages.ts';
import * as ranking from '../lib/search-ranking.ts';
import * as slug from '../lib/slug.ts';
import * as aliases from '../lib/concept-aliases.ts';
import * as feedback from '../lib/form-feedback.ts';
const require = createRequire(import.meta.url);

function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { exports, URL, Request, Response, require: name => {
    if (name in modules) return modules[name];
    throw new Error(`Missing module ${name}`);
  } });
  return exports;
}

function matches(row, where) {
  return Object.entries(where ?? {}).every(([key, value]) => {
    if (key === 'OR') return value.some(filter => matches(row, filter));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.some(v => value.mode === 'insensitive' ? v.toLowerCase() === row[key]?.toLowerCase() : v === row[key]);
      if ('not' in value) return row[key] !== value.not;
      if ('contains' in value) return row[key]?.toLowerCase().includes(value.contains.toLowerCase());
      if ('equals' in value) return row[key]?.toLowerCase() === value.equals.toLowerCase();
      if ('some' in value) return row[key].some(item => matches(item, value.some));
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}

function fixture() {
  const concepts = [
    { id: 1, title: 'Prime number', slug: 'prime-number', language: 'en', translationGroupId: 'prime', translatedFromConceptId: null, aliases: [{ alias: 'Premier', aliasSlug: 'premier' }] },
    { id: 2, title: 'Nombre premier', slug: 'nombre-premier', language: 'fr', translationGroupId: 'prime', translatedFromConceptId: 1, aliases: [] },
    { id: 3, title: 'Premiers résultats', slug: 'premiers-resultats', language: 'fr', translationGroupId: 'other', translatedFromConceptId: null, aliases: [] }
  ];
  const aliasRows = () => concepts.flatMap(concept => concept.aliases.map(alias => ({ ...alias, conceptId: concept.id, concept })));
  let locks = 0;
  const db = {
    concept: {
      findUnique: async ({where}) => concepts.find(concept => matches(concept, where)),
      findFirst: async ({where}) => concepts.find(concept => matches(concept, where)) ?? null,
      findMany: async ({where, take}) => concepts.filter(concept => matches(concept, where)).slice(0, take)
    },
    conceptRedirect: { findFirst: async () => null },
    conceptAlias: {
      findFirst: async ({where}) => aliasRows().find(alias => matches(alias, where)) ?? null,
      findMany: async ({where}) => aliasRows().filter(alias => matches(alias, where)),
      deleteMany: async ({where}) => { concepts.find(c => c.id === where.conceptId).aliases = []; },
      createMany: async ({data}) => { for (const row of data) concepts.find(c => c.id === row.conceptId).aliases.push({alias: row.alias, aliasSlug: row.aliasSlug}); }
    }
  };
  const modules = {
    '@/lib/db': { prisma: db }, '@/lib/languages': languages, '@/lib/translation-routing': translations,
    '@prisma/client': require('@prisma/client'), '@/lib/concept-aliases': aliases, '@/lib/form-feedback': feedback,
    '@/lib/transaction-lock': { acquireTransactionLock: async (_tx, key) => { assert.equal(key, 'content-slugs:concept'); locks++; } }
  };
  const search = load('lib/concept-alias-search.ts', modules);
  const metadata = load('lib/concept-metadata.ts', modules);
  function suggestions(language) {
    return load('app/api/concepts/suggest/route.ts', { ...modules,
      'next/server': { NextResponse: Response }, '@/lib/server-language': { getPreferredContentLanguage: async () => language },
      '@/lib/search-ranking': ranking, '@/lib/slug': slug, '@/lib/markdown': { renderInlineMarkdown: async value => value },
      '@/lib/concept-alias-search': search
    }).GET;
  }
  return {concepts, db, search, metadata, suggestions, get locks() { return locks; }};
}

test('same alias can be saved on both translations, edited and removed independently', async () => {
  const f = fixture();
  await f.metadata.syncConceptAliases(2, aliases.parseAliases('Premier'), f.db);
  assert.equal(f.concepts[0].aliases.length, 1);
  assert.equal(f.concepts[1].aliases.length, 1);
  await f.metadata.syncConceptAliases(2, aliases.parseAliases('Premier, Nombre primaire'), f.db);
  assert.equal(f.concepts[1].aliases.length, 2);
  await f.metadata.syncConceptAliases(2, [], f.db);
  assert.equal(f.concepts[1].aliases.length, 0);
  assert.equal(f.concepts[0].aliases.length, 1);
  assert.equal(f.locks, 3);
});

test('unrelated aliases, canonical slugs and historical slugs stay reserved without erasing drafts', async () => {
  for (const conflict of ['alias', 'canonical', 'redirect']) {
    const f = fixture();
    if (conflict === 'canonical') f.concepts[0].slug = 'premier';
    if (conflict === 'redirect') f.db.conceptRedirect.findFirst = async () => ({sourceTitle: 'Old concept'});
    f.concepts[2].aliases = [{alias: 'Existing alias', aliasSlug: 'existing-alias'}];
    await assert.rejects(f.metadata.syncConceptAliases(3, aliases.parseAliases('Premier'), f.db), feedback.ConceptAliasConflictError);
    assert.equal(f.concepts[2].aliases[0].alias, 'Existing alias');
  }
});

test('an alias may also name a canonical or historical URL of its own translation family', async () => {
  const f = fixture();
  await f.metadata.syncConceptAliases(2, aliases.parseAliases('Prime number'), f.db);
  assert.equal(f.concepts[1].aliases[0].aliasSlug, 'prime-number');
  f.db.conceptRedirect.findFirst = async ({where}) => {
    const historical = {targetConceptId:1,sourceSlug:'old-prime',targetConcept:f.concepts[0]};
    return matches(historical,where)?historical:null;
  };
  await f.metadata.syncConceptAliases(2, aliases.parseAliases('Old prime'), f.db);
  assert.equal(f.concepts[1].aliases[0].aliasSlug, 'old-prime');
  await assert.rejects(f.metadata.syncConceptAliases(3, aliases.parseAliases('Old prime'), f.db),feedback.ConceptAliasConflictError);
});

test('alias URLs choose the preferred sibling even when only English owns the alias, then fall back', async () => {
  const f = fixture();
  assert.equal((await f.search.resolveConceptAlias('premier', 'fr')).slug, 'nombre-premier');
  assert.equal((await f.search.resolveConceptAlias('premier', 'en')).slug, 'prime-number');
  assert.equal(await f.search.resolveConceptAlias('missing', 'fr'), null);
  f.concepts.splice(1, 1);
  assert.equal((await f.search.resolveConceptAlias('premier', 'fr')).slug, 'prime-number');
});

test('real suggestion route finds and ranks preferred translations through an English-only alias', async () => {
  const f = fixture();
  for (const language of ['fr', 'en']) {
    const result = await (await f.suggestions(language)(new Request('https://example.test/api/concepts/suggest?q=Premier'))).json();
    const family = result.concepts.filter(row => ['prime-number', 'nombre-premier'].includes(row.slug));
    assert.equal(family.length, 1);
    assert.equal(result.concepts[0].slug, language === 'fr' ? 'nombre-premier' : 'prime-number');
    assert.ok(result.concepts[0].aliases.includes('Premier'), 'alias keeps its exact-match priority');
  }
  await f.metadata.syncConceptAliases(2, aliases.parseAliases('Premier'), f.db);
  const result = await (await f.suggestions('fr')(new Request('https://example.test/api/concepts/suggest?q=premier&all=1'))).json();
  assert.equal(result.concepts.filter(row => ['prime-number', 'nombre-premier'].includes(row.slug)).length, 2);
});

test('alias searches support partial and case-insensitive matches without matching inactive translations', async () => {
  const f = fixture();
  assert.deepEqual([...(await f.search.matchingConceptAliasGroups(['PREM'])).keys()], ['prime']);
  assert.equal((await f.search.matchingConceptAliasGroups(['PREM'], true)).size, 0);
  f.concepts[0].language = 'zz';
  assert.equal((await f.search.matchingConceptAliasGroups(['Premier'])).size, 0);
});
