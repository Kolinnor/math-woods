import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit,expect} from '@playwright/test';
import {renderMarkdown} from '../lib/markdown.ts';
import nextConfig from '../next.config.mjs';

const require=createRequire(import.meta.url), root=process.cwd();
const dir=mkdtempSync(path.join(tmpdir(),'mathwoods-html-figures-'));
const webpack=require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader=path.join(dir,'loader.cjs');
writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2018}}).outputText;`);
writeFileSync(path.join(dir,'entry.js'),`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {JsxGraphMarkdown} from '@/components/JsxGraphMarkdown';const root=createRoot(document.getElementById('root'));window.showFigure=html=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(JsxGraphMarkdown,{html}))));`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js',publicPath:'http://localhost:3337/'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const headers=Object.fromEntries((await nextConfig.headers()).find(rule=>rule.source==='/(.*)').headers.map(({key,value})=>[key,value]));
const fence=source=>'```jsxgraph\n'+source+'\n```';
const example=`<!doctype html><html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css"><style>#box{height:300px;width:100%}body{color:rgb(10,20,30)}</style></head><body>
<div id="box"></div><button id="move">Move</button><output id="value">1</output>
<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraphcore.js"></script>
<script>const board=JXG.JSXGraph.initBoard('box',{boundingbox:[-5,5,5,-5],axis:true,showCopyright:false,showNavigation:false});const point=board.create('point',[1,2]);document.getElementById('move').onclick=()=>{point.moveTo([3,1]);document.getElementById('value').textContent=point.X()};</script></body></html>`;
const rendered=await renderMarkdown(fence(example));

for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true});
  try {
    const context=await browser.newContext(), page=await context.newPage(), apiRequests=[], browserErrors=[];
    page.on('pageerror',error=>browserErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text())});
    context.setDefaultTimeout(15000);
    await context.addCookies([{name:'session-test',value:'private',url:'http://localhost:3337/'}]);
    await page.route('http://localhost:3337/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname.startsWith('/api/'))apiRequests.push(pathname);
      const file=path.join(dir,path.basename(pathname));
      if(pathname.endsWith('.js'))return route.fulfill({headers,contentType:'text/javascript',body:readFileSync(file)});
      return route.fulfill({headers,contentType:'text/html',body:'<!doctype html><html style="color-scheme:light"><body><p id="outside">Page intact</p><div id="root"></div><script src="/bundle.js"></script></body></html>'});
    });
    await page.route('https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/**',async route=>{
      const file=path.basename(new URL(route.request().url()).pathname);
      await route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(path.join(root,'node_modules/jsxgraph/distrib',file))});
    });
    await page.goto('http://localhost:3337/');
    await page.waitForFunction(()=>typeof window.showFigure==='function');
    const show=async html=>{await page.evaluate(html=>window.showFigure(html),html)};
    const ready=async count=>{try {await expect(page.locator('[data-jsxgraph-state="ready"]')).toHaveCount(count,{timeout:15000})} catch(error) {console.log('Mount diagnostics:',await page.locator('#root').innerText(),await page.locator('.jsxgraph-embed').evaluateAll(nodes=>nodes.map(n=>({state:n.dataset.jsxgraphState,busy:n.getAttribute('aria-busy'),frames:n.querySelectorAll('iframe').length}))),page.frames().map(f=>f.url()),browserErrors.slice(-8));throw error}};
    await show(rendered+rendered);
    await ready(2);
    const first=page.frameLocator('iframe').nth(0), second=page.frameLocator('iframe').nth(1);
    await expect(first.locator('#box svg')).toHaveCount(1);
    await first.locator('#move').click();
    await expect(first.locator('#value')).toHaveText('3');
    await expect(second.locator('#value')).toHaveText('1');
    assert.equal(await page.locator('iframe').first().getAttribute('sandbox'),'allow-scripts');
    await page.setViewportSize({width:320,height:800});
    await page.evaluate(()=>document.documentElement.style.colorScheme='dark');
    await expect.poll(()=>first.locator('html').evaluate(node=>getComputedStyle(node).colorScheme)).toBe('dark');
    assert.ok((await page.locator('iframe').first().boundingBox()).width<=320);
    // Reinsert an identical placeholder without changing the component's html prop.
    await page.evaluate(markup=>document.querySelector('.jsxgraph-embed').outerHTML=markup,rendered);
    await ready(2);
    await expect(first.locator('#value')).toHaveText('1');
    console.log(`PASS ${name}: HTML/CSS/scripts, callbacks, duplicate IDs, mobile, theme, refresh`);

    const hostile=`<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'">
<p id="sandbox">Checking</p><form action="http://localhost:3337/api/form" method="post"><button id="submit">Send</button></form>
<script>(async()=>{const checks={};for(const [key,read] of Object.entries({parent:()=>parent.document.body,storage:()=>localStorage.getItem('private')})){try{read();checks[key]=false}catch{checks[key]=true}}
try{checks.cookie=document.cookie===''}catch{checks.cookie=true}
try{await fetch('http://localhost:3337/api/figure-probe',{method:'POST',credentials:'include'});checks.fetch=false}catch{checks.fetch=true}
try{top.location.href='http://localhost:3337/escaped';checks.top=false}catch{checks.top=true}
try{checks.popup=window.open('http://localhost:3337/escaped')===null}catch{checks.popup=true}
document.getElementById('sandbox').textContent=JSON.stringify(checks);})();</script>`;
    await show(await renderMarkdown(fence(hostile)));
    await ready(1);
    const sandbox=page.frameLocator('iframe');
    await expect(sandbox.locator('#sandbox')).toContainText('popup');
    assert.deepEqual(JSON.parse(await sandbox.locator('#sandbox').textContent()),{parent:true,cookie:true,storage:true,fetch:true,top:true,popup:true});
    await sandbox.locator('#submit').click();
    await page.evaluate(()=>window.postMessage({channel:'mathwoods-figure',type:'error',message:'Forged parent message'},'*'));
    await expect(page.locator('.jsxgraph-error')).toHaveCount(0);
    assert.deepEqual(apiRequests,[]);
    assert.equal(page.url(),'http://localhost:3337/');
    await expect(page.locator('#outside')).toHaveText('Page intact');
    console.log(`PASS ${name}: DOM/cookies/storage/API/forms/top navigation/popups isolated; forged messages ignored`);

    await show(await renderMarkdown(fence('<script>throw new Error("Broken figure");</script>')));
    // WebKit can redact errors from the opaque-origin document to "Script error.".
    await expect(page.locator('.jsxgraph-error')).toContainText(/Broken figure|Script error\./);
    await expect(page.locator('iframe')).toHaveCount(0);
    await show(await renderMarkdown(fence('<button id="bad">Fail</button><script>document.getElementById("bad").onclick=()=>{throw new Error("Later error")};</script>')));
    await ready(1);
    await page.frameLocator('iframe').locator('#bad').click();
    await expect(page.locator('.jsxgraph-error')).toContainText(/Later error|Script error\./);
    await show(await renderMarkdown(fence('{"elements":[{"type":"point","parents":[0,0]}]}')));
    await ready(1);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('.jsxgraph-board svg')).toHaveCount(1);
    console.log(`PASS ${name}: initial/runtime errors are local; existing JSON boards still render`);

    await show(rendered);
    await ready(1);
    const old=page.frames().find(frame=>frame.parentFrame());
    await show('');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect.poll(()=>old.isDetached()).toBe(true);
    // A pending external script must not restore its removed holder later.
    await page.route('https://cdn.jsdelivr.net/slow-figure.js',async route=>{
      await new Promise(resolve=>setTimeout(resolve,300));
      try {await route.fulfill({contentType:'text/javascript',body:'window.slow=true;'})} catch {}
    });
    await show(await renderMarkdown(fence('<script src="https://cdn.jsdelivr.net/slow-figure.js"></script>')));
    await expect(page.locator('iframe')).toHaveCount(1);
    await show(rendered);
    await ready(1);
    await expect(page.locator('.jsxgraph-error')).toHaveCount(0);
    console.log(`PASS ${name}: mounted and pending figures are disposed on replacement/removal`);

    if(process.env.MW_JSXGRAPH_HTML_FIXTURE) {
      const source=readFileSync(process.env.MW_JSXGRAPH_HTML_FIXTURE,'utf8');
      await page.setViewportSize({width:1000,height:1000});
      await show(await renderMarkdown(source.startsWith('```')?source:fence(source)));
      await ready(1);
      const figure=page.frameLocator('iframe');
      await expect(figure.locator('#tore-board svg')).toHaveCount(1);
      await expect(figure.locator('input[type="checkbox"]')).toHaveCount(0);
      await figure.locator('#tore-green-play').click();
      await expect(figure.locator('#tore-green-value')).toHaveText('100 %',{timeout:10000});
      await figure.locator('#tore-red-play').click();
      await expect(figure.locator('#tore-red-play')).toHaveText('Pause du rouge');
      await figure.locator('#tore-red-play').click();
      await page.screenshot({path:path.join(dir,`${name}-pasted-figure.png`)});
      console.log(`PASS ${name}: supplied complete HTML torus pasted verbatim; both animations work; no checkbox`);
    }
    await context.close();
  } finally {await browser.close();}
}
console.log('Browser verification artifacts: '+dir);
