import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const require = createRequire(import.meta.url);
const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-feedback-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
writeFileSync(path.join(dir, 'entry.js'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ActionFeedbackForm} from '@/components/ActionFeedbackForm';
const root=createRoot(document.getElementById('root')); let sequence=0;
window.mount=(locale)=>{window.calls=[];window.finish=null;root.render(React.createElement(ActionFeedbackForm,{
 key:++sequence,action:async(_state,data)=>{window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);}
},React.createElement('textarea',{name:'bodyMarkdown',defaultValue:''}),
React.createElement('select',{name:'language',defaultValue:'en'},React.createElement('option',{value:'en'},'English'),React.createElement('option',{value:'fr'},'Français')),
React.createElement('button',{type:'submit'},locale==='fr'?'Publier':'Publish')));};
`);
await new Promise((resolve, reject) => webpack.webpack({ mode: 'development', devtool: false,
  entry: path.join(dir, 'entry.js'), output: { path: dir, filename: 'bundle.js' },
  resolve: { extensions: ['.js', '.ts', '.tsx'], modules: [path.join(root, 'node_modules')], alias: { '@': root } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(dir, 'loader.cjs') }] }
}, (error, stats) => error || stats.hasErrors() ? reject(error ?? Error(stats.toString({ all: false, errors: true }))) : resolve()));

for (const browserType of [chromium, webkit]) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const locale of ['fr', 'en']) {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost:3212/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
      await page.goto('http://localhost:3212/');
      await page.addScriptTag({ path: path.join(dir, 'bundle.js') });
      await page.evaluate(locale => window.mount(locale), locale);
      const text = page.locator('textarea');
      const language = page.locator('select');
      const button = page.getByRole('button');
      await text.fill('  '); await language.selectOption('fr'); await button.click();
      await page.waitForFunction(() => window.finish && document.querySelector('fieldset').disabled);
      assert.equal(await button.isEnabled(), false);
      assert.equal(await page.evaluate(() => window.calls.length), 1);
      await page.evaluate(locale => window.finish({ error: locale === 'fr' ? 'Écrivez votre solution avant de la publier.' : 'Write your solution before publishing it.' }), locale);
      await page.getByRole('alert').waitFor();
      await page.waitForFunction(() => document.querySelector('[role=alert]') === document.activeElement);
      assert.equal(await text.inputValue(), '  ');
      assert.equal(await language.inputValue(), 'fr');
      assert.equal(await page.getByRole('alert').evaluate(el => el === document.activeElement), true);
      await text.fill('Une preuve complète : $a=b$.'); await button.click();
      await page.waitForFunction(() => window.calls.length === 2 && document.querySelector('fieldset').disabled);
      assert.equal(await page.evaluate(() => window.calls[1].bodyMarkdown), 'Une preuve complète : $a=b$.');
      await page.evaluate(() => window.finish({ error: '' }));
      await page.waitForFunction(() => !document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled);
      assert.deepEqual(errors, []);
      console.log(`PASS ${browserType.name()} ${locale}: inline error, focus, preserved values, pending guard, successful retry`);
      await page.close();
    }
  } finally { await browser.close(); }
}
