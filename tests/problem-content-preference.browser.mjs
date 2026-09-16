import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, webkit } from '@playwright/test';
import { parseProblemContentTypes, rememberedProblemContentTypes, problemContentTypesCookieName } from '../lib/problem-content-types.ts';

const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-problem-preference-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
writeFileSync(path.join(dir, 'navigation.js'), `export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);const router={replace:url=>location.assign(url)};export const useRouter=()=>router;`);
writeFileSync(path.join(dir, 'entry.js'), `
import React from 'react';import {createRoot} from 'react-dom/client';
import {LiveSearchForm} from '@/components/LiveSearchForm';
import {RememberProblemContentTypes} from '@/components/RememberProblemContentTypes';
const config=window.initialFilter;
createRoot(document.getElementById('root')).render(React.createElement(LiveSearchForm,{persistKey:'problems:'+config.userId,debounceMs:20,resetLabel:'Reset'},
 React.createElement(RememberProblemContentTypes,{cookieName:config.cookieName,selected:config.selected},
  ['problem','exercise'].map(value=>React.createElement('label',{key:value},value,React.createElement('input',{name:'contentType',type:'checkbox',value,defaultChecked:config.selected.includes(value)})))
 ),React.createElement('input',{name:'q',defaultValue:new URLSearchParams(location.search).get('q')??''})
));
`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root,'next/navigation':path.join(dir,'navigation.js')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(dir,'loader.cjs')}]}},(e,s)=>e||s.hasErrors()?reject(e??Error(s.toString({all:false,errors:true}))):resolve()));
const bundle=readFileSync(path.join(dir,'bundle.js'),'utf8');
let userId=7;
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle);return;}
 const cookieName=problemContentTypesCookieName(userId),cookies=request.headers.cookie??'';
 const saved=cookies.split(/;\s*/).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 const selected=parseProblemContentTypes(url.searchParams.has('contentType')?url.searchParams.getAll('contentType'):undefined,rememberedProblemContentTypes(saved,['problem']));
 response.setHeader('Content-Type','text/html');response.setHeader('Cache-Control','no-store');
 response.end(`<div id="root" data-initial-types="${selected.join(',')}"></div><script>window.initialFilter=${JSON.stringify({userId,cookieName,selected})}</script><script src="/bundle.js"></script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;

try {
for(const browserType of [chromium,webkit]) {
 const browser=await browserType.launch({headless:true});
 let context;
 try {
  userId=7;
  const openContext=async storageState=>{
   const ctx=await browser.newContext({storageState});
   return ctx;
  };
  context=await openContext();let page=await context.newPage();
  await page.goto(`${base}/problems`);
  await page.locator('[value=exercise]').check();
  await page.waitForURL(/contentType=exercise/);
  await page.locator('[value=exercise]').waitFor();
  const cookie=(await context.cookies()).find(c=>c.name===problemContentTypesCookieName(7));
  assert.equal(cookie.value,'problem.exercise');assert.ok(cookie.expires>Date.now()/1000+300*86400);
  // Simulate leaving the browser: only durable cookies survive, no sessionStorage.
  const state=await context.storageState();await context.close();context=await openContext(state);page=await context.newPage();
  await page.goto(`${base}/problems`);await page.locator('[value=exercise]').waitFor();
  assert.equal(await page.locator('#root').getAttribute('data-initial-types'),'problem,exercise');
  assert.equal(await page.locator('[value=problem]').isChecked(),true);assert.equal(await page.locator('[value=exercise]').isChecked(),true);
  await page.locator('[value=problem]').uncheck();await page.waitForURL(/contentType=exercise/);await page.locator('[value=problem]').waitFor();
  await page.getByRole('button',{name:'Reset'}).click();await page.waitForURL(`${base}/problems`);await page.locator('[value=exercise]').waitFor();
  assert.equal(await page.locator('[value=problem]').isChecked(),false);assert.equal(await page.locator('[value=exercise]').isChecked(),true);
  await page.locator('[value=exercise]').click();assert.equal(await page.locator('[value=exercise]').isChecked(),true,'at least one type stays selected');
  await page.goto(`${base}/problems?contentType=problem`);await page.locator('[value=problem]').waitFor();
  assert.equal(await page.locator('[value=exercise]').isChecked(),false,'explicit URL beats remembered filter');
  userId=8;await page.goto(`${base}/problems`);await page.locator('[value=problem]').waitFor();
  assert.equal(await page.locator('#root').getAttribute('data-initial-types'),'problem','accounts have separate preferences');
  console.log(`PASS ${browserType.name()}: new session, server selection, checkbox state, reset, explicit URL, account isolation`);
 } finally {await context?.close();await browser.close();}
}
} finally {await new Promise(resolve=>server.close(resolve));}
