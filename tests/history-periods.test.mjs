import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { submittedHistoryPeriod } from '../lib/history-period.ts';
import * as limits from '../lib/content-limits.ts';
const require = createRequire(import.meta.url);
const form = (values = {}) => {
  const data = new FormData();
  Object.entries({ language:'fr',milestoneType:'PERIOD',sortYear:'-323',endYear:'-31',...values }).forEach(([k,v]) => data.set(k,v));
  return data;
};

test('period dates accept BCE, optional ends and equal boundaries; reject invalid intervals', () => {
  assert.deepEqual(submittedHistoryPeriod(form()), {milestoneType:'PERIOD',sortYear:-323,endYear:-31});
  assert.equal(submittedHistoryPeriod(form({endYear:''})).endYear,null);
  assert.equal(submittedHistoryPeriod(form({endYear:'-323'})).endYear,-323);
  assert.equal(submittedHistoryPeriod(form({sortYear:'-1',endYear:'1'})).endYear,1);
  assert.equal(submittedHistoryPeriod(form({milestoneType:'DISCOVERY',endYear:'-999'})).endYear,null);
  for(const values of [{endYear:'-324'},{sortYear:''},{sortYear:'1.2'},{sortYear:'-5001'},{endYear:'3001'},{endYear:'NaN'},{milestoneType:'ERA'}]) assert.throws(()=>submittedHistoryPeriod(form(values)));
  assert.throws(()=>submittedHistoryPeriod(form({language:'en',endYear:'-400'})),/end on or after/);
});

test('creation and translation edits persist shared dates and leave displayed date text intact', async () => {
  const writes=[], version=new Date('2026-09-11T12:00:00Z');
  const entry={id:1,slug:'hellenistic',status:'DRAFT',createdById:1,updatedAt:version,submittedAt:null};
  const tx={
    historyMilestone:{ create:async ({data})=>{writes.push(data);return entry;}, update:async ({data})=>{writes.push(data);return entry;} },
    historyMilestoneMathematician:{deleteMany:async()=>{}},historyMilestoneReference:{deleteMany:async()=>{}},historyMilestoneConcept:{deleteMany:async()=>{}}
  };
  const modules={
    '@prisma/client':require('@prisma/client'), '@/lib/history-period':{submittedHistoryPeriod},
    '@/lib/auth':{requireAdmin:async()=>({id:1,role:'ADMIN'})},
    '@/lib/permissions':{canCreateLibraryEntry:()=>true,canEditLibraryDraft:()=>true},
    '@/lib/content-limits':limits, '@/lib/unique-slug':{uniqueSlug:async()=>entry.slug},
    '@/lib/markdown':{renderMarkdown:async text=>'<p>'+text+'</p>'},
    '@/lib/db':{prisma:{$transaction:async callback=>callback(tx),historyMilestone:{findUnique:async()=>entry}}},
    'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}}
  };
  const exports={};
  const code=ts.transpileModule(readFileSync('lib/actions/library-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>modules[name]??{},Date,Error,URL,FormData});
  const data=form({title:'Mathématiques hellénistiques',summaryMarkdown:'Texte $x$',yearLabel:'vers 323–31 av. J.-C.',era:'ANCIENT',intent:'draft'});
  await assert.rejects(exports.createHistoryMilestoneAction(data),/REDIRECT/);
  assert.equal(writes[0].endYear,-31);assert.equal(writes[0].sortYear,-323);
  assert.equal(writes[0].translations.create.yearLabel,'vers 323–31 av. J.-C.');
  data.set('baseUpdatedAt',version.toISOString());data.set('language','en');data.set('yearLabel','c. 323–31 BCE');
  await assert.rejects(exports.updateHistoryMilestoneAction(1,data),/REDIRECT/);
  assert.equal(writes[1].endYear,-31);assert.equal(writes[1].translations.upsert.update.yearLabel,'c. 323–31 BCE');
  data.set('endYear','-400');
  await assert.rejects(exports.updateHistoryMilestoneAction(1,data),/end on or after/);
  assert.equal(writes.length,2);
  data.set('milestoneType','PUBLICATION');
  await assert.rejects(exports.updateHistoryMilestoneAction(1,data),/REDIRECT/);
  assert.equal(writes[2].endYear,null);
});

test('migration preserves existing events and enforces ordered period dates', {skip:!process.env.MW_PGLITE_MODULE}, async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href), db=new PGlite();
  try {
    await db.exec(`CREATE TYPE "HistoryMilestoneType" AS ENUM ('DISCOVERY','PUBLICATION','NOTATION','INSTITUTION','BIOGRAPHICAL','OTHER'); CREATE TABLE "HistoryMilestone" (id INT PRIMARY KEY,"sortYear" INT NOT NULL,"milestoneType" "HistoryMilestoneType"); INSERT INTO "HistoryMilestone" VALUES (1,-300,'PUBLICATION');`);
    await db.exec(readFileSync('prisma/migrations/20260911170000_history_periods/migration.sql','utf8'));
    assert.deepEqual((await db.query('SELECT * FROM "HistoryMilestone"')).rows,[{id:1,sortYear:-300,milestoneType:'PUBLICATION',endYear:null}]);
    await db.exec(`INSERT INTO "HistoryMilestone" VALUES (2,-323,'PERIOD',-31);`);
    await assert.rejects(db.exec(`UPDATE "HistoryMilestone" SET "endYear"=-400 WHERE id=2;`),/year_order_check/);
    assert.equal((await db.query('SELECT "endYear" FROM "HistoryMilestone" WHERE id=2')).rows[0].endYear,-31);
  }finally{await db.close();}
});
