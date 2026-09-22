import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { matchingProblemReferences, problemReferenceSearchTerms, compactProblemReferenceLabel } from '../lib/problem-reference-search.ts';
import { matchingConceptReferences } from '../lib/concept-reference-search.ts';

test('reference terms support Roman locators without mistaking ordinary words for numerals',()=>{
 assert.deepEqual(problemReferenceSearchTerms('Euclide Éléments Livre I Proposition 24').map(t=>t.alternatives),[['euclide'],['elements'],['livre'],['1','i'],['proposition'],['24','xxiv']]);
 assert.deepEqual(problemReferenceSearchTerms('Livre IV Proposition XXIV').map(t=>t.alternatives),[['livre'],['4','iv'],['proposition'],['24','xxiv']]);
 assert.deepEqual(problemReferenceSearchTerms('mix civil').map(t=>t.alternatives),[['mix'],['civil']]);
 assert.equal(problemReferenceSearchTerms('Proposition 24')[1].wholeWord,true);
 assert.equal(compactProblemReferenceLabel('Euclide — Euclide — Éléments — Éléments — Livre 1\n  — Proposition 24'), 'Euclide — Éléments — Livre 1 — Proposition 24');
 assert.ok(compactProblemReferenceLabel('x'.repeat(500)).length<=280);
});

test('concept source search combines accented metadata and locators without exposing hidden references or their legacy mirrors', {skip:!process.env.MW_PGLITE_MODULE}, async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);const db=new PGlite();
 try {
  await db.exec(`
   CREATE TABLE "LibraryReference" (id INT PRIMARY KEY, "canonicalTitle" TEXT, authors TEXT, aliases TEXT[], status TEXT, searchable BOOLEAN, "mergedIntoId" INT);
   CREATE TABLE "LibraryReferenceTranslation" ("referenceId" INT,"displayTitle" TEXT);
   CREATE TABLE "ConceptLibraryReference" ("conceptId" INT,"referenceId" INT,text TEXT,locator TEXT,note TEXT);
   CREATE TABLE "ConceptReference" ("conceptId" INT,title TEXT,note TEXT);
   INSERT INTO "LibraryReference" VALUES (1,'Éléments','Euclide',ARRAY['Géométrie'],'PUBLISHED',true,null),(2,'Secret draft','Secret author','{}','DRAFT',true,null),(3,'Hidden book','Hidden author','{}','PUBLISHED',false,null),(4,'Merged book','Merged author','{}','PUBLISHED',true,1);
   INSERT INTO "LibraryReferenceTranslation" VALUES (1,'Elements of Geometry');
   INSERT INTO "ConceptLibraryReference" VALUES (1,1,'A citation','Livre 1','Proposition 24'),(2,2,'Secret citation',null,null),(3,3,'Hidden citation',null,null),(4,4,'Merged citation',null,null),(5,null,'Free citation','Chapter 2','A note');
   INSERT INTO "ConceptReference" VALUES (2,'Secret draft','Legacy duplicate'),(3,'Hidden book','Legacy duplicate'),(4,'Merged book','Legacy duplicate'),(6,'Legacy source','A note');
  `);
  let calls=0;
  const client={$queryRaw:async sql=>{calls++;return(await db.query(sql.text,sql.values)).rows;}};
  const ids=async query=>(await matchingConceptReferences(client,query)).map(row=>row.id);
  assert.deepEqual(await ids('euclide elements livre 1 proposition 24'),[1]);
  assert.deepEqual(await ids('Geometry'),[1]);assert.deepEqual(await ids('geometrie'),[1]);
  assert.deepEqual(await ids('Free Chapter 2'),[5]);assert.deepEqual(await ids('Legacy source note'),[6]);
  for(const query of ['secret','hidden','merged','Legacy duplicate','Free Euclide',"x' OR 1=1 --"]) assert.deepEqual(await ids(query),[]);
  const before=calls;assert.deepEqual(await ids(' '),[]);assert.equal(calls,before);
 } finally {await db.close();}
});

test('PostgreSQL problem reference search covers bibliographic fields, compound queries and spoiler access before paging', {skip:!process.env.MW_PGLITE_MODULE}, async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);const db=new PGlite();
 try {
  await db.exec(`
   CREATE TABLE "Problem" (id INT PRIMARY KEY, "translationGroupId" TEXT, "authorId" INT DEFAULT 10, status TEXT DEFAULT 'PUBLISHED', listed BOOLEAN DEFAULT true, origin TEXT, "originChapter" TEXT, "originPage" TEXT, "originNote" TEXT);
   CREATE TABLE "ProblemAttempt" ("userId" INT, "problemId" INT, status TEXT);
   CREATE TABLE "LibraryReference" (id INT PRIMARY KEY, "canonicalTitle" TEXT, authors TEXT, aliases TEXT[] DEFAULT '{}', status TEXT DEFAULT 'PUBLISHED', searchable BOOLEAN DEFAULT true, "mergedIntoId" INT);
   CREATE TABLE "LibraryReferenceTranslation" ("referenceId" INT, "displayTitle" TEXT);
   CREATE TABLE "ProblemLibraryReference" (id INT PRIMARY KEY, "problemId" INT, "referenceId" INT, text TEXT, locator TEXT, note TEXT, spoiler BOOLEAN DEFAULT false, position INT DEFAULT 0);
   INSERT INTO "Problem" (id,"translationGroupId") SELECT n,'group-'||n FROM generate_series(1,112) n;
   UPDATE "Problem" SET status='ARCHIVED' WHERE id=7;
   UPDATE "Problem" SET listed=false WHERE id=8;
   UPDATE "Problem" SET origin='Indice secret',"originNote"='Proposition secrète' WHERE id=3;
   UPDATE "Problem" SET origin='Euclide',"originChapter"='Livre I',"originPage"='p. 99',"originNote"='Proposition 24' WHERE id=9;
   UPDATE "Problem" SET "translationGroupId"='group-3',"authorId"=30 WHERE id=12;
   INSERT INTO "LibraryReference" (id,"canonicalTitle",authors) VALUES (1,'Éléments','Euclide'),(2,'Carnet privé','Auteur confidentiel'),(3,'Traité retiré','Invisible');
   UPDATE "LibraryReference" SET status='DRAFT' WHERE id=2;
   UPDATE "LibraryReference" SET searchable=false WHERE id=3;
   INSERT INTO "LibraryReferenceTranslation" VALUES (1,'Elements of Geometry');
   INSERT INTO "ProblemLibraryReference" (id,"problemId","referenceId",text,locator,note,spoiler) VALUES
    (1,1,1,'Euclide — Éléments','Livre 1','Proposition 24.',false),
    (2,2,1,'Euclide — Éléments','Livre I','Proposition XXIV.',false),
    (3,3,1,'Indice secret','Livre I','Proposition secrète',true),
    (4,4,1,'Euclide — Éléments','Livre 1','Proposition 241.',false),
    (5,5,1,'Euclide — Éléments','Livre 2','Proposition 24.',false),
    (6,6,NULL,'Recueil libre','Livre I','Proposition 24 et construction auxiliaire',false),
    (7,7,1,'Euclide — Éléments','Livre I','Proposition 24.',false),
    (8,8,1,'Euclide — Éléments','Livre I','Proposition 24.',false),
    (10,10,2,'Texte public','Section A',NULL,false),
    (11,11,3,'Autre texte public',NULL,NULL,false),
    (200,6,NULL,'Autre source','Livre 2','Autre information',false);
   INSERT INTO "ProblemLibraryReference" (id,"problemId","referenceId",text,locator,note) SELECT n,n,1,'Euclide — Éléments','Livre 1','Proposition 24' FROM generate_series(13,112) n;
  `);
  let calls=0;
  const client={$queryRaw:async sql=>{calls++;return(await db.query(sql.text,sql.values)).rows;}};
  const ids=async(q,user=null,exact=false)=>(await matchingProblemReferences(client,q,user,exact)).map(row=>row.id);
  for (const q of ['Euclide Éléments Livre 1 Proposition 24','ELEMENTS euclide proposition XXIV livre I','E\u0301le\u0301ments — Euclide, Livre I, Proposition 24']) {
   const matches=await ids(q);assert.deepEqual(matches.slice(0,2),[1,2]);assert.equal(matches.length,102);assert.ok(!matches.includes(4));assert.ok(!matches.includes(5));
  }
  assert.deepEqual((await ids('Livre 1 Proposition 24')).slice(0,4),[1,2,6,9]);
  assert.deepEqual(await ids('Livre 24 Proposition 1'),[], 'numbers stay attached to their locator words');
  assert.deepEqual(await ids('Livre 1 Proposition 1'),[], 'repeated numbers keep both locator conditions');
  assert.deepEqual(await ids('Autre source Proposition 24'),[], 'separate citations cannot combine into a fake match');
  assert.ok((await ids('Elements Geometry')).includes(1));
  assert.deepEqual(await ids('construction auxiliaire'),[6]);
  assert.deepEqual(await ids('p 99'),[9]);
  assert.deepEqual(await ids('Proposition secrète'),[]);
  assert.deepEqual(await ids('Proposition secrète',{id:20,role:'USER'}),[]);
  assert.deepEqual(await ids('Proposition secrète',{id:10,role:'USER'}),[3]);
  for (const role of ['MODERATOR','ADMIN','OWNER']) assert.deepEqual(await ids('Proposition secrète',{id:20,role}),[3]);
  await db.exec(`INSERT INTO "ProblemAttempt" VALUES (20,12,'STARTED')`);
  assert.deepEqual(await ids('Proposition secrète',{id:20,role:'USER'}),[]);
  await db.exec(`UPDATE "ProblemAttempt" SET status='SOLVED'`);
  assert.deepEqual(await ids('Proposition secrète',{id:20,role:'USER'}),[3],'solving another translation unlocks references');
  assert.deepEqual(await ids('Auteur confidentiel'),[]);assert.deepEqual(await ids('Invisible'),[]);
  assert.deepEqual(await ids('Texte public'),[10,11]);
  assert.deepEqual(await ids('Euclide',null,true),[1,2,4,5,9,...Array.from({length:100},(_,i)=>i+13)]);
  assert.deepEqual(await ids('Eucl',null,true),[]);
  assert.deepEqual(await ids("x' OR 1=1 --"),[]);
  const before=calls;assert.deepEqual(await ids(''),[]);assert.deepEqual(await ids('% _ *'),[]);assert.equal(calls,before);
  assert.equal((await matchingProblemReferences(client,'Euclide Livre 1 Proposition 24',null))[0].label,'Euclide — Éléments — Livre 1 — Proposition 24.');
 } finally {await db.close();}
});
