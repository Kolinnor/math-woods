import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as ranking from '../lib/search-ranking.ts';
import * as filters from '../lib/search-filters.ts';
import * as languages from '../lib/languages.ts';
import * as translations from '../lib/translation-routing.ts';
import * as browserTranslations from '../lib/problem-browser-translations.ts';
import * as contentTypes from '../lib/problem-content-types.ts';
import * as styles from '../lib/problem-styles.ts';
import * as domains from '../lib/domains.ts';
import * as permissions from '../lib/permissions.ts';
import * as difficulty from '../lib/problem-difficulty.ts';
import * as progress from '../lib/progress.ts';
import * as slug from '../lib/slug.ts';
import * as contests from '../lib/problem-contests.ts';
import { fr } from '../lib/i18n/dictionaries/fr.ts';
const require=createRequire(import.meta.url);

const rows=Array.from({length:31},(_,i)=>['fr','en'].map((language,j)=>({
 id:i*2+j+1,slug:`construction-${i}-${language}`,title:`Construction ${i}`,bodyMarkdown:'Dessiner un triangle.',origin:'Unknown',
 translationGroupId:`g-${i}`,language,translatedFromProblemId:j?i*2+1:null,status:'PUBLISHED',listed:true,qualityStatus:'REVIEWED',
 isExercise:false,difficulty:2,domain:'GEOMETRY',domains:[],styles:[],tags:[],spoilerTags:[],authorId:10,verificationMode:'NONE',
 author:{id:10,displayName:'Auteur',username:'auteur',profileSlug:'auteur'},proofs:[{id:1}]
}))).flat();
const conceptRows=['fr','en'].map((language,index)=>({id:100+index,slug:`concept-${language}`,title:'Un concept',bodyMarkdown:'Une définition.',aliases:[],language,translationGroupId:'concept-family',translatedFromConceptId:index?100:null,domainCode:'GEOMETRY'}));
function matches(row,where) {
 return Object.entries(where??{}).every(([key,value])=>{
  if(value===undefined)return true;
  if(key==='AND')return value.every(w=>matches(row,w));if(key==='OR')return value.some(w=>matches(row,w));
  if(value!==null&&typeof value==='object'){
   if('in' in value)return value.in.includes(row[key]);if('notIn' in value)return !value.notIn.includes(row[key]);
   if('contains' in value)return String(row[key]??'').toLowerCase().includes(value.contains.toLowerCase());
   if('equals' in value)return String(row[key]??'').toLowerCase()===String(value.equals).toLowerCase();
   if('some' in value)return (row[key]??[]).some(item=>matches(item,value.some));
   if('none' in value)return !(row[key]??[]).some(item=>matches(item,value.none));
   throw Error(`Unsupported filter ${key} ${JSON.stringify(value)}`);
  }
  return row[key]===value;
 });
}
async function render(file,query) {
 const calls=[],referenceCalls=[];
 const modules={
  'react/jsx-runtime':require('react/jsx-runtime'),'@prisma/client':require('@prisma/client'),
  'next/headers':{cookies:async()=>({get:()=>undefined})},
  '@/lib/auth':{getCurrentUser:async()=>null},'@/lib/i18n/server':{getTranslations:async()=>fr,getInterfaceLocale:async()=>'fr'},
  '@/lib/server-language':{getPreferredContentLanguage:async()=>'fr'},'@/lib/search-ranking':ranking,'@/lib/search-filters':filters,
  '@/lib/languages':languages,'@/lib/translation-routing':translations,'@/lib/problem-browser-translations':browserTranslations,
  '@/lib/problem-content-types':contentTypes,'@/lib/problem-styles':styles,'@/lib/domains':domains,'@/lib/permissions':permissions,
  '@/lib/problem-difficulty':difficulty,'@/lib/progress':progress,'@/lib/slug':slug,
  '@/lib/problem-contests':contests,
  '@/lib/concept-reference-search':{matchingConceptReferences:async(_db,q)=>q==='Source auteur'?conceptRows.map(row=>({id:row.id,label:'Source auteur'})):[]},
  '@/lib/user-display':{displayNameForUser:user=>user.displayName},'@/lib/problem-link':{problemLinkClass:value=>value},
  '@/lib/problem-visibility':{visibleProblemWhere:()=>({})},'@/lib/feature-flags':{EXPLORATIONS_ENABLED:false},
  '@/lib/actions/contribution-request-actions':{createContributionRequestAction:()=>{}},
  '@/lib/problem-reference-search':{matchingProblemReferences:async(_db,q,_user,exact=false)=>{
   referenceCalls.push({q,exact});return q.includes('Euclide')||q.includes('Proposition') ? rows.map(row=>({id:row.id,translationGroupId:row.translationGroupId,label:'Euclide — Éléments — Livre I — Proposition 24'})):[];
  }},
  '@/lib/db':{prisma:{problemContestSubmission:{findMany:async()=>[]},problem:{findMany:async args=>{calls.push(args);const result=rows.filter(row=>matches(row,args.where));return args.take?result.slice(0,args.take):result;}},concept:{findMany:async args=>conceptRows.filter(row=>matches(row,args.where))},quote:{findMany:async()=>[]},problemAttempt:{findMany:async()=>[]},problemFavorite:{findMany:async()=>[]}}}
 };
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,URLSearchParams,require:name=>modules[name]??new Proxy({}, {get:(_,key)=>String(key)})});
 const tree=await exports.default({searchParams:Promise.resolve(query)}),elements=[];
 const visit=node=>{if(Array.isArray(node))node.forEach(visit);else if(node?.props){elements.push(node);visit(node.props.children);}};visit(tree);
 return {elements,calls,referenceCalls,ids:elements.filter(node=>node.props.problemId).map(node=>node.props.problemId)};
}

test('actual problem list searches references before grouping and pagination without displaying a reference line',async()=>{
 const pages=await Promise.all([1,2,3].map(page=>render('app/problems/page.tsx',{q:'Euclide Livre 1 Proposition 24',page:String(page)})));
 assert.deepEqual(pages.map(page=>page.ids.length),[14,14,3]);assert.equal(new Set(pages.flatMap(page=>page.ids)).size,31);
 assert.ok(pages.every(page=>page.ids.every(id=>id%2===1)));
 assert.ok(pages.every(page=>!page.elements.some(node=>node.type==='p'&&node.props.children?.[0]==='Référence')));
 const next=pages[0].elements.find(node=>typeof node.props.href==='string'&&node.props.href.includes('page=2'));
 assert.ok(next);assert.equal(new URL(next.props.href,'https://example.test').searchParams.get('q'),'Euclide Livre 1 Proposition 24');
 const blocked=await render('app/problems/page.tsx',{q:'Euclide',quality:'NEEDS_WORK'});assert.equal(blocked.ids.length,0,'existing status filters still apply');
});

test('advanced Origin and Text filters use citation lookup with the existing exact/contains semantics',async()=>{
 for(const field of ['origin','text']){
  const page=await render('app/problems/page.tsx',{filterField:field,filterOp:'is',filterValue:'Euclide'});
  assert.equal(page.ids.length,14);assert.ok(page.referenceCalls.some(call=>call.q==='Euclide'&&call.exact));
  assert.ok(!page.elements.some(node=>node.type==='p'&&node.props.children?.[0]==='Référence'));
 }
 const none=await render('app/problems/page.tsx',{filterField:'origin',filterOp:'contains',filterValue:'inconnu'});assert.equal(none.ids.length,0);
});

test('global search includes problems found only in their references and displays the matched reference',async()=>{
 const page=await render('app/search/page.tsx',{q:'Proposition 24'});
 const links=page.elements.filter(node=>typeof node.props.href==='string'&&node.props.href.startsWith('/problems/'));
 assert.equal(links.length,20);assert.ok(links.every(node=>node.props.href.endsWith('-fr')));
 assert.equal(page.elements.filter(node=>node.type==='p'&&node.props.children?.[0]==='Référence').length,20);
 assert.ok(page.calls[0].where.OR.some(clause=>clause.id?.in.length===62));
});

test('global search returns a concept matched only by its reference, once in the preferred language',async()=>{
 const page=await render('app/search/page.tsx',{q:'Source auteur'});
 const links=page.elements.filter(node=>typeof node.props.href==='string'&&node.props.href.startsWith('/concepts/'));
 assert.equal(links.length,1);assert.equal(links[0].props.href,'/concepts/concept-fr');
});
