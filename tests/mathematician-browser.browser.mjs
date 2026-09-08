// Real page and interactive controls; fixture database and Next navigation only.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require=createRequire(import.meta.url),root=process.cwd(),dir=mkdtempSync(path.join(tmpdir(),'mathwoods-browser-'));
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
const write=(name,source)=>{const file=path.join(dir,name);writeFileSync(file,source);return file;};
const loader=write('loader.cjs',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const navigation=write('navigation.js',`import {useMemo,useSyncExternalStore} from 'react';
export const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn)};
export const snapshot=()=>location.pathname+location.search;const router={replace:href=>{window.navigationCount=(window.navigationCount||0)+1;history.replaceState({},'',href);dispatchEvent(new PopStateEvent('popstate'));}};
export const useRouter=()=>router;export const usePathname=()=>useSyncExternalStore(subscribe,snapshot).split('?')[0];export function useSearchParams(){const href=useSyncExternalStore(subscribe,snapshot);return useMemo(()=>new URLSearchParams(href.split('?')[1]||''),[href])};`);
const db=write('db.js',`function matches(row,where){if(!where)return true;return Object.entries(where).every(([key,value])=>key==='AND'?value.every(w=>matches(row,w)):key==='OR'?value.some(w=>matches(row,w)):key==='translations'?row.translations.some(t=>matches(t,value.some)):value&&typeof value==='object'&&'in'in value?value.in.includes(row[key]):row[key]===value)};export const prisma={mathematician:{findMany:async({where})=>window.people.filter(row=>matches(row,where))}};`);
const enums=require('@prisma/client');
const client=write('enums.js',['HistoryEra','HistoryMilestoneType','LibraryReferenceRole','LibraryReferenceType','LibraryStatus','Role','ConceptStatus','QualityStatus','ProblemStatus'].map(key=>`export const ${key}=${JSON.stringify(enums[key]??{})};`).join('\n'));
const alias={
  'next/navigation':navigation,
  'next/link':write('link.js',`import React from 'react';import {useRouter} from './navigation.js';export default function Link({href,children,...props}){const router=useRouter();return React.createElement('a',{...props,href,onClick:e=>{if(!e.ctrlKey&&!e.metaKey){e.preventDefault();router.replace(href)}}},children)}`),
  '@prisma/client':client,
  '@/lib/db':db,
  '@/lib/auth':write('auth.js',`export const requireAdmin=async()=>({id:2,role:'OWNER',emailVerifiedAt:new Date()});`),
  '@/lib/i18n/server':write('locale.js',`export const getInterfaceLocale=async()=>window.locale;`),
  '@/lib/library-queries':write('queries.js',`export const visibleLibraryEntryWhere=user=>({OR:[{status:'PUBLISHED'},{createdById:user.id,status:{in:['DRAFT','PENDING_REVIEW','NEEDS_WORK']}}]});`),
  '@/components/AsyncMarkdownInline':write('markdown.js',`import React from 'react';export const AsyncMarkdownInline=({markdown})=>React.createElement('span',null,markdown);`),
  '@':root
};
const entry=write('entry.js',`import React,{useEffect,useState,useSyncExternalStore} from 'react';import {createRoot} from 'react-dom/client';import Page from '@/app/library/mathematicians/page';import {subscribe,snapshot} from './navigation.js';
function App(){const href=useSyncExternalStore(subscribe,snapshot),[tree,setTree]=useState(null);useEffect(()=>{let active=true;const params=new URLSearchParams(location.search),query={};for(const key of params.keys()){const values=params.getAll(key);query[key]=values.length>1?values:values[0]}Page({searchParams:Promise.resolve(query)}).then(tree=>{if(active)setTree(tree)}).catch(error=>{throw error});return()=>{active=false}},[href]);return tree}createRoot(document.getElementById('root')).render(React.createElement(App));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=readdirSync('.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(path.join('.next/static/css',f),'utf8')).join('\n')+'\n'+readFileSync('app/styles/68-library.css','utf8');
const browser=await chromium.launch({headless:true});mkdirSync('runtime/mathematician-browser',{recursive:true});
try {for(const locale of ['fr','en']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost:3215/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/art/')||p.startsWith('/mathematicians/'))return route.fulfill({body:readFileSync(path.join(root,'public',p)),contentType:'image/jpeg'});return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});});
  await page.goto('http://localhost:3215/library/mathematicians');
  await page.evaluate(locale=>{window.locale=locale;window.process={env:{NODE_ENV:'development'}};const t=(language,name)=>({language,displayName:name,sortName:'',teaser:'',biographyHtml:'<p>Biography</p>',contributionsHtml:''});const p=(id,name,lifespan,translations)=>({id,slug:'person-'+id,name,lifespan,aliases:[],status:'PUBLISHED',createdById:2,needsReviewAfterEdit:false,createdAt:new Date(),updatedAt:new Date(),portraitUrl:'/mathematicians/emmy-noether.jpg',translations});window.people=[p(1,'Euclid','vers 300 avant J.-C.',[t('fr','Euclide'),t('en','Euclid')]),p(2,'Emmy Noether','1882–1935',[t('fr','Emmy Noether'),t('en','Emmy Noether')]),p(3,'Leonhard Euler','1707–1783',[t('en','Leonhard Euler')]),p(4,'Carl Friedrich Gauss','1777–1855',[t('fr','Carl Friedrich Gauss')])];},locale);
  await page.addStyleTag({content:css});await page.addScriptTag({path:path.join(dir,'bundle.js')});
  await page.locator('.library-person-card').first().waitFor();
  assert.equal(await page.locator(`input[name=language][value=${locale}]`).isChecked(),true);
  assert.equal(await page.locator(`input[name=language][value=${locale==='fr'?'en':'fr'}]`).isChecked(),false);
  assert.equal(await page.locator('.library-person-card').count(),3);
  await page.screenshot({path:`runtime/mathematician-browser/${locale}-desktop.png`,fullPage:true});
  const search=page.locator('input[name=q]');await search.fill('Eucl');await page.waitForFunction(()=>document.querySelectorAll('.library-person-card').length===1);
  assert.equal(await search.evaluate(el=>el===document.activeElement),true,'Typing keeps focus after live results');
  await page.locator(`input[name=language][value=${locale==='fr'?'en':'fr'}]`).check();await page.waitForFunction(()=>new URLSearchParams(location.search).getAll('language').length===2);
  assert.equal(await page.locator('.library-person-card').count(),1,'Translations are grouped');
  await page.locator('input[name=language][value=fr]').uncheck();await page.locator('input[name=language][value=en]').uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.library-person-card').length===0);
  const reset=page.getByRole('button',{name:locale==='fr'?'Réinitialiser les filtres':'Reset filters',exact:true});await reset.click();
  await page.waitForFunction(()=>!location.search&&document.querySelectorAll('.library-person-card').length===3);
  assert.equal(await page.locator(`input[name=language][value=${locale}]`).isChecked(),true);
  await page.getByRole('combobox',{name:locale==='fr'?'Grande période':'Historical period'}).selectOption('ancient');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('era')==='ancient'&&document.querySelectorAll('.library-person-card').length===1);
  const sliders=page.getByRole('slider');assert.equal(await sliders.nth(1).inputValue(),'499');
  await sliders.nth(1).focus();await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('to')==='498');
  const sliderBox=await page.locator('.problem-difficulty-slider').boundingBox(),before=await page.evaluate(()=>window.navigationCount);
  await page.mouse.move(sliderBox.x+6,sliderBox.y+sliderBox.height/2);await page.mouse.down();await page.mouse.move(sliderBox.x+sliderBox.width*.15,sliderBox.y+sliderBox.height/2,{steps:8});
  await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.navigationCount),before,'Dragging does not navigate before release');await page.mouse.up();
  await page.waitForFunction(before=>window.navigationCount>before,before);
  await reset.click();await page.waitForFunction(()=>!location.search);
  const firstYear=page.getByRole('spinbutton',{name:locale==='fr'?'Première année':'First year'});
  await firstYear.fill('');await page.keyboard.type('1800');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('from')==='1800');
  assert.equal(await firstYear.inputValue(),'1800');
  await firstYear.fill('1');await page.keyboard.press('Enter');await page.waitForFunction(()=>new URLSearchParams(location.search).get('from')==='1');
  await sliders.first().focus();await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>new URLSearchParams(location.search).get('from')==='-1');
  await reset.click();await page.waitForFunction(()=>!location.search);
  await page.getByRole('combobox',{name:locale==='fr'?'Trier les mathématiciens':'Sort mathematicians'}).selectOption('added');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('sort')==='added');
  await page.getByRole('combobox',{name:locale==='fr'?'Trier les mathématiciens':'Sort mathematicians'}).selectOption('alphabetical');await page.waitForFunction(()=>!new URLSearchParams(location.search).has('sort'));
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:`runtime/mathematician-browser/${locale}-mobile.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{const sample=window.people[1];sample.needsReviewAfterEdit=true;for(const [id,status]of [[50,'PENDING_REVIEW'],[51,'DRAFT'],[52,'ARCHIVED']])window.people.push({...sample,id,slug:'person-'+id,status,createdById:999});});
  await page.locator('input[name=review]').check();await page.waitForFunction(()=>new URLSearchParams(location.search).get('review')==='1'&&document.querySelectorAll('.library-person-card').length===2);
  const reviewLinks=await page.locator('.library-person-card h2 a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
  assert.ok(reviewLinks.some(href=>href.includes('/person-50?')));assert.ok(reviewLinks.every(href=>!href.includes('/person-51?')&&!href.includes('/person-52?')),'Review filter does not expose private drafts or archives');
  await reset.click();await page.waitForFunction(()=>!location.search&&document.querySelectorAll('.library-person-card').length===3);
  await page.evaluate(()=>{const sample=window.people[1];for(let i=10;i<40;i++)window.people.push({...sample,id:i,slug:'person-'+i});history.replaceState({},'','/library/mathematicians?languagesSet=1&language=fr&language=en&page=2');dispatchEvent(new PopStateEvent('popstate'));});
  await page.locator('.pagination').waitFor();const previous=await page.locator('.pagination a').first().getAttribute('href');assert.deepEqual(new URL(previous,'http://localhost:3215').searchParams.getAll('language'),['fr','en']);
  const personHref=await page.locator('.library-person-card h2 a').first().getAttribute('href');const back=new URL(personHref,'http://localhost:3215').searchParams.get('returnTo');assert.equal(new URL(back,'http://localhost:3215').searchParams.get('page'),'2');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',locale,'real page, live search, languages, range dragging, keyboard, reset, sort, pagination and mobile');
}}finally{await browser.close();}
