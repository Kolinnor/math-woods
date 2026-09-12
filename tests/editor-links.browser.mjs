import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
const require=createRequire(import.meta.url), root=process.cwd(), dir=mkdtempSync(path.join(tmpdir(),'mathwoods-editor-links-'));
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
const loader=path.join(dir,'loader.cjs');
writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry=path.join(dir,'entry.js');
writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {MarkdownEditor} from '@/components/markdown/MarkdownEditor';import {MarkdownEditorLabelsProvider} from '@/components/markdown/MarkdownEditorLabelsContext';import {fr} from '@/lib/i18n/dictionaries/fr';import {en} from '@/lib/i18n/dictionaries/en';
const root=createRoot(document.getElementById('root'));let sequence=0;window.mount=(locale,value)=>root.render(React.createElement(MarkdownEditorLabelsProvider,{labels:(locale==='fr'?fr:en).markdownEditor},React.createElement('form',{onSubmit:e=>{e.preventDefault();window.submitted=true}},React.createElement(MarkdownEditor,{key:++sequence,name:'body',initialValue:value,localDrafts:false,imageUploadEnabled:false}))));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(e,s)=>e||s.hasErrors()?reject(e??new Error(s.toString({all:false,errors:true}))):resolve()));
const types=['concept','problem','mathematician','history','reference'];
const paths={concept:'/concepts/',problem:'/problems/',mathematician:'/library/mathematicians/',history:'/library/history/',reference:'/library/references/'};
const results=types.map((targetType,i)=>({targetType,slug:'euclide-'+i,title:'Euclide '+i,titleHtml:'Euclide '+i,aliases:[]}));
const builtCss=readdirSync('.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(path.join('.next/static/css',f),'utf8')).join('\n');
const css=builtCss+'\n'+readFileSync('app/styles/21-exploration-studio.css','utf8');
mkdirSync('runtime/link-search-tests',{recursive:true});
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 try {
  for(const locale of ['fr','en']) {
   const page=await browser.newPage({viewport:{width:1024,height:850}}), errors=[];let allowLibrary=true;
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://localhost:3213/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
   await page.route('**/api/editor-preferences',r=>r.fulfill({json:{}}));
   await page.route('**/api/links/suggest?*',async r=>{
    const p=new URL(r.request().url()).searchParams,q=p.get('q'),type=p.get('type');
    if(q==='failure')return r.fulfill({status:500,json:{error:'test'}});
    if(q==='slow')await new Promise(resolve=>setTimeout(resolve,450));
    const rows=q==='many'?Array.from({length:20},(_,i)=>({...results[0],slug:'many-'+i,title:'Euclide '+i,titleHtml:'Euclide '+i})) : results;
    try { await r.fulfill({json:{availableTypes:allowLibrary?types:types.slice(0,2),results:!q||q.startsWith('missing')?[]:rows.filter(row=>(type==='all'||row.targetType===type)&&(allowLibrary||['concept','problem'].includes(row.targetType)))}}); } catch { /* Aborted search. */ }
   });
   await page.goto('http://localhost:3213/');await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}});await page.addStyleTag({content:css});await page.addScriptTag({path:path.join(dir,'bundle.js')});
   async function open(value) {
    await page.evaluate(({locale,value})=>window.mount(locale,value),{locale,value});
    const content=page.locator('.cm-content');await content.waitFor();await content.click();await page.keyboard.press('ControlOrMeta+a');await content.click({button:'right'});
    await page.getByRole('dialog').waitFor();
   }
   const dialog=page.getByRole('dialog'),search=dialog.getByRole('combobox').last(),filter=dialog.locator('select');
   const add=()=>dialog.getByRole('button',{name:locale==='fr'?'Ajouter un lien':'Add link',exact:true});
   for(const [i,type] of types.entries()) {
    await open('texte $u=v$');await filter.locator('option[value="reference"]').waitFor({state:'attached'});
    assert.equal(await filter.inputValue(),'all');assert.equal(await dialog.locator('.markdown-link-menu-text input').isVisible(),false);
    await filter.selectOption(type);await search.fill('Euclide');await dialog.locator('[role=option]').first().click();
    await add().click();assert.equal(await page.locator('[name=body]').inputValue(),type==='concept'?`[[euclide-${i}|texte $u=v$]]`:`[texte $u=v$](${paths[type]}euclide-${i})`);
    // Reopening must preserve the destination while changing only its label.
    const current=await page.locator('[name=body]').inputValue();await open(current);
    await dialog.locator('.markdown-link-menu-text summary').click();await dialog.locator('.markdown-link-menu-text input').fill('Autre texte');await add().click();
    assert.equal(await page.locator('[name=body]').inputValue(),type==='concept'?`[[euclide-${i}|Autre texte]]`:`[Autre texte](${paths[type]}euclide-${i})`);
   }
   await open('les Éléments');await search.fill('missing');await page.waitForTimeout(230);assert.equal(await dialog.getByRole('link').count(),0);assert.equal(await add().isDisabled(),true);
   await filter.selectOption('concept');await dialog.getByRole('link').waitFor();await add().click();assert.equal(await page.locator('[name=body]').inputValue(),'[[missing|les Éléments]]');
   await open('texte');await filter.selectOption('concept');await search.fill('failure');await dialog.getByRole('status').filter({hasText:locale==='fr'?'échoué':'failed'}).waitFor();assert.equal(await dialog.getByRole('link').count(),0);assert.equal(await add().isDisabled(),true);
   await search.fill('slow');await page.waitForTimeout(200);await search.fill('missing');await page.waitForTimeout(550);assert.equal(await dialog.locator('[role=option]').count(),0);
   await filter.selectOption('all');await search.fill('many');await dialog.locator('[role=option]').nth(19).waitFor({state:'attached'});
   for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:850});await page.waitForTimeout(120);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    const menuBox=await dialog.boundingBox(), footerBox=await dialog.locator('.markdown-link-menu-actions').boundingBox();
    assert.ok(footerBox.y+footerBox.height<=menuBox.y+menuBox.height, 'Footer must remain visible without scrolling the entire menu');
    assert.ok(await dialog.locator('[role=listbox]').evaluate(el=>el.clientHeight<=parseFloat(getComputedStyle(el.firstElementChild).height)*5+1));
    await dialog.locator('.field-help').first().hover();await page.waitForTimeout(140);assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(engineName==='chromium')await page.screenshot({path:`runtime/link-search-tests/${locale}-${width}.png`});
   }
   await page.setViewportSize({width:1024,height:850});await search.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await dialog.locator('.markdown-link-menu-selected').count(),1);await page.keyboard.press('Enter');assert.equal(await dialog.count(),0);
   allowLibrary=false;await open('texte');await page.waitForTimeout(220);assert.equal(await filter.locator('option').count(),3);await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
   assert.equal(await page.evaluate(()=>window.submitted??false),false);assert.deepEqual(errors,[]);
   console.log(`PASS ${engineName} ${locale}: five destinations, editing, keyboard, permissions, errors, stale results and compact responsive menu`);await page.close();
  }
 } finally {await browser.close();}
}
