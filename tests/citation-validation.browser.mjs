// Exercise the real shared form without touching a database or production.
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-citation-validation-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader = path.join(dir, 'loader.cjs');
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry = path.join(dir, 'entry.js');
writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
import {ProblemCitationEditor} from '@/components/ProblemCitationEditor';
import {ProblemDetailsDisclosure} from '@/components/ProblemDetailsDisclosure';
const root=createRoot(document.getElementById('root'));let sequence=0;
window.mount=(locale,contentType)=>{const editor=React.createElement(ProblemCitationEditor,{initial:[],draftKey:'mw-citations:test',locale,contentType});root.render(React.createElement('form',{key:++sequence,onSubmit:e=>{e.preventDefault();window.submissions++;}},contentType==='problem'?React.createElement(ProblemDetailsDisclosure,{label:locale==='fr'?'Ajouter des détails':'Add details'},editor):editor,React.createElement('button',{type:'submit'},'Submit')));};window.submissions=0;`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const browser=await chromium.launch({headless:true});
try {
  for (const kind of ['problem','concept']) for (const locale of ['fr','en']) {
    const context=await browser.newContext();
    await context.addInitScript(()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true}));
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost:3211/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://localhost:3211/');
    await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}});
    await page.addScriptTag({path:path.join(dir,'bundle.js')});
    await page.evaluate(({locale,kind})=>window.mount(locale,kind),{locale,kind});
    await page.waitForFunction(()=>document.querySelector('[name=citationDraftToken]')?.value);
    const title=page.locator('fieldset textarea').first();
    const submit=page.getByRole('button',{name:'Submit',exact:true});
    await submit.click();assert.equal(await page.evaluate(()=>window.submissions),1);
    const details=page.getByRole('button',{name:locale==='fr'?'Ajouter des détails':'Add details',exact:true});
    if(kind==='problem') {
      assert.equal(await title.isVisible(),false);
      await details.click();
    }
    await page.locator('fieldset summary').click();
    await page.locator('fieldset textarea').nth(1).fill('Livre I, proposition 10');
    await title.fill('   ');
    if(kind==='problem') await details.click();
    await submit.click();assert.equal(await page.evaluate(()=>window.submissions),1);
    if(kind==='problem') {
      assert.equal(await details.getAttribute('aria-expanded'),'true');
      assert.equal(await title.isVisible(),true);
      assert.equal(await title.evaluate(el=>el===document.activeElement),true);
    }
    assert.match(await title.evaluate(el=>el.validationMessage),locale==='fr'?/Indiquez la référence/:/Enter the reference/);
    // The incomplete draft remains recoverable after remounting the editor.
    await page.evaluate(({locale,kind})=>window.mount(locale,kind),{locale,kind});
    await page.waitForFunction(()=>document.querySelector('fieldset textarea')?.value==='   ');
    await submit.click();assert.equal(await page.evaluate(()=>window.submissions),1);
    await title.fill('Euclide — Éléments');
    await submit.click();assert.equal(await page.evaluate(()=>window.submissions),2);
    const data=JSON.parse(await page.locator(`[name=${kind}Citations]`).inputValue());
    assert.equal(data[0].note,'Livre I, proposition 10');
    if(kind==='problem') {
      await details.click();
      await submit.click();assert.equal(await page.evaluate(()=>window.submissions),3);
      assert.equal(JSON.parse(await page.locator('[name=problemCitations]').inputValue())[0].text,'Euclide — Éléments');
      await details.click();
    }
    await title.fill('');
    await page.locator('fieldset button').first().click();
    await submit.click();assert.equal(await page.evaluate(()=>window.submissions),kind==='problem'?4:3);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${kind} ${locale}: optional empty row, details-only validation, draft restoration, correction and removal`);
    await context.close();
  }
} finally { await browser.close(); }
