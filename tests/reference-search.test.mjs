import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as search from '../lib/reference-search.ts';
const require = createRequire(import.meta.url);

test('reference query words tolerate case, Unicode accents, ligatures and punctuation', () => {
  assert.deepEqual(search.referenceSearchWords('  ÉLÉMENTS, Euclide — éléments '), ['elements','euclide']);
  assert.deepEqual(search.referenceSearchWords('ŒUVRES D’ALÉMBERT'), ['oeuvres','d','alembert']);
  assert.deepEqual(search.referenceSearchWords('E\u0301le\u0301ments Straße Æther'), ['elements','strasse','aether']);
  assert.deepEqual(search.referenceSearchWords('% _ *'), []);
  assert.ok(search.referenceSearchWords('a'.repeat(1000))[0].length <= 160);
  const sql = search.referenceMatchSql("x' OR 1=1 --");
  assert.ok(!sql.text.includes("x' OR")); assert.ok(sql.values.includes('or'));
});

test('PostgreSQL reference search and public API preserve visibility, editions and paging', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "LibraryReference" (id INT PRIMARY KEY, slug TEXT, "canonicalTitle" TEXT, authors TEXT, publisher TEXT, year INT, doi TEXT, isbn TEXT, "citationKey" TEXT, url TEXT, edition TEXT, volume TEXT, translator TEXT, editors TEXT, journal TEXT, aliases TEXT[] DEFAULT '{}', "workId" INT, status TEXT DEFAULT 'PUBLISHED', searchable BOOLEAN DEFAULT true, "mergedIntoId" INT, "referenceType" TEXT DEFAULT 'BOOK');
      CREATE TABLE "LibraryReferenceTranslation" ("referenceId" INT, language TEXT, "displayTitle" TEXT, "descriptionMarkdown" TEXT);
      INSERT INTO "LibraryReference" (id,"canonicalTitle",authors,aliases) VALUES
        (1,'Éléments','Euclide',ARRAY['Traité géométrique']), (2,'Œuvres complètes','Emmy Noether','{}'),
        (3,'Algèbre linéaire','D’Alembert','{}'), (4,'Straße','Gauß','{}'), (5,'Les Éléments','Euclid','{}'),
        (6,'Éléments privés','Euclide','{}'),(7,'Éléments masqués','Euclide','{}'),(8,'Éléments fusionnés','Euclide','{}');
      UPDATE "LibraryReference" SET "workId"=1, translator='Heath', isbn='978-0-12-345678-9' WHERE id=5;
      UPDATE "LibraryReference" SET status='DRAFT' WHERE id=6;
      UPDATE "LibraryReference" SET searchable=false WHERE id=7;
      UPDATE "LibraryReference" SET "mergedIntoId"=1 WHERE id=8;
      INSERT INTO "LibraryReferenceTranslation" VALUES (3,'en','Linear Algebra','Méthodes matricielles');
      INSERT INTO "LibraryReference" (id,"canonicalTitle") SELECT n,'Pagination ' || n FROM generate_series(10,21) n;
    `);
    const client = {
      $queryRaw: async sql => (await db.query(sql.text, sql.values)).rows,
      libraryReference: { findFirst: async ({ where }) => (await db.query('SELECT id FROM "LibraryReference" WHERE id=$1 AND status=\'PUBLISHED\' AND searchable AND "mergedIntoId" IS NULL', [where.id])).rows[0] }
    };
    for (const q of ['EUCLIDE elements','ÉLÉMENTS euclide','elements, EUCLIDE','E\u0301LE\u0301MENTS euclide','geoM traite']) assert.deepEqual(await search.matchingReferenceIds(client,q), [1]);
    assert.deepEqual(await search.matchingReferenceIds(client,'noether OEUVRES'), [2]);
    assert.deepEqual(await search.matchingReferenceIds(client,"linear d'alembert"), [3]);
    assert.deepEqual(await search.matchingReferenceIds(client,'STRASSE gauss'), [4]);
    assert.deepEqual(await search.matchingReferenceIds(client,'9780123456789'), [5]);
    assert.deepEqual(await search.matchingReferenceIds(client,'matricielles', { includeDescriptions: true }), [3]);
    assert.deepEqual(await search.matchingReferenceIds(client,'euclide inconnu'), []);
    assert.deepEqual(await search.matchingReferenceIds(client,'%'), []);

    const code = ts.transpileModule(readFileSync(new URL('../app/api/references/search/route.ts',import.meta.url),'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText;
    let user = { id:1 }, requests=0;
    const modules = { 'next/server':{NextResponse:Response}, '@prisma/client':require('@prisma/client'), '@/lib/auth':{getCurrentUser:async()=>user}, '@/lib/permissions':{isVerifiedContributor:()=>true}, '@/lib/rate-limit':{assertRateLimit:async()=>{}}, '@/lib/i18n/server':{getInterfaceLocale:async()=>'en'}, '@/lib/reference-search':search, '@/lib/db':{prisma:{...client,$queryRaw:async sql=>{requests++;return client.$queryRaw(sql);}}} };
    const exports={}; vm.runInNewContext(code,{exports,require:name=>modules[name],URL,Response,Error});
    const request = q => new Request('http://localhost/api/references/search?'+q);
    let response=await exports.GET(request('q=Heath'));
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    let data=await response.json(); assert.deepEqual(data.references.map(r=>r.id),[1]); assert.equal(data.references[0].editionCount,1);
    data=await (await exports.GET(request('q=9780123456789'))).json(); assert.deepEqual(data.references.map(r=>r.id),[1]);
    data=await (await exports.GET(request('workId=1'))).json(); assert.deepEqual(data.references.map(r=>r.id),[5]);
    data=await (await exports.GET(request('q=ELEMENTS'))).json(); assert.deepEqual(data.references.map(r=>r.id),[1]);
    const first=await (await exports.GET(request('q=pagination'))).json(), second=await (await exports.GET(request('q=Pagination&offset=10'))).json();
    assert.equal(first.references.length,10); assert.equal(first.more,true); assert.equal(second.references.length,2); assert.equal(second.more,false);
    assert.equal(new Set([...first.references,...second.references].map(r=>r.id)).size,12);
    user=null; const before=requests; assert.equal((await exports.GET(request('q=elements'))).status,403); assert.equal(requests,before);
  } finally { await db.close(); }
});
