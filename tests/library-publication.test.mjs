import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as permissions from '../lib/permissions.ts';
import * as limits from '../lib/content-limits.ts';
import * as names from '../lib/mathematician-names.ts';
import * as portraits from '../lib/portrait.ts';
import * as related from '../lib/mathematician-related.ts';
import * as browser from '../lib/mathematician-browser.ts';
import * as periods from '../lib/history-period.ts';
import * as titles from '../lib/reference-title.ts';
import {localizeNotification} from '../lib/notification-copy.ts';
const require=createRequire(import.meta.url),version=new Date('2026-09-01T12:00:00Z');
const compiled=ts.transpileModule(readFileSync('lib/actions/library-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(entity, overrides={}) {
  const writes=[];
  const entry={id:1,slug:'example',name:'Example',canonicalTitle:'Example',status:'PUBLISHED',createdById:1,lastEditedById:1,needsReviewAfterEdit:true,reviewedAt:null,publishedAt:version,updatedAt:version,translations:[{title:'Example',displayTitle:'Example',displayName:'Example'}],...overrides};
  const model={findFirst:async()=>null,findUnique:async()=>entry,create:async({data})=>{writes.push(data);return entry;},updateMany:async({where,data})=>{assert.equal(where.updatedAt,version);writes.push(data);return {count:1};}};
  const db={mathematician:model,libraryReference:model,historyMilestone:model,user:{findMany:async()=>{throw new Error('Library actions must not look up notification recipients');}},notification:{updateMany:async()=>{throw new Error('Library actions must not manage notifications');}},$transaction:async cb=>cb(db)};
  const modules={
    '@prisma/client':require('@prisma/client'),'@/lib/db':{prisma:db},
    '@/lib/auth':{requireAdmin:async()=>({id:2,role:'ADMIN',emailVerifiedAt:version}),requireVerifiedUser:async()=>({id:2,role:'USER',emailVerifiedAt:version})},
    '@/lib/permissions':permissions,'@/lib/content-limits':limits,'@/lib/mathematician-names':names,'@/lib/portrait':portraits,'@/lib/mathematician-related':related,'@/lib/mathematician-browser':browser,'@/lib/history-period':periods,'@/lib/reference-title':titles,
    '@/lib/reference-editions':{readReferenceBibliography:()=>({}),validateReferenceWork:async()=>null},
    '@/lib/library':{normalizeReferenceDedupeKey:()=> 'example'},'@/lib/problem-citations':{citationUrl:()=>null},
    '@/lib/unique-slug':{uniqueSlug:async()=>entry.slug},'@/lib/rate-limit':{assertRateLimit:async()=>{}},
    '@/lib/markdown':{renderMarkdown:async text=>text},'@/lib/user-display':{displayNameForUser:()=> 'Editor'},
    '@/lib/notifications':{createNotification:async()=>{throw new Error('Library actions must not send notifications');}},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{},unstable_rethrow:()=>{}}
  };
  const exports={};vm.runInNewContext(compiled,{exports,require:name=>modules[name]??{},FormData,Date,URL,Error});
  const form=new FormData();Object.entries({name:'Euclide',title:'Mathématiques hellénistiques',canonicalTitle:'Éléments',referenceType:'BOOK',language:'fr',intent:'submit',era:'ANCIENT',milestoneType:'PERIOD',sortYear:'-323',endYear:'-31',yearLabel:'323–31 av. J.-C.',summaryMarkdown:'Texte',imageUrl:'https://example.com/image.webp',imageCredit:'Auteur',imageCreditUrl:'https://example.com/source',imageLicense:'CC BY',baseUpdatedAt:version.toISOString()}).forEach(([k,v])=>form.set(k,v));
  return {actions:exports,writes,entry,form};
}
test('Publish creates all three library types immediately; drafts remain unpublished',async()=>{
  for(const [entity,action] of [['mathematician','createMathematicianAction'],['reference','createLibraryReferenceAction'],['milestone','createHistoryMilestoneAction']]) for(const intent of ['submit','draft']) {
    const h=harness(entity);h.form.set('intent',intent);await h.actions[action](h.form);
    const data=h.writes[0];assert.equal(data.status,intent==='submit'?'PUBLISHED':'DRAFT');
    assert.equal(data.publishedAt instanceof Date,intent==='submit');
    assert.equal(data.reviewedById,undefined);
    if(entity==='mathematician')assert.equal(data.needsReviewAfterEdit,intent==='submit');
    if(entity==='milestone'){assert.equal(data.imageUrl,'https://example.com/image.webp');assert.equal(data.imageCredit,'Auteur');assert.equal(data.imageLicense,'CC BY');}
  }
});
test('optional catalogue additions also publish immediately',async()=>{
  const h=harness('reference');const result=await h.actions.proposeLibraryReferenceAction({},h.form);
  assert.equal(result.success,true);assert.equal(h.writes[0].status,'PUBLISHED');
});
test('historical stubs publish with an empty description and validation errors return to the form',async()=>{
  const h=harness('milestone');h.form.set('summaryMarkdown','');
  const result=await h.actions.saveHistoryMilestoneFormAction(null,{error:''},h.form);
  assert.equal(result.error,'');assert.equal(h.writes[0].status,'PUBLISHED');assert.equal(h.writes[0].translations.create.summaryMarkdown,'');
  const invalid=harness('milestone');invalid.form.set('endYear','-400');
  const error=await invalid.actions.saveHistoryMilestoneFormAction(null,{error:''},invalid.form);
  assert.ok(error.error);assert.equal(invalid.writes.length,0);
});
test('review notifications describe a review and retain the meaning of older publication notifications',()=>{
  const notification={type:'LIBRARY_ENTRY_PUBLISHED',title:'Library entry reviewed',body:'Alouette reviewed your library historical milestone: "Calcul".'};
  assert.equal(localizeNotification(notification,'fr').body,'Alouette a relu votre repère historique « Calcul ».');
  assert.equal(localizeNotification(notification,'en').title,'Library entry reviewed');
  assert.equal(localizeNotification({...notification,title:'Library entry published',body:'Alouette published your library historical milestone: "Calcul".'},'fr').title,'Votre fiche de la bibliothèque a été publiée');
});
test('reviewing an already visible reference or milestone preserves its publication date and rejects stale forms',async()=>{
  for(const entity of ['reference','milestone']) {
    const h=harness(entity);await h.actions.reviewLibraryEntryAction(entity,1,'publish',h.form);
    assert.equal(h.writes[0].status,'PUBLISHED');assert.equal(h.writes[0].publishedAt,version);assert.equal(h.writes[0].reviewedById,2);
    const stale=harness(entity);stale.form.set('baseUpdatedAt','2020-01-01T00:00:00Z');
    await assert.rejects(stale.actions.reviewLibraryEntryAction(entity,1,'publish',stale.form),/changed after/);assert.equal(stale.writes.length,0);
    const reviewed=harness(entity,{reviewedAt:version,needsReviewAfterEdit:false});
    await assert.rejects(reviewed.actions.reviewLibraryEntryAction(entity,1,'publish',reviewed.form),/no longer awaiting/);
  }
});
test('library review decisions do not notify reviewers or creators',async()=>{
  for(const entity of ['mathematician','reference','milestone']) for(const decision of ['publish','changes']) {
    const h=harness(entity,{status:'PENDING_REVIEW'});
    h.form.set('reviewNote','Préciser les sources.');
    await h.actions.reviewLibraryEntryAction(entity,1,decision,h.form);
    assert.equal(h.writes[0].status,decision==='publish'?'PUBLISHED':'NEEDS_WORK');
  }
});

test('migration publishes only submitted entries and preserves all content and existing publication dates',{skip:!process.env.MW_PGLITE_MODULE},async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href),db=new PGlite();
  try {
    for(const table of ['Mathematician','LibraryReference','HistoryMilestone']) await db.exec(`CREATE TABLE "${table}" ("id" INT, "status" TEXT, "publishedAt" TIMESTAMP, "reviewedAt" TIMESTAMP, "reviewedById" INT, "updatedAt" TIMESTAMP, "needsReviewAfterEdit" BOOLEAN DEFAULT false, "content" TEXT); INSERT INTO "${table}" (id,status,"publishedAt",content) VALUES (1,'PENDING_REVIEW',NULL,'keep me'),(2,'DRAFT',NULL,'draft'),(3,'PUBLISHED','2020-01-01','live'),(4,'ARCHIVED',NULL,'archive'),(5,'NEEDS_WORK',NULL,'feedback');`);
    await db.exec(readFileSync('prisma/migrations/20260911230000_library_direct_publication/migration.sql','utf8'));
    for(const table of ['Mathematician','LibraryReference','HistoryMilestone']) {
      const {rows}=await db.query(`SELECT * FROM "${table}" ORDER BY id`);
      assert.deepEqual(rows.map(r=>r.status),['PUBLISHED','DRAFT','PUBLISHED','ARCHIVED','NEEDS_WORK']);
      assert.equal(rows[0].content,'keep me');assert.ok(rows[0].publishedAt);assert.equal(rows[0].reviewedAt,null);
      assert.equal(new Date(rows[2].publishedAt).getFullYear(),2020);
      if(table==='Mathematician')assert.equal(rows[0].needsReviewAfterEdit,true);
    }
  }finally{await db.close();}
});
