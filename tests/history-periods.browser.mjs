import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require=createRequire(import.meta.url),root=process.cwd(),dir=mkdtempSync(path.join(tmpdir(),'mathwoods-history-periods-'));
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
const loader=path.join(dir,'loader.cjs');
writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry=path.join(dir,'entry.js');
writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {HistoryMilestoneForm} from '@/components/library/HistoryMilestoneForm';import {MarkdownEditorLabelsProvider} from '@/components/markdown/MarkdownEditorLabelsContext';import {fr} from '@/lib/i18n/dictionaries/fr';import {en} from '@/lib/i18n/dictionaries/en';
const root=createRoot(document.getElementById('root'));let key=0;window.mount=(locale,values)=>root.render(React.createElement(MarkdownEditorLabelsProvider,{labels:(locale==='fr'?fr:en).markdownEditor},React.createElement(HistoryMilestoneForm,{key:++key,locale,values,options:{mathematicians:[],references:[],concepts:[]},action:async (_state,data)=>{window.saved=Object.fromEntries(data);return {error:window.failSave?'Erreur de validation':''};}})));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(e,s)=>e||s.hasErrors()?reject(e??new Error(s.toString({all:false,errors:true}))):resolve()));
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
mkdirSync('runtime/history-periods',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  for(const locale of ['fr','en']) {
    const page=await browser.newPage({viewport:{width:1000,height:950}});let fileChoosers=0;
    page.on('filechooser',()=>fileChoosers++);
    await page.route('http://localhost:3215/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.route('**/api/editor-preferences',r=>r.fulfill({json:{}}));
    await page.goto('http://localhost:3215');await page.addStyleTag({content:css});await page.addScriptTag({path:path.join(dir,'bundle.js')});
    await page.evaluate(locale=>window.mount(locale,{sortYear:-323,translation:{title:'Mathématiques hellénistiques',yearLabel:'323–31',summaryMarkdown:'Texte $u=v$'}}),locale);
    const type=page.locator('[name=milestoneType]'),end=page.locator('[name=endYear]');
    await type.waitFor();assert.equal(await end.isVisible(),false);
    await type.selectOption('PERIOD');assert.equal(await end.isVisible(),true);
    assert.equal(await end.getAttribute('required'),null);
    assert.equal(await end.getAttribute('min'),'-323');
    assert.ok(await page.getByText(locale==='fr'?'Présentation de la période':'Period overview',{exact:true}).isVisible());
    assert.equal(await page.locator('details.library-form-section').first().getAttribute('open'),null);
    await end.fill('-400');assert.equal(await end.evaluate(el=>el.checkValidity()),false);
    await end.fill('-31');
    await type.selectOption('DISCOVERY');assert.equal(await end.isVisible(),false);
    await type.selectOption('PERIOD');assert.equal(await end.inputValue(),'-31');
    await page.locator('.cm-content').first().click();assert.equal(fileChoosers,0);
    await page.locator('button[name=intent][value=draft]').click();
    await page.waitForFunction(()=>window.saved);
    let saved=await page.evaluate(()=>window.saved);
    assert.equal(saved.endYear,'-31');assert.equal(saved.sortYear,'-323');assert.equal(saved.summaryMarkdown,'Texte $u=v$');
    await page.evaluate(({locale,saved})=>window.mount(locale,{milestoneType:'PERIOD',sortYear:Number(saved.sortYear),endYear:Number(saved.endYear),translation:{title:saved.title,yearLabel:saved.yearLabel,summaryMarkdown:saved.summaryMarkdown}}),{locale,saved});
    await page.waitForTimeout(100);
    assert.equal(await end.inputValue(),'-31');assert.equal(await type.inputValue(),'PERIOD');
    for(const width of [1000,390]) {
      await page.setViewportSize({width,height:950});
      await page.locator('[name=title]').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const help=page.locator('.history-milestone-form .field-help').first();
      await help.focus();
      assert.ok(await help.evaluate(el=>{
        const style=getComputedStyle(el,'::after'),label=el.closest('.field-label-with-help').getBoundingClientRect();
        return label.left+parseFloat(style.width)<=innerWidth;
      }));
      await help.blur();
      await page.screenshot({path:`runtime/history-periods/${locale}-${width}.png`});
    }
    const imageSection=page.locator('.library-landscape-fields');
    assert.equal(await imageSection.locator('details').getAttribute('open'),null);
    let releaseUpload;
    await page.route('**/api/images/upload',async route=>{
      await new Promise(resolve=>{releaseUpload=resolve;});
      await route.fulfill({json:{image:{publicUrl:'https://example.com/history.png'}}});
    });
    await page.route('https://example.com/history.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9woAAAAASUVORK5CYII=','base64')}));
    await imageSection.locator('input[type=file]').setInputFiles({name:'history.png',mimeType:'image/png',buffer:Buffer.from('test upload')});
    await page.waitForFunction(()=>document.querySelector('button[name=intent][value=submit]').disabled);
    while(!releaseUpload)await new Promise(resolve=>setTimeout(resolve,10));
    releaseUpload();
    await page.waitForFunction(()=>document.querySelector('input[name=imageUrl]').value==='https://example.com/history.png');
    assert.equal(await page.locator('button[name=intent][value=submit]').isEnabled(),true);
    const preview=imageSection.locator('.library-landscape-preview');
    const previewBox=await preview.boundingBox();assert.ok(Math.abs(previewBox.width/previewBox.height-16/9)<0.02);
    assert.equal(await preview.locator('img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
    await imageSection.locator('details > summary').click();
    await imageSection.locator('[name=imageCredit]').fill('Auteur');
    await imageSection.locator('[name=imageLicense]').fill('CC BY');
    await page.evaluate(()=>{window.saved=null;});
    await page.locator('button[name=intent][value=submit]').click();
    await page.waitForFunction(()=>window.saved);
    const imageSaved=await page.evaluate(()=>window.saved);
    assert.equal(imageSaved.imageUrl,'https://example.com/history.png');assert.equal(imageSaved.imageCredit,'Auteur');assert.equal(imageSaved.imageLicense,'CC BY');
    await page.evaluate(()=>{window.failSave=true;window.saved=null;});
    await page.locator('button[name=intent][value=submit]').click();
    await page.getByRole('alert').waitFor();
    for(const name of ['title','yearLabel','sortYear','endYear','imageUrl','imageCredit','imageLicense']) assert.equal(await page.locator(`[name="${name}"]`).inputValue(),imageSaved[name],`Failed save preserves ${name}`);
    assert.equal(await page.locator('[name=summaryMarkdown]').inputValue(),imageSaved.summaryMarkdown);
    await page.evaluate(()=>{window.failSave=false;window.saved=null;});
    await page.locator('button[name=intent][value=submit]').click();
    await page.waitForFunction(()=>window.saved);
    await page.getByRole('alert').waitFor({state:'detached'});
    await page.screenshot({path:`runtime/history-periods/${locale}-image.png`,fullPage:true});
    await end.fill('');await page.evaluate(()=>window.saved=null);
    await page.locator('button[name=intent][value=draft]').click();await page.waitForFunction(()=>window.saved);
    assert.equal((await page.evaluate(()=>window.saved)).endYear,'');
    console.log(`PASS ${locale}: type switch, dates, validation, text preservation, submission, reopening and responsive layout`);
    await page.close();
  }
}finally{await browser.close();}
