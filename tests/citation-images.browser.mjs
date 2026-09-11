// Render the real shared reader, with no database and no external image requests.
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-citation-images-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader = path.join(dir, 'loader.cjs');
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry = path.join(dir, 'entry.js');
writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
import {ProblemCitations} from '@/components/ProblemCitations';
import {withCitationImages} from '@/lib/citation-images';
import {visibleProblemCitations} from '@/lib/problem-citations';
const root=createRoot(document.getElementById('root'));
window.mount=(locale,reveal)=>{const citations=[1,2,3].map(id=>({citationKey:'ref-'+id,referenceId:id,text:['Phil Caldero','Math Woods','Hidden solution'][id-1],url:null,locator:null,note:'Details of reference '+id,role:'SOURCE',isPrimary:id===1,spoiler:id===3}));
const links=citations.map(c=>({reference:{id:c.referenceId,status:'PUBLISHED',iconUrl:'http://localhost:3212/image-'+c.referenceId+'.svg',iconSize:130,imageAlt:'',imageCredit:'Image author',imageCreditUrl:'https://example.org/credit',imageLicense:'CC BY'}}));
root.render(React.createElement(ProblemCitations,{key:locale+reveal,citations:withCitationImages(visibleProblemCitations(citations,reveal),links),locale,exportHref:'/export'}));};`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=readFileSync(path.join(root,'app/styles/69-problem-references.css'),'utf8')+readFileSync(path.join(root,'app/styles/68-library.css'),'utf8');
const browser=await chromium.launch({headless:true});
try {
  for (const width of [390,1280]) for (const locale of ['fr','en']) {
    const page=await browser.newPage({viewport:{width,height:800}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost:3212/**',r=>r.request().url().endsWith('.svg')
      ?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130"><rect width="130" height="130" fill="#276749"/></svg>'})
      :r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://localhost:3212/');
    await page.addStyleTag({content:css});
    await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}});
    await page.addScriptTag({path:path.join(dir,'bundle.js')});
    await page.evaluate(locale=>window.mount(locale,false),locale);
    const first=page.locator('img').first();await first.waitFor();
    assert.equal(await page.locator('img').count(),2);
    assert.equal(await first.isVisible(),true);
    assert.equal(await page.locator('img').nth(1).isVisible(),false);
    assert.equal((await first.boundingBox()).width,56);
    assert.ok(!(await page.content()).includes('image-3.svg'));
    assert.ok(!(await page.locator('#root').textContent()).includes('Hidden solution'));
    await page.locator('.problem-citations-details > summary').click();
    assert.equal(await page.locator('img').nth(1).isVisible(),true);
    await page.locator('.library-image-credit > summary').first().click();
    assert.equal(await page.getByRole('link',{name:'Image author'}).first().isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(locale=>window.mount(locale,true),locale);
    await page.waitForFunction(()=>document.querySelectorAll('img').length===3);
    await page.locator('.problem-citations-details > summary').click();
    assert.equal(await page.locator('img').nth(2).isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${locale} ${width}px: thumbnail, collapsed details, credits and spoiler filtering`);
    await page.close();
  }
} finally { await browser.close(); }
