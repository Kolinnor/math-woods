// Actual React/CodeMirror fields; mock only the catalogue HTTP response.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { submittedMathematicianRelated } from '../lib/mathematician-related.ts';
const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-related-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader = path.join(dir, 'loader.cjs');
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
const entry = path.join(dir, 'entry.js');
writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {MathematicianRelatedEditor} from '@/components/library/MathematicianRelatedEditor';import {MathematicianForm} from '@/components/library/MathematicianForm';import {MarkdownEditorLabelsProvider} from '@/components/markdown/MarkdownEditorLabelsContext';import {fr} from '@/lib/i18n/dictionaries/fr';import {en} from '@/lib/i18n/dictionaries/en';
const wrap=(locale,child)=>React.createElement(MarkdownEditorLabelsProvider,{labels:(locale==='fr'?fr:en).markdownEditor},child);
window.mountForm=language=>root.render(wrap(language,React.createElement(MathematicianForm,{key:++seq,locale:language,contentLanguage:language,values:{id:42,name:'Euler'},action:async()=>({error:''})})));
const root=createRoot(document.getElementById('root'));let seq=0;window.mount=(locale)=>root.render(React.createElement(MarkdownEditorLabelsProvider,{labels:(locale==='fr'?fr:en).markdownEditor},React.createElement('form',{key:++seq,onSubmit:e=>{e.preventDefault();window.saved=Object.fromEntries(new FormData(e.currentTarget));}},React.createElement(MathematicianRelatedEditor,{locale,language:locale}),React.createElement('button',{type:'submit'},'Save'))));`);
await new Promise((resolve, reject) => webpack.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' }, resolve: { extensions: ['.js','.ts','.tsx'], modules: [path.join(root,'node_modules')], alias: { '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] } }, (e,s) => e || s.hasErrors() ? reject(e ?? new Error(s.toString({all:false,errors:true}))) : resolve()));
const browser = await chromium.launch({headless:true});
mkdirSync('runtime/related-tests', { recursive:true });
try {
  for (const locale of ['fr','en']) {
    const context = await browser.newContext({viewport:{width:900,height:950}}), page = await context.newPage(), errors=[];
    let fileChoosers = 0;
    page.on('filechooser', () => { fileChoosers++; });
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('http://localhost:3211/**', r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.route('**/api/library/related/search?*', r=>r.fulfill({json:{results:[{id:42,title:'Euclide — Éléments',titleHtml:'Euclide — Éléments',href:'/library/references/elements'}],more:false}}));
    await page.route('**/api/library/mathematicians/suggest?*', r=>r.fulfill({json:{mathematicians:[]}}));
    await page.goto('http://localhost:3211/'); await page.evaluate(()=>window.process={env:{NODE_ENV:'development'}}); await page.addScriptTag({path:path.join(dir,'bundle.js')});
    const css = readdirSync('.next/static/css').filter(f=>f.endsWith('.css')).map(f=>readFileSync(path.join('.next/static/css',f),'utf8')).join('\n');
    await page.addStyleTag({content:css+'\nbody{margin:20px}'});
    await page.evaluate(locale=>window.mount(locale),locale);
    const works=page.locator('.mathematician-related-section').nth(0), sources=page.locator('.mathematician-related-section').nth(1);
    const free=locale==='fr'?'Ajouter une référence libre':'Add a free reference';
    await works.getByRole('button',{name:free,exact:true}).click();
    const title='Une étude sur $u=v$', note='Chapitre II, **preuve** et $x^2$';
    await works.locator('.cm-content').first().click(); await page.keyboard.insertText(title);
    await works.locator('summary').click();
    await works.locator('.cm-content').nth(1).click(); await page.keyboard.insertText(note);
    await works.locator('select').selectOption('SOURCE');
    assert.equal(await sources.locator('.cm-content').first().innerText(),title);
    // Reclassification remounts editors; the live note must survive it.
    await sources.locator('summary').click();
    assert.equal(await sources.locator('[name$="-note"]').first().inputValue(),note);
    await sources.getByRole('button',{name:free,exact:true}).click();
    await sources.locator('.mathematician-related-item').nth(1).getByRole('button',{name:locale==='fr'?'Monter':'Move up',exact:true}).click();
    await page.getByRole('button',{name:'Save',exact:true}).click();
    const saved=await page.evaluate(()=>window.saved), f=new FormData(); Object.entries(saved).forEach(([k,v])=>f.set(k,v));
    const rows=submittedMathematicianRelated(f); assert.equal(rows[0].labelMarkdown,''); assert.equal(rows[1].labelMarkdown,title); assert.equal(rows[1].noteMarkdown,note);
    await works.getByRole('button',{name:locale==='fr'?'Rechercher et ajouter':'Search and add',exact:true}).click();
    const dialog=page.getByRole('dialog'); await dialog.getByRole('textbox').fill('Euclide');
    await dialog.getByRole('button',{name:locale==='fr'?'Ajouter':'Add',exact:true}).click();
    assert.equal(await dialog.isVisible(),false); await works.getByText('Euclide — Éléments',{exact:true}).waitFor();
    assert.equal(await works.locator('details').getAttribute('open'),null);
    await page.screenshot({path:`runtime/related-tests/${locale}.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`runtime/related-tests/${locale}-mobile.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); assert.deepEqual(errors,[]);
    await page.evaluate(locale=>window.mountForm(locale),locale);
    const bio=page.locator('.library-editor-field').first().locator('.cm-content'); await bio.click(); await page.keyboard.insertText('Draft '+locale);
    assert.equal(fileChoosers, 0, 'Clicking the biography must not open the image picker');
    const contributions=page.locator('.library-editor-field').nth(1);
    await contributions.locator('.cm-content').click(); await page.keyboard.insertText('Contribution $u=v$');
    assert.equal(fileChoosers, 0, 'Clicking contributions must not open the image picker');
    await Promise.all([
      page.waitForEvent('filechooser'),
      contributions.locator('.markdown-editor-tool-button').first().click()
    ]);
    assert.equal(fileChoosers, 1, 'The explicit image button must still open the picker');
    await page.waitForFunction(locale=>JSON.parse(localStorage.getItem('math-woods-markdown-draft:mathematician:42:'+locale+':biography')||'null')?.value==='Draft '+locale,locale);
    await page.evaluate(locale=>window.mountForm(locale==='fr'?'en':'fr'),locale);
    await page.waitForFunction(()=>document.querySelector('[name=biographyMarkdown]')?.value==='');
    await page.evaluate(locale=>window.mountForm(locale),locale);
    await page.waitForFunction(locale=>document.querySelector('[name=biographyMarkdown]')?.value==='Draft '+locale,locale);
    assert.deepEqual(errors,[]);
    console.log('PASS',locale,'LaTeX, category changes, order, empty drafts, saved notes, search and mobile width'); await context.close();
  }
} finally { await browser.close(); }
