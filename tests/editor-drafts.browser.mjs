// Real CodeMirror/React regression; no database or production account required.
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-drafts-'));
const webpackBundle = require('next/dist/compiled/webpack/webpack'); webpackBundle.init();
const loader = path.join(dir, 'loader.cjs');
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry = path.join(dir, 'entry.js');
writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
import {MarkdownEditor} from '@/components/markdown/MarkdownEditor';
import {DraftTextInput} from '@/components/DraftTextInput';
import {MarkdownEditorLabelsProvider} from '@/components/markdown/MarkdownEditorLabelsContext';
import {fr} from '@/lib/i18n/dictionaries/fr';import {en} from '@/lib/i18n/dictionaries/en';
const root=createRoot(document.getElementById('root'));let sequence=0;
window.mount=({source='Version initiale',signal=1000,locale='fr',kind='concept',remount=true}={})=>root.render(React.createElement(MarkdownEditorLabelsProvider,{labels:(locale==='fr'?fr:en).markdownEditor},React.createElement('form',{key:remount?++sequence:sequence,onSubmit:event=>{event.preventDefault();window.receipts=new FormData(event.currentTarget).getAll('editorDraftReceipt').map(JSON.parse);}},
React.createElement(MarkdownEditor,{name:'bodyMarkdown',initialValue:source,draftKey:kind+':42:'+ (kind==='concept'?'body':'statement'),resetSignal:signal,sourceUpdatedAt:signal,confirmDraftSave:true,imageUploadEnabled:false}),
React.createElement(DraftTextInput,{name:'editSummary',draftKey:kind+':42:edit-summary',resetSignal:signal}),React.createElement('button',{type:'submit'},'Submit'))));`);
await new Promise((resolve,reject)=>webpackBundle.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const browser=await chromium.launch({headless:true});
try {
 for(const kind of ['concept','problem'])for(const locale of ['fr','en'])for(const remount of [false,true]){
  const context=await browser.newContext(); const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost:3211/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://localhost:3211/');
  await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}});
  await page.addScriptTag({path:path.join(dir,'bundle.js')});
  await page.evaluate(args=>window.mount(args),{kind,locale});
  const editor=page.locator('.cm-content');await editor.waitFor();
  const key=`math-woods-markdown-draft:${kind}:42:${kind==='concept'?'body':'statement'}`;
  const summaryKey=`math-woods-text-field-draft:${kind}:42:edit-summary`;
  const text='Correction : $u R v \\iff u=v$.';
  await editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text);
  await page.locator('[name=editSummary]').fill('Remplacer Unicode par LaTeX');
  await page.waitForFunction(({key,text})=>JSON.parse(localStorage.getItem(key)||'null')?.value===text,{key,text});
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.receipts)).length,2);
  // A real conflict reload: changed server version, no successful-save receipt.
  // Also retain an old client's attempt marker, to check upgrade compatibility.
  await page.evaluate(({key})=>localStorage.setItem('math-woods-markdown-draft:submit:'+key,JSON.stringify({signal:'1000',submittedAt:Date.now()})),{key});
  await page.evaluate(args=>window.mount(args),{kind,locale,source:'Version concurrente',signal:2000,remount});
  const restore=page.getByRole('button',{name:locale==='fr'?'Restaurer le brouillon local':'Restore local draft',exact:true});await restore.waitFor();
  assert.equal(await page.locator('[name=editSummary]').inputValue(),'Remplacer Unicode par LaTeX');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).value,key),text);
  await restore.click();assert.equal(await editor.innerText(),text);
  // A success acknowledgement must not erase text typed after the submission.
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text+' More work');
  await page.evaluate(()=>document.cookie='mw-editor-saved='+encodeURIComponent(JSON.stringify(window.receipts))+'; Path=/');
  await page.evaluate(args=>window.mount(args),{kind,locale,source:text,signal:3000});
  await restore.waitFor();
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).value,key),text+' More work');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),summaryKey),null);
  await restore.click();
  // A later successful submission clears the matching draft on return to edit.
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.evaluate(()=>document.cookie='mw-editor-saved='+encodeURIComponent(JSON.stringify(window.receipts))+'; Path=/');
  await page.evaluate(args=>window.mount(args),{kind,locale,source:text+' More work',signal:4000});
  await page.waitForFunction(key=>localStorage.getItem(key)===null,key);
  assert.equal(await restore.count(),0); assert.deepEqual(errors,[]);
  console.log(`${kind} ${locale} ${remount?'reload':'refresh'}: conflict preserves Markdown and summary; restoration and version-specific success cleanup OK`);
  await context.close();
 }
} finally {await browser.close();}
