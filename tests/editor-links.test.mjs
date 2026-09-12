import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as links from '../lib/editor-links.ts';
import * as search from '../lib/reference-search.ts';
import * as ranking from '../lib/search-ranking.ts';
import * as permissions from '../lib/permissions.ts';
import { renderInlineMarkdown } from '../lib/markdown.ts';
const require = createRequire(import.meta.url);

test('all five destinations preserve custom text and can be reopened', () => {
  for (const type of links.EDITOR_LINK_TYPES) {
    const target = { targetType: type, slug: 'elements', title: 'Éléments' };
    const markup = links.editorLinkMarkup(target, 'les Éléments $x$');
    const parsed = links.parseEditorLink(markup);
    assert.equal(parsed.targetType, type); assert.equal(parsed.target, 'elements'); assert.equal(parsed.label, 'les Éléments $x$');
    assert.ok(links.editorLinkMarkup(target, '').includes('Éléments'));
    assert.equal(links.editorLinkMarkup({ ...target, slug: '../../admin' }, 'x'), '');
  }
  assert.equal(links.parseEditorLink('[x](https://evil.example)'), null);
  assert.equal(links.parseEditorLink('[x](/library/references/../../admin)'), null);
  assert.equal(links.parseEditorLink('[[Nombre premier|nombres premiers]]').target, 'Nombre premier');
});

test('PostgreSQL global search respects access, translations, accents, publication and result limits', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href), db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Mathematician" (id INT PRIMARY KEY, slug TEXT, name TEXT, aliases TEXT[], status TEXT);
      CREATE TABLE "MathematicianTranslation" ("mathematicianId" INT, language TEXT, "displayName" TEXT);
      CREATE TABLE "HistoryMilestone" (id INT PRIMARY KEY, slug TEXT, status TEXT);
      CREATE TABLE "HistoryMilestoneTranslation" ("milestoneId" INT, title TEXT, language TEXT, "yearLabel" TEXT);
      CREATE TABLE "LibraryReference" (id INT PRIMARY KEY, slug TEXT, "canonicalTitle" TEXT, authors TEXT, publisher TEXT, year INT, doi TEXT, isbn TEXT, "citationKey" TEXT, url TEXT, edition TEXT, volume TEXT, translator TEXT, editors TEXT, journal TEXT, aliases TEXT[] DEFAULT '{}', "workId" INT, status TEXT DEFAULT 'PUBLISHED', searchable BOOLEAN DEFAULT true, "mergedIntoId" INT, "referenceType" TEXT DEFAULT 'BOOK');
      CREATE TABLE "LibraryReferenceTranslation" ("referenceId" INT, language TEXT, "displayTitle" TEXT, "descriptionMarkdown" TEXT);
      INSERT INTO "Mathematician" VALUES (1,'euclide','Euclid',ARRAY['Εὐκλείδης','Euclide'],'PUBLISHED'),(2,'euclide-private','Euclide privé','{}','DRAFT');
      INSERT INTO "MathematicianTranslation" VALUES (1,'fr','Euclide'),(1,'en','Euclid');
      INSERT INTO "HistoryMilestone" VALUES (1,'elements-history','PUBLISHED'),(2,'euclide-draft','DRAFT');
      INSERT INTO "HistoryMilestoneTranslation" VALUES (1,'Les Éléments d’Euclide','fr','Antiquité'),(1,'Euclid’s Elements','en','Antiquity'),(2,'Euclide brouillon','fr','');
      INSERT INTO "LibraryReference" (id,slug,"canonicalTitle",authors) VALUES (1,'elements','Éléments','Euclide'),(2,'private','Éléments privés','Euclide'),(3,'hidden','Éléments cachés','Euclide'),(4,'merged','Éléments fusionnés','Euclide');
      UPDATE "LibraryReference" SET status='DRAFT' WHERE id=2;
      UPDATE "LibraryReference" SET searchable=false WHERE id=3;
      UPDATE "LibraryReference" SET "mergedIntoId"=1 WHERE id=4;
      INSERT INTO "LibraryReferenceTranslation" VALUES (1,'en','Elements',''),(1,'fr','Éléments','');
      INSERT INTO "LibraryReference" (id,slug,"canonicalTitle") SELECT n,'pagination-'||n,'Pagination '||n FROM generate_series(10,45) n;
    `);
    let user = { id: 1, role: 'ADMIN' }, language = 'fr', rateLimited = false, dbCalls = 0;
    const code = ts.transpileModule(readFileSync('app/api/links/suggest/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const modules = {
      '@prisma/client': require('@prisma/client'), '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/permissions': permissions,
      '@/lib/db': { prisma: { $queryRaw: async sql => { dbCalls++; return (await db.query(sql.text,sql.values)).rows; } } },
      '@/lib/server-language': { getPreferredContentLanguage: async () => language }, '@/lib/rate-limit': { assertRateLimit: async () => { if(rateLimited) throw Error('limit'); } },
      '@/lib/request-security': { clientAddressFromHeaders: () => 'test' }, '@/lib/search-ranking': ranking, '@/lib/reference-search': search,
      '@/lib/markdown': { renderInlineMarkdown }, '@/lib/editor-links': links,
      '@/app/api/concepts/suggest/route': { GET: async () => Response.json({ concepts: [{ slug:'euclide', title:'Euclide',titleHtml:'Euclide',aliases:[] }] }) },
      '@/app/api/problems/suggest/route': { GET: async request => { assert.equal(new URL(request.url).searchParams.get('listed'),'1'); return Response.json({problems:[]}); } }
    };
    const exports={};vm.runInNewContext(code,{exports,require:name=>{assert.ok(modules[name],name);return modules[name];},URL,Request,Response,Error});
    const run = async (q, type='all') => exports.GET(new Request('http://localhost/api/links/suggest?'+new URLSearchParams({q,type})));
    let response=await run('euclide'), data=await response.json();
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(data.availableTypes,[...links.EDITOR_LINK_TYPES]);
    assert.deepEqual(new Set(data.results.map(r=>r.targetType)),new Set(['concept','mathematician','history','reference']));
    assert.equal(data.results.filter(r=>r.targetType==='mathematician').length,1);
    for(const q of ['les ÉLÉMENTS','elements','Les E\u0301le\u0301ments']) {
      data=await (await run(q,'reference')).json();assert.deepEqual(data.results.map(r=>r.slug),['elements']);
    }
    data=await (await run('Εὐκλείδης','mathematician')).json();assert.equal(data.results[0].slug,'euclide');
    language='en';data=await (await run('euclide','mathematician')).json();assert.equal(data.results[0].title,'Euclid');
    data=await (await run('pagination','reference')).json();assert.equal(data.results.length,20);
    data=await (await run("x' OR 1=1 --",'reference')).json();assert.deepEqual(data.results,[]);
    for(const role of [null,'USER','MODERATOR']) {
      user=role?{id:2,role}:null;const before=dbCalls;
      data=await (await run('euclide')).json();assert.deepEqual(data.availableTypes,['concept','problem']);assert.equal(dbCalls,before);
      data=await (await run('euclide','reference')).json();assert.deepEqual(data.results,[]);assert.equal(dbCalls,before);
    }
    assert.equal((await run('euclide','invalid')).status,400);
    rateLimited=true;assert.equal((await run('euclide')).status,429);
  } finally { await db.close(); }
});
