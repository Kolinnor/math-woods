import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require=createRequire(import.meta.url), root=process.cwd();
const dir=mkdtempSync(path.join(tmpdir(),'mathwoods-portraits-'));
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
const loader=path.join(dir,'loader.cjs');
writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry=path.join(dir,'entry.js');
writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {PortraitFields} from '@/components/library/PortraitFields';import {PortraitImage} from '@/components/library/PortraitImage';
const root=createRoot(document.getElementById('root'));let seq=0;window.mount=(locale,values={portraitUrl:'/portrait.svg',imageCredit:'Museum',imageCreditUrl:'https://example.org',imageLicense:'CC BY'})=>root.render(React.createElement('form',{key:++seq,className:'library-entry-form',onSubmit:e=>{e.preventDefault();window.saved=Object.fromEntries(new FormData(e.currentTarget));}},React.createElement(PortraitFields,{locale,values}),React.createElement('button',{type:'submit'},'Save')));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(e,s)=>e||s.hasErrors()?reject(e??new Error(s.toString({all:false,errors:true}))):resolve()));
const browser=await chromium.launch({headless:true});
mkdirSync('runtime/portrait-tests',{recursive:true});
try {
 for (const locale of ['fr','en']) for (const width of [900,390]) {
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:3211/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.route('**/portrait.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#d8e6d5"/><circle cx="400" cy="220" r="100" fill="#42684b"/><rect x="240" y="340" width="320" height="260" rx="100" fill="#42684b"/></svg>'}));
  await page.route('**/broken.png',r=>r.fulfill({status:404,body:''}));
  await page.goto('http://localhost:3211/');await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}});await page.addScriptTag({path:path.join(dir,'bundle.js')});
  await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:12px;font-family:Arial;background:#f7f5ed;color:#253529}button,input,textarea{font:inherit;padding:8px}input,textarea{max-width:100%}:root{--mw-border:#b7c8b8;--panel-muted:#edf2e9;--mw-secondary:#556657;--mw-green:#267542}'+readFileSync('app/styles/68-library.css','utf8')});
  await page.evaluate(locale=>window.mount(locale),locale);
  await page.getByRole('slider',{name:'Zoom'}).waitFor();
  const crop=page.locator('.library-portrait-crop');const details=page.locator('.library-portrait-details');
  assert.equal(await details.getAttribute('open'),null);
  const box=await crop.boundingBox(), dbox=await details.boundingBox();assert.ok(dbox.x>=box.x+box.width);assert.ok(Math.abs(box.width/box.height-0.8)<0.01);
  await details.locator('summary').click();assert.equal(await details.locator('textarea').count(),1);
  assert.equal(await details.locator('textarea').inputValue(),'Museum\nhttps://example.org\nCC BY');
  await page.getByRole('slider').fill('2');await crop.focus();await page.keyboard.press('ArrowLeft');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10);await page.mouse.up();
  const changed=JSON.parse(await page.locator('[name=portraitCrop]').inputValue());assert.equal(changed.zoom,2);assert.ok(changed.x<52);assert.ok(changed.y<50);
  await page.getByRole('button',{name:'Save',exact:true}).click();const saved=await page.evaluate(()=>window.saved);
  await page.evaluate(({locale,saved})=>window.mount(locale,{portraitUrl:saved.imageUrl,portraitCrop:JSON.parse(saved.portraitCrop),portraitDetails:saved.portraitDetails}),{locale,saved});
  await page.getByRole('slider').waitFor();assert.deepEqual(JSON.parse(await page.locator('[name=portraitCrop]').inputValue()),changed);
  await page.getByRole('button',{name:locale==='fr'?'Réinitialiser':'Reset',exact:true}).click();assert.deepEqual(JSON.parse(await page.locator('[name=portraitCrop]').inputValue()),{x:50,y:50,zoom:1});
  await page.screenshot({path:`runtime/portrait-tests/${locale}-${width}.png`,fullPage:true});
  await page.locator('[name=imageUrl]').fill('/broken.png');await page.getByText(locale==='fr'?'Impossible de charger ce portrait. Vérifiez le lien.':'Unable to load this portrait. Check the URL.').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS portrait preview, drag, keyboard, zoom, saved framing, reset, details and broken URL',locale,width);await context.close();
 }
} finally {await browser.close();}
