// Render the real server page with fixture data; exercise native disclosures in Chromium.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import * as permissions from '../lib/permissions.ts';
import * as library from '../lib/library.ts';
import { libraryCopy } from '../lib/library-copy.ts';
import * as names from '../lib/mathematician-names.ts';
const require=createRequire(import.meta.url), root=process.cwd();
let locale='fr', entry;
const mocks={
  'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)},
  'next/navigation':{notFound:()=>{throw new Error('Not found');}},
  '@/lib/auth':{requireAdmin:async()=>({id:2,role:'OWNER'})},
  '@/lib/db':{prisma:{mathematician:{findUnique:async()=>entry},historyMilestone:{findUnique:async()=>entry},libraryReference:{findUnique:async()=>entry}}},
  '@/lib/i18n/server':{getInterfaceLocale:async()=>locale},
  '@/lib/library':library, '@/lib/library-copy':{libraryCopy}, '@/lib/permissions':permissions, '@/lib/mathematician-names':names,
  '@/lib/library-queries':{localizedTranslation:(rows,language)=>rows.find(r=>r.language===language)??rows[0]},
  '@/lib/reference-bibtex':{referenceBibtexReport:()=>({key:'example',text:'@book{example}',errors:[],warnings:[]})},
  '@/lib/mathematician-related-db':{mathematicianRelatedInclude:{},relatedItemViews:async rows=>rows},
  '@/lib/actions/library-actions':{reviewLibraryEntryAction:()=>{throw new Error('UI test must never submit a review');}},
  '@/lib/markdown':{renderMarkdown:async text=>`<p>${text}</p>`},
  '@/components/AsyncMarkdownInline':{AsyncMarkdownInline:({markdown})=>React.createElement('span',null,markdown)},
  '@/components/MarkdownBlock':{MarkdownBlock:({html})=>React.createElement('div',{className:'prose-math',dangerouslySetInnerHTML:{__html:html}})},
  '@/components/UserName':{UserName:({user})=>React.createElement('span',null,user.displayName||user.username)}
};
const cache=new Map();
function load(name) {
  if(name in mocks)return mocks[name];
  if(!name.startsWith('@/'))return require(name);
  if(cache.has(name))return cache.get(name);
  const base=path.join(root,name.slice(2)), file=['.tsx','.ts'].map(ext=>base+ext).find(existsSync);
  if(!file)throw new Error('Unknown module '+name);
  const exports={};cache.set(name,exports);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:specifier=>load(specifier.startsWith('.')?'@/'+path.relative(root,path.resolve(path.dirname(file),specifier)).replaceAll('\\','/').replace(/\.tsx?$/,''):specifier),URL,console});return exports;
}
async function resolveNodes(node) {
  if(Array.isArray(node))return Promise.all(node.map(async (item,index)=>{const resolved=await resolveNodes(item);return React.isValidElement(resolved)?React.cloneElement(resolved,{key:resolved.key??index}):resolved;}));
  if(!React.isValidElement(node))return node;
  if(typeof node.type==='function'&&node.type.constructor.name==='AsyncFunction')return resolveNodes(await node.type(node.props));
  const props={};for(const [key,value] of Object.entries(node.props))props[key]=await resolveNodes(value);
  return React.cloneElement(node,props);
}
const pageModule=load('@/app/library/mathematicians/[slug]/page');
const person={username:'editor',profileSlug:'editor',displayName:'Ancient Tree',avatarUrl:null,avatarBackground:null};
function fixture(kind,language) {
  const complete=kind==='complete', empty=kind==='empty';
  const translation={language,displayName:'Emmy Noether',teaser:empty?'':language==='fr'?'Algèbre abstraite et symétries.':'Abstract algebra and symmetries.',birthPlace:empty?'':complete?'Erlangen':'Inconnu',biographyHtml:complete?'<p>Emmy Noether a profondément transformé l’algèbre. Ses travaux portent notamment sur les anneaux, les corps et les idéaux.</p><p>Cette fiche présente quelques repères de sa vie et les contributions qui lui sont associées.</p>':'',contributionsHtml:complete?'<p>Le théorème de Noether relie les symétries continues aux lois de conservation. Ses méthodes ont aussi façonné l’algèbre moderne.</p>':'',relatedItems:empty?[]:[{key:'work',category:'WORK',labelMarkdown:'Emmy Noether — Gesammelte Abhandlungen',href:'/library/references/noether',noteMarkdown:complete?'Articles réunis dans cette édition.':'',relation:''}]};
  return {id:1,slug:'emmy-noether',name:'Emmy Noether',createdById:2,status:kind==='sparse'?'PENDING_REVIEW':empty?'DRAFT':'PUBLISHED',portraitUrl:empty?null:'/mathematicians/emmy-noether.jpg',portraitCrop:null,portraitDetails:'Portrait conservé dans les archives.',imageAlt:null,aliases:empty?[]:['Amalie Emmy Noether'],lifespan:empty?'':'1882–1935',createdBy:person,reviewedBy:complete?person:null,reviewNote:null,translations:complete?[translation,{...translation,language:language==='fr'?'en':'fr'}]:[translation],milestoneLinks:[]};
}
let css;
if(existsSync('.next/static/css') && readdirSync('.next/static/css').some(f=>f.endsWith('.css'))) {
  css=readdirSync('.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(path.join('.next/static/css',f),'utf8')).join('\n');
} else {
  const base=process.env.MW_LOCAL_URL||'http://127.0.0.1:3000';
  const html=await (await fetch(base)).text();
  const urls=[...new Set([...html.matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match=>match[1].replaceAll('&amp;','&')))];
  assert.ok(urls.length,'Built CSS or a running local server is required');
  css=(await Promise.all(urls.map(async url=>(await fetch(new URL(url,base))).text()))).join('\n');
}
css+='\n'+readFileSync('app/styles/68-library.css','utf8');
const browser=await chromium.launch({headless:true});mkdirSync('runtime/mathematician-page',{recursive:true});
try {
  for(const language of ['fr','en'])for(const kind of ['sparse','complete','empty','rereview','own'])for(const width of [1440,390]) {
    locale=language;entry={...fixture(kind==='rereview'?'complete':kind==='own'?'sparse':kind,language),createdById:1,lastEditedById:kind==='own'?2:1,updatedAt:new Date('2026-09-07T12:00:00Z'),needsReviewAfterEdit:kind==='rereview'};
    const tree=await pageModule.default({params:Promise.resolve({slug:entry.slug}),searchParams:Promise.resolve({lang:language})});
    const html=renderToStaticMarkup(await resolveNodes(tree));
    const page=await browser.newPage({viewport:{width,height:960}});
    await page.route('http://localhost:3212/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body>${html}</body></html>`});
      if(['/art/birch-grove.jpg','/mathematicians/emmy-noether.jpg'].includes(pathname))return route.fulfill({contentType:'image/jpeg',body:readFileSync(path.join(root,'public',pathname))});
      return route.fulfill({status:404,body:''});
    });
    await page.goto('http://localhost:3212/');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal scrolling');
    assert.equal(await page.getByRole('heading',{level:1,name:'Emmy Noether'}).count(),1);
    const management=page.locator('.library-detail-management');
    assert.equal(await page.locator('.mathematician-rail').getByRole('link',{name:language==='fr'?'Modifier':'Edit',exact:true}).count(),1);
    assert.equal(await page.locator('.mathematician-stub-notice').count(),kind==='complete'?0:1);
    if(kind==='own')assert.equal(await page.getByRole('button',{name:language==='fr'?'Publier':'Publish',exact:true}).count(),0);
    if(width>1000) {
      const article=await page.locator('.mathematician-article').boundingBox(),rail=await page.locator('.mathematician-rail').boundingBox();
      assert.ok(rail.x>=article.x+article.width,'Actions sit to the right of the article');
    }
    if(kind==='sparse')assert.equal(await page.getByText('Inconnu',{exact:true}).count(),0);
    if(kind==='empty')assert.equal(await page.locator('.mathematician-biographical-panel').count(),0);
    else { const portrait=await page.locator('.mathematician-portrait').boundingBox();assert.ok(portrait.width<=201&&portrait.width>=(width>640?170:110)); }
    await page.screenshot({path:`runtime/mathematician-page/${language}-${kind}-${width}.png`,fullPage:true});
    assert.equal(await management.locator('.library-management').getAttribute('open'),null);
    assert.equal(await page.getByRole('button',{name:language==='fr'?'Archiver':'Archive',exact:true}).isVisible(),false);
    const toggle=management.locator('.library-management > summary');
    await toggle.focus();await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button',{name:language==='fr'?'Archiver':'Archive',exact:true}).isVisible(),true);
    if(kind==='rereview')assert.equal(await page.getByRole('button',{name:language==='fr'?'Confirmer la relecture':'Confirm review',exact:true}).count(),1);
    if(kind==='own') {
      assert.equal(await page.getByRole('button',{name:language==='fr'?'Publier':'Publish',exact:true}).count(),0);
      const help=management.locator('.field-help');await help.focus();
      const tooltip=await help.evaluate(el=>{const s=getComputedStyle(el,'::after');return {visible:s.visibility,width:parseFloat(s.width),left:el.parentElement.getBoundingClientRect().left};});
      assert.equal(tooltip.visible,'visible');assert.ok(tooltip.left+tooltip.width<=width,'Review help fits viewport');
    }
    if(kind==='sparse') {
      assert.equal(await page.getByRole('textbox').isVisible(),false);
      await management.locator('.library-review-feedback > summary').click();
      const textarea=page.getByRole('textbox');const box=await textarea.boundingBox();assert.ok(box.height<=150);
      await textarea.fill('Correction à proposer');assert.equal(await textarea.inputValue(),'Correction à proposer');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Management fits mobile width');
    if(kind==='sparse')await page.screenshot({path:`runtime/mathematician-page/${language}-management-${width}.png`,fullPage:true});
    await toggle.click();
    assert.equal(await page.getByRole('button',{name:language==='fr'?'Archiver':'Archive',exact:true}).isVisible(),false);
    await page.close();console.log('PASS',language,kind,width);
  }
  for(const type of ['history','references'])for(const language of ['fr','en'])for(const width of [1440,390]) {
    locale=language;
    const contentLanguage=language==='fr'?'en':'fr';
    entry={id:1,slug:'example',status:'PUBLISHED',createdById:1,createdBy:person,reviewedBy:null,reviewedAt:null,reviewNote:null,updatedAt:new Date('2026-09-11T12:00:00Z'),
      sortYear:-300,era:'ANCIENT',milestoneType:'PERIOD',mathematicians:[],referenceLinks:[],conceptLinks:[],
      canonicalTitle:'Éléments',referenceType:'BOOK',authors:'Euclide',editions:[],mathematicianRelatedItems:[],problemLinks:[],milestoneLinks:[],
      translations:['fr','en'].map(lang=>({language:lang,title:lang==='fr'?'Mathématiques hellénistiques':'Hellenistic mathematics',displayTitle:lang==='fr'?'Éléments':'Elements',yearLabel:lang==='fr'?'vers 300 av. J.-C.':'c. 300 BCE',summaryMarkdown:'Texte',summaryHtml:'<p>Texte de la fiche.</p>',descriptionHtml:'<p>Description de la référence.</p>'}))};
    const module=load(`@/app/library/${type}/[slug]/page`);
    const tree=await module.default({params:Promise.resolve({slug:'example'}),searchParams:Promise.resolve({lang:contentLanguage})});
    const html=renderToStaticMarkup(await resolveNodes(tree));
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.setContent(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body>${html}</body></html>`);
    const rail=page.locator('.library-detail-rail'),article=page.locator('.library-detail-layout > article');
    const edit=rail.getByRole('link',{name:language==='fr'?'Modifier':'Edit',exact:true});
    assert.equal(await edit.getAttribute('href'),`/library/${type}/example/edit?lang=${contentLanguage}`);
    assert.equal(await rail.getByRole('link',{name:language==='fr'?'Traduire':'Translate',exact:true}).getAttribute('href'),`/library/${type}/example/edit?lang=${language}`);
    assert.equal(await article.getByRole('link',{name:language==='fr'?'Modifier':'Edit',exact:true}).count(),0);
    assert.equal(await page.locator('.forest-page-hero-actions').count(),0);
    assert.equal(await page.locator('.library-detail-back-link').getAttribute('href'),`/library/${type}`);
    assert.equal(await page.locator('.library-detail-languages [aria-current=page]').getAttribute('href'),`/library/${type}/example?lang=${contentLanguage}`);
    assert.equal(await rail.locator('.library-management').getAttribute('open'),null);
    const a=await article.boundingBox(),r=await rail.boundingBox();
    assert.ok(width>1000?r.x>=a.x+a.width:r.y>=a.y+a.height,'Same responsive rail layout for every entry');
    await rail.locator('.library-management > summary').click();
    assert.ok(await rail.getByRole('button',{name:language==='fr'?'Confirmer la relecture':'Confirm review',exact:true}).isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`runtime/mathematician-page/${type}-${language}-${width}.png`,fullPage:true});
    await page.close();console.log('PASS shared entry navigation',type,language,width);
  }
} finally {await browser.close();}
