import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as pagination from '../lib/concept-pagination.ts';
import * as translations from '../lib/translation-routing.ts';
import * as ranking from '../lib/search-ranking.ts';
import * as filters from '../lib/search-filters.ts';
import * as exercises from '../lib/concept-exercises.ts';
import * as languages from '../lib/languages.ts';
import * as browserView from '../lib/concept-browser-view.ts';
import * as permissions from '../lib/permissions.ts';
import { fr } from '../lib/i18n/dictionaries/fr.ts';
const require = createRequire(import.meta.url);

test('page bounds and links preserve repeated languages and all active filters', () => {
  assert.deepEqual(pagination.conceptPagination('3', 151), {page:3,totalPages:3,skip:150,from:151,to:151});
  assert.equal(pagination.conceptPagination('999', 151).page,3);
  for (const page of ['0','-1','NaN','1.5','99999999999999999999',undefined]) assert.equal(pagination.conceptPagination(page,151).page,1);
  assert.deepEqual(pagination.conceptPagination('2',0),{page:1,totalPages:1,skip:0,from:0,to:0});
  const query={page:'2',language:['fr','en'],viewLanguage:'fr',q:'compas & règle',domain:'geometry',status:'USABLE',kind:'DEFINITION',sort:'linked',exerciseCount:'3',exerciseCountMode:'at-most',missingTranslation:'en',problemLinks:'with'};
  const url=new URL(pagination.conceptPageHref(query,3),'https://example.test');
  assert.deepEqual(url.searchParams.getAll('language'),['fr','en']);
  for (const [key,value] of Object.entries(query)) if (!['page','language'].includes(key)) assert.equal(url.searchParams.get(key),value);
  assert.equal(url.searchParams.get('page'),'3');assert.equal(url.hash,'#concept-results');
  assert.equal(new URL(pagination.conceptPageHref(query,1),'https://example.test').searchParams.has('page'),false);
});

const compiled=ts.transpileModule(readFileSync(new URL('../app/concepts/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const rows=Array.from({length:181},(_,i)=>['fr','en'].map((language,j)=>({
  id:i*2+j+1,slug:`concept-${i}-${language}`,title:`Concept ${i}`,language,
  translationGroupId:`group-${i}`,translatedFromConceptId:j ? i*2+1:null,
  updatedAt:new Date(2026,0,181-i),domainCode:'geometry',status:'USABLE',kind:'DEFINITION',
  needsReviewAfterEdit:false,bodyMarkdown:'Concept example',aliases:[],_count:{practiceExercises:0}
}))).flat();

async function page(query, candidates=rows, cookie, role=null) {
  const calls=[];
  const preloads=[];
  const modules={
    'react-dom':{preload:(href,options)=>preloads.push({href,options})},
    'next/headers':{cookies:async()=>({get:name=>name===browserView.CONCEPT_BROWSER_VIEW_COOKIE&&cookie?{value:cookie}:undefined})},
    '@/lib/concept-browser-view':browserView,
    'react/jsx-runtime':require('react/jsx-runtime'),
    '@prisma/client':require('@prisma/client'),
    '@/lib/concept-pagination':pagination,
    '@/lib/translation-routing':translations,
    '@/lib/search-ranking':ranking,
    '@/lib/search-filters':filters,
    '@/lib/concept-exercises':exercises,
    '@/lib/languages':languages,
    '@/lib/auth':{getCurrentUser:async()=>role ? {id:1,role} : null},
    '@/lib/i18n/server':{getTranslations:async()=>fr,getInterfaceLocale:async()=>'fr'},
    '@/lib/server-language':{getPreferredContentLanguage:async()=>'fr'},
    '@/lib/permissions':permissions,
    '@/lib/internal-links':{missingConcepts:async()=>[]},
    '@/lib/domains':{PROBLEM_DOMAINS:[],translatedDomainLabel:()=>''},
    '@/lib/actions/contribution-request-actions':{createContributionRequestAction:()=>{}},
    '@/lib/db':{prisma:{concept:{findMany:async args=>{calls.push(args);return args.take===8 ? []:candidates;}},internalLink:{groupBy:async()=>candidates.map(c=>({targetSlug:c.slug,_count:{targetSlug:c.id}}))}}}
  };
  const exports={};
  vm.runInNewContext(compiled,{exports,URLSearchParams,require:name=>modules[name]??new Proxy({}, {get:(_,key)=>String(key)})});
  const tree=await exports.default({searchParams:Promise.resolve(query)});
  const elements=[];
  function visit(node) {if(Array.isArray(node))return node.forEach(visit);if(node&&typeof node==='object'&&node.props){elements.push(node);visit(node.props.children);}}
  visit(tree);
  return {calls,preloads,ids:elements.filter(n=>n.props.className?.startsWith('concept-ledger-row')).map(n=>n.key),elements};
}

test('actual concepts page exposes every match once, after grouping translations, for each sort and search',async()=>{
  for (const query of [{view:'list'},{sort:'linked',view:'list'},{q:'Concept',view:'list'},{q:'Concept',sort:'linked',view:'list'}]) {
    const pages=await Promise.all([1,2,3].map(n=>page({...query,page:String(n),language:['fr','en']})));
    assert.deepEqual(pages.map(p=>p.ids.length),[75,75,31]);
    assert.equal(new Set(pages.flatMap(p=>p.ids)).size,181);
    assert.ok(pages.flatMap(p=>p.ids).every(id=>Number(id)%2===1));
    assert.equal(pages[0].calls[0].take,undefined);
    assert.equal(pages[0].calls[0].select.bodyHtml,undefined);
    assert.equal(pages[0].calls[0].select.bodyMarkdown,Boolean(query.q));
    assert.ok(pages[2].elements.some(e=>e.props.className==='result-summary'&&e.props.children==='151–181 sur 181 concepts'));
  }
});

test('actual page handles zero matches and a requested page beyond the last result',async()=>{
  assert.equal((await page({page:'999',view:'list'})).ids.length,31);
  const empty=await page({page:'999'},[],'list');
  assert.equal(empty.ids.length,0);
  assert.equal(empty.elements.filter(e=>e.type==='nav').length,0);
});

test('admins default to the map with a restricted-access notice; list remains available',async()=>{
  const map=await page({},rows,undefined,'ADMIN');
  assert.equal(map.calls.length,0);
  assert.equal(map.ids.length,0);
  assert.equal(JSON.stringify(map.preloads),JSON.stringify([{href:'/api/concepts/map?lang=fr&tier=1',options:{as:'fetch',crossOrigin:'anonymous'}}]),'the map data is requested with the page');
  const mapElement=map.elements.find(e=>e.props.copy&&e.props.listHref);
  assert.ok(mapElement,'the map component is rendered');
  assert.equal(mapElement.props.language,'fr');
  assert.equal(mapElement.props.listHref,'/concepts?view=list');
  assert.equal(map.elements.find(e=>e.props.view)?.props.view,'map');
  assert.ok(map.elements.some(e=>e.props.children===fr.conceptMap.adminOnlyNotice));
  const remembered=await page({},rows,'list','ADMIN');
  assert.equal(remembered.ids.length,75);
  assert.equal(remembered.preloads.length,0);
  assert.equal(remembered.elements.find(e=>e.props.view)?.props.view,'list');
  const explicit=await page({view:'map'},rows,'list','OWNER');
  assert.equal(explicit.calls.length,0);
});

test('visitors, members and moderators always get the list, even with a map URL or cookie',async()=>{
  for(const role of [null,'USER','MODERATOR']) for(const query of [{},{view:'map'},{view:'list'}]) {
    const result=await page(query,rows,'map',role);
    assert.equal(result.ids.length,75);
    assert.equal(result.preloads.length,0);
    assert.ok(!result.elements.some(e=>e.props.copy&&e.props.listHref));
    assert.ok(!result.elements.some(e=>e.props.view));
  }
});
