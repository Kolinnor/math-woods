import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { isSitePresenceId } from '../lib/site-presence-config.ts';

const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-client-runtime-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader = path.join(dir, 'loader.cjs');
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2018}}).outputText;`);
writeFileSync(path.join(dir, 'entry.js'), `import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {SitePresenceHeartbeat} from '@/components/SitePresenceHeartbeat';import {ErrorReporter} from '@/components/ErrorReporter';
function Ready(){useEffect(()=>{window.ready=true},[]);return React.createElement('p',null,'Page usable')}
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(ErrorReporter),React.createElement(SitePresenceHeartbeat),React.createElement(Ready)));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true});
  try {
    for (const mode of ['native','legacy','storage-blocked','crypto-blocked']) {
      const context=await browser.newContext(), page=await context.newPage(), reports=[], presence=[], errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('http://localhost:3211/**',async route=>{
        const request=route.request();
        if(request.url().endsWith('/api/presence'))presence.push(request.headers()['x-math-woods-presence']);
        if(request.url().endsWith('/api/error-reports'))reports.push(request.postDataJSON());
        await route.fulfill({contentType:request.method()==='POST'?'application/json':'text/html',body:request.method()==='POST'?'{}':'<div id="root"></div>'});
      });
      await context.addInitScript(mode=>{
        window.process={env:{NODE_ENV:'development'}};
        if(mode!=='native')Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
        if(mode==='crypto-blocked')Object.defineProperty(Crypto.prototype,'getRandomValues',{value:undefined,configurable:true});
        if(mode==='storage-blocked')Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage denied')}});
        Object.defineProperty(navigator,'sendBeacon',{value(){throw new Error('Beacon denied')}});
      },mode);
      await page.goto('http://localhost:3211/');
      await page.addScriptTag({path:path.join(dir,'bundle.js')});
      await page.waitForFunction(()=>window.ready);
      assert.equal(await page.getByText('Page usable').count(),1);
      if(mode!=='crypto-blocked') {
        await expect.poll(()=>presence.length).toBe(1);
        assert.ok(isSitePresenceId(presence[0]));
        await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
        await expect.poll(()=>presence.length).toBe(2);
        assert.ok(presence.length>=2);assert.equal(new Set(presence).size,1);
      } else assert.equal(presence.length,0);
      await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Script error.',filename:'https://third-party.invalid/script.js',lineno:0,colno:0})));
      await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'RangeError: Maximum call stack size exceeded.',error:{message:'Maximum call stack size exceeded',stack:'@\nPk@\nNk@'},filename:'https://mathwoods.org/concepts?token=private#secret',lineno:415,colno:45})));
      await expect.poll(()=>reports.length).toBe(1);
      assert.equal(reports.length,1);assert.match(reports[0].stack,/Pk@\nNk@/);assert.match(reports[0].stack,/concepts:415:45/);assert.doesNotMatch(reports[0].stack,/private|secret/);
      // Synthetic ErrorEvent can be surfaced by the browser; a tracking failure must not be.
      assert.equal(errors.filter(e=>!/Maximum call stack|Script error\./.test(e)).length,0);
      console.log(`PASS ${name} ${mode}: page survives, presence stays stable, anonymous error gains a safe location`);
      await context.close();
    }
  } finally {await browser.close();}
}
