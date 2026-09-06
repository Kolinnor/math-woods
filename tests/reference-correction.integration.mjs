// Opt-in integration test using an isolated, empty database and a private audit snapshot.
// node --experimental-strip-types tests/reference-correction.integration.mjs snapshot.json
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePlan, snapshot, applyPlan, digest } from '../scripts/correct-reference-catalogue-20260906.mjs';
import { parse } from '@retorquere/bibtex-parser';
import { exportReferenceBibtex } from '../lib/reference-bibtex.ts';
import { parseProblemCitations } from '../lib/problem-citations.ts';
import { parseConceptCitations } from '../lib/concept-citations.ts';
import { normalizeReferenceDedupeKey } from '../lib/library.ts';

const url=new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1','reference-test'].includes(url.hostname));
assert.equal(url.pathname,'/reference_test');
assert.equal(url.username,'reference_test');
const db=new PrismaClient();
try {
  assert.equal(await db.problem.count(),0,'Test requires an empty isolated database');
  assert.equal(await db.concept.count(),0,'Test requires an empty isolated database');
  const bootstrap=await db.libraryReference.findMany({select:{canonicalTitle:true}});
  assert.ok(bootstrap.length<=1 && bootstrap.every(r=>r.canonicalTitle==='Phil Caldero'),'Unexpected test catalogue contents');
  await db.libraryReference.deleteMany(); // Only the known migration bootstrap record, in the guarded test database.
  const original=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
  const user=await db.user.create({data:{username:'reference-audit-test',profileSlug:'reference-audit-test'}});
  await db.problem.createMany({data:original.problem.map(p=>({...p,title:p.slug,bodyHtml:'',authorId:user.id}))});
  await db.concept.createMany({data:original.concept.map(c=>({...c,title:c.slug,bodyHtml:''}))});
  // No production account records are imported into the test database.
  await db.libraryReference.createMany({data:original.libraryReference.map(r=>({...r,createdById:null,reviewedById:null}))});
  for (const table of ['libraryReferenceTranslation','problemLibraryReference','conceptLibraryReference','conceptReference']) if (original[table].length) await db[table].createMany({data:original[table]});
  for (const table of ['LibraryReference','ProblemLibraryReference']) await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT MAX(id) FROM "${table}"))`);
  const before=await snapshot(db),plan=makePlan(before);
  const modified=structuredClone(before);
  modified.conceptLibraryReference.find(c=>c.referenceId===58).note='A new note that must not be lost';
  assert.throws(()=>makePlan(modified),/New citation details/);
  const shared=plan.changes.filter(c=>c.table==='libraryReference'&&[58,66].includes(c.id));
  assert.equal(shared.length,2);
  assert.ok(shared.every(c=>c.data.status==='ARCHIVED' && !c.data.mergedIntoId));
  // A stale preview cannot overwrite a live contribution.
  const first=before.problemLibraryReference[0];
  await db.problemLibraryReference.update({where:{id:first.id},data:{note:'Concurrent edit'}});
  const concurrent=await snapshot(db);
  await assert.rejects(()=>applyPlan(db,plan,before),/Production changed/);
  assert.equal(digest(await snapshot(db)),digest(concurrent));
  await db.problemLibraryReference.update({where:{id:first.id},data:{note:first.note}});
  // Inject an error after actual writes and check that every table is rolled back.
  const failing={$transaction:(fn,opts)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,name){
    if(name==='conceptLibraryReference')return new Proxy(target[name],{get(model,method){
      if(method==='update')return async()=>{throw new Error('injected failure');};
      return model[method];
    }});
    return target[name];
  }})),opts)};
  await assert.rejects(()=>applyPlan(failing,plan,before),/injected failure/);
  assert.equal(digest(await snapshot(db)),digest(before));
  const result=await applyPlan(db,plan,before),after=result.after;
  assert.equal(after.conceptLibraryReference.length,11);
  assert.equal(after.problemLibraryReference.length,93);
  for(const id of [417,420,415,413]) {
    const citations=after.conceptLibraryReference.filter(c=>c.conceptId===id);
    assert.equal(citations.length,1); assert.equal(citations[0].referenceId,49);
  }
  for(const id of [412,406,411]) {
    const citations=after.conceptLibraryReference.filter(c=>c.conceptId===id);
    assert.equal(citations.length,1); assert.equal(citations[0].referenceId,64);
  }
  for(const p of before.problem) parseProblemCitations(after.problemLibraryReference.filter(c=>c.problemId===p.id));
  for(const c of before.concept) parseConceptCitations(after.conceptLibraryReference.filter(r=>r.conceptId===c.id));
  for(const id of [365,366]) assert.equal(after.problemLibraryReference.find(c=>c.problemId===id).note,before.problemLibraryReference.find(c=>c.problemId===id).note);
  const visible=after.libraryReference.filter(r=>r.searchable&&!r.mergedIntoId&&r.status==='PUBLISHED');
  assert.equal(visible.length,22);
  for(const r of visible.filter(r=>r.id!==16)) assert.equal(r.dedupeKey,normalizeReferenceDedupeKey({...r,title:r.canonicalTitle}));
  const bibtex=exportReferenceBibtex(visible),parsed=parse(bibtex);
  assert.equal(parsed.errors.length,0); assert.equal(parsed.entries.length,22);
  assert.ok(parsed.entries.some(e=>e.type==='article' && e.fields.doi==='10.2307/2032477'));
  assert.throws(()=>makePlan(after),/Catalogue changed|already changed/);
  console.log(JSON.stringify({passed:true,checks:['contextual reconstruction','concurrent edit protection','transaction rollback','citation validation','image credits','deduplication','22 bibliography exports','repeat protection'],summary:result.summary}));
} finally { await db.$disconnect(); }
