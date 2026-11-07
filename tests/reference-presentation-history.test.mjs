import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as permissions from '../lib/permissions.ts';
import {fr} from '../lib/i18n/dictionaries/fr.ts';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync('app/library/references/[slug]/history/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function page({query={},status='PUBLISHED',role='ADMIN',count=21}={}) {
 const calls=[];
 const modules={
  'react/jsx-runtime':require('react/jsx-runtime'),
  'next/navigation':{notFound:()=>{throw new Error('NOT_FOUND');}},
  '@/lib/auth':{requireModerator:async()=>{if(!role || !permissions.hasTrustedPrivileges(role))throw Error('TRUSTED_GATE');return {id:2,role};}},
  '@/lib/i18n/server':{getInterfaceLocale:async()=>'fr',getTranslations:async()=>fr},
  '@/lib/library':{libraryLanguage:value=>value==='fr'?'fr':'en'},
  '@/lib/library-queries':{localizedTranslation:(rows,lang)=>rows.find(r=>r.language===lang)??rows[0]},
  '@/lib/permissions':permissions,
  '@/lib/reference-contributors':{referenceContributorUserSelect:{id:true,username:true}},
  '@/lib/db':{prisma:{
   libraryReference:{findUnique:async()=>({id:7,slug:'livre',canonicalTitle:'Livre',status,createdById:1,translations:[{language:'fr',displayTitle:'Livre'},{language:'en',displayTitle:'Book'}]})},
   libraryReferencePresentationRevision:{findMany:async args=>{calls.push(args);return Array.from({length:count},(_,i)=>({id:80-i,createdAt:new Date('2026-11-02T12:00:00Z'),markdown:'Nouveau texte',previousMarkdown:i===count-1?null:'Ancien texte',isBaseline:i===count-1,editedBy:null}));}}
  }}
 };
 const exports={};vm.runInNewContext(code,{exports,require:name=>modules[name]??new Proxy({}, {get:(_,key)=>String(key)})});
 const tree=await exports.default({params:Promise.resolve({slug:'livre'}),searchParams:Promise.resolve(query)});
 const elements=[];const visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node?.props){elements.push(node);visit(node.props.children);}};visit(tree);
 return {elements,calls};
}
test('history uses the chosen language, limits pages and keeps exact before/after text at page boundaries',async()=>{
 const {calls,elements}=await page({query:{lang:'en',before:'81'}});
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0].where)),{referenceId:7,language:'en',id:{lt:81}});
 assert.equal(calls[0].take,21);
 const diffs=elements.filter(e=>e.type==='RevisionDiff');
 assert.equal(diffs.length,20);
 assert.equal(diffs[19].props.beforeMarkdown,'Ancien texte');
 assert.equal(diffs[19].props.afterMarkdown,'Nouveau texte');
 assert.ok(elements.some(e=>e.props.href==='/library/references/livre/history?lang=en&before=61'));
 assert.ok(elements.some(e=>e.props.href==='/library/references/livre/history?lang=en'));
});
test('history enforces the same visibility as a reference before reading revisions',async()=>{
 await assert.rejects(page({role:null}),/TRUSTED_GATE/);
 assert.equal((await page({role:'MODERATOR'})).calls.length,1);
 await assert.rejects(page({status:'DRAFT',role:null}),/TRUSTED_GATE/);
 await assert.rejects(page({status:'DRAFT',role:'USER'}),/TRUSTED_GATE/);
 await assert.rejects(page({status:'ARCHIVED',role:'USER'}),/TRUSTED_GATE/);
 assert.equal((await page({status:'ARCHIVED'})).calls.length,1);
});
test('legacy baseline is explained, deleted editors remain readable and invalid cursors are ignored',async()=>{
 const {calls,elements}=await page({query:{before:'invalid'},count:1});
 assert.equal(calls[0].where.id,undefined);
 assert.equal(elements.filter(e=>e.type==='RevisionDiff').length,0);
 assert.ok(elements.some(e=>e.type==='h2'&&e.props.children==='Version au début du suivi'));
 assert.ok(elements.some(e=>e.type==='pre'&&e.props.children==='Nouveau texte'));
 assert.ok(!elements.some(e=>typeof e.props.href==='string'&&e.props.href.includes('before=')));
});
