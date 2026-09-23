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
writeFileSync(path.join(dir, 'concept-action.js'), `export async function createConceptFormAction(_state,data){window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);}`);
writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
writeFileSync(path.join(dir, 'entry.js'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ActionFeedbackForm} from '@/components/ActionFeedbackForm';
import {EditSummaryInput} from '@/components/EditSummaryInput';
import {ProblemConcurrentEditForm} from '@/components/ProblemConcurrentEditForm';
import {ConceptCreateForm,ConceptSubmitButton} from '@/components/ConceptCreateForm';
import {fr} from '@/lib/i18n/dictionaries/fr'; import {en} from '@/lib/i18n/dictionaries/en';
const root=createRoot(document.getElementById('root')); let sequence=0;
window.mountEdits=(locale,kind)=>{window.calls=[];window.finish=null;root.render(React.createElement(kind==='problem'?ProblemConcurrentEditForm:ActionFeedbackForm,{
 key:++sequence,locale,baseVersion:3,latestHref:'/latest',historyHref:'/history',action:async(_state,data)=>{window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);}
},React.createElement('input',{name:'title',defaultValue:'Initial title'}),React.createElement('textarea',{name:'bodyMarkdown',defaultValue:'Initial draft'}),
React.createElement(EditSummaryInput,{locale,draftKey:'summary-test',resetSignal:0}),React.createElement('button',{type:'submit'},'Save')));};
window.mount=(locale)=>{window.calls=[];window.finish=null;root.render(React.createElement(ActionFeedbackForm,{
 key:++sequence,action:async(_state,data)=>{window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);}
},React.createElement('textarea',{name:'bodyMarkdown',defaultValue:''}),
React.createElement('select',{name:'language',defaultValue:'en'},React.createElement('option',{value:'en'},'English'),React.createElement('option',{value:'fr'},'Français')),
React.createElement('button',{type:'submit'},locale==='fr'?'Publier':'Publish')));};
window.mountConcept=(locale)=>{window.calls=[];window.finish=null;const t=(locale==='fr'?fr:en).contentEditor;root.render(React.createElement(ConceptCreateForm,{key:++sequence,labels:{
 aliasConflictHeading:t.aliasConflictHeading,duplicateTitleHeading:t.duplicateConceptTitleHeading,duplicateTitleWarning:t.duplicateConceptTitleWarning,
 keepSameTranslationTitle:t.keepSameTranslationTitle,publishing:t.publishing,publishAnyway:t.publishAnyway,rateLimitHeading:t.creationRateLimitHeading,rateLimitMessage:t.creationRateLimitMessage,
 sameTranslationTitleHeading:t.sameTranslationTitleHeading,sameTranslationTitleWarning:t.sameTranslationTitleWarning,translationLinksHeading:t.translationLinksHeading
}},React.createElement('input',{name:'title',defaultValue:''}),React.createElement('textarea',{name:'aliases',defaultValue:''}),React.createElement('textarea',{name:'bodyMarkdown',defaultValue:''}),
React.createElement('select',{name:'language',defaultValue:'en'},React.createElement('option',{value:'en'},'English'),React.createElement('option',{value:'fr'},'Français')),
React.createElement(ConceptSubmitButton,{pendingLabel:t.publishing},'Publish')));};
`);
await new Promise((resolve, reject) => webpack.webpack({ mode: 'development', devtool: false,
  entry: path.join(dir, 'entry.js'), output: { path: dir, filename: 'bundle.js' },
  resolve: { extensions: ['.js', '.ts', '.tsx'], modules: [path.join(root, 'node_modules')], alias: { '@/lib/actions/concept-actions': path.join(dir, 'concept-action.js'), '@': root } },
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
      for (const kind of ['problem', 'concept-or-solution']) {
        await page.evaluate(({locale,kind}) => {
          localStorage.setItem('math-woods-text-field-draft:summary-test',JSON.stringify({value:'x'.repeat(241),updatedAt:Date.now()}));
          window.mountEdits(locale,kind);
        },{locale,kind});
        const summary=page.locator('input[name=editSummary]');
        await page.waitForFunction(()=>document.querySelector('[name=editSummary]')?.value.length===241);
        assert.equal(await summary.inputValue(),'x'.repeat(241),'restored overlong drafts must not be truncated');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.calls.length),0,'native validation blocks excess length');
        assert.equal(await summary.getAttribute('aria-invalid'),'true');
        await summary.fill('x'.repeat(240));
        assert.match(await page.locator('small').textContent(),/240\/240/);
        assert.equal(await page.locator('small').evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
        await page.locator('input[name=title]').fill('Keep the new title');
        await page.locator('textarea').fill('Keep the new draft');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        await page.waitForFunction(()=>window.finish && document.querySelector('fieldset').disabled);
        assert.equal(await page.evaluate(()=>window.calls[0].editSummary.length),240);
        await page.evaluate(kind=>window.finish(kind==='problem'?{status:'invalid',error:'Shorten the summary'}:{error:'Shorten the summary'}),kind);
        await page.waitForFunction(()=>document.activeElement===document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled);
        assert.equal(await page.locator('input[name=title]').inputValue(),'Keep the new title');
        assert.equal(await page.locator('textarea').inputValue(),'Keep the new draft');
        assert.equal(await summary.inputValue(),'x'.repeat(240));
        await summary.fill('Corrected a sign');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        await page.waitForFunction(()=>window.calls.length===2 && window.finish);
        if(kind==='problem') {
          await page.evaluate(()=>window.finish({status:'conflict',currentVersion:4,editorName:null,editedAt:null,conflictingFields:['title']}));
          await page.locator('.problem-edit-conflict').waitFor();
          assert.equal(await page.locator('input[name=title]').inputValue(),'Keep the new title');
          assert.equal(await page.locator('textarea').inputValue(),'Keep the new draft');
          assert.equal(await summary.inputValue(),'Corrected a sign');
        } else {
          await page.evaluate(()=>window.finish({error:''}));
        }
        await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${browserType.name()} ${locale} ${kind}: restored drafts, counter, limit, preserved form, retry`);
      }
      await page.evaluate(locale => window.mount(locale), locale);
      await page.locator('select').waitFor();
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
      await page.evaluate(locale => window.mountConcept(locale), locale);
      await page.locator('input[name=title]').fill('A sphere');
      await page.locator('textarea[name=aliases]').fill('Sphere');
      await page.locator('textarea[name=bodyMarkdown]').fill('Keep my $x^2$ draft.');
      await page.locator('select').selectOption('fr');
      await page.getByRole('button', {name:'Publish',exact:true}).click();
      await page.waitForFunction(() => window.calls.length === 1 && document.querySelector('fieldset').disabled);
      await page.evaluate(() => window.finish({errorKind:'alias-conflict',error:'Sphere: remove the conflicting alias.'}));
      await page.getByRole('alert').waitFor();
      await page.waitForFunction(() => document.activeElement === document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled);
      assert.match(await page.getByRole('alert').textContent(), locale === 'fr' ? /Alias déjà utilisé/ : /Alias already in use/);
      assert.equal(await page.locator('input[name=title]').inputValue(),'A sphere');
      assert.equal(await page.locator('textarea[name=aliases]').inputValue(),'Sphere');
      assert.equal(await page.locator('textarea[name=bodyMarkdown]').inputValue(),'Keep my $x^2$ draft.');
      assert.equal(await page.locator('select').inputValue(),'fr');
      assert.equal(await page.getByRole('button').count(),1,'alias conflicts cannot be overridden');
      await page.locator('textarea[name=aliases]').fill('A distinct alias');
      assert.equal(await page.locator('textarea[name=aliases]').inputValue(),'A distinct alias');
      await page.getByRole('button',{name:'Publish',exact:true}).click();
      await page.waitForFunction(() => window.calls.length === 2);
      assert.equal(await page.evaluate(()=>window.calls[1].aliases),'A distinct alias');
      await page.evaluate(() => window.finish({errorKind:'same-translation-title',error:'Confirm translation title'}));
      const confirmation=page.locator('button[name]');
      await confirmation.waitFor();
      await page.waitForFunction(() => document.activeElement === document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled);
      const confirmationName=await confirmation.getAttribute('name');
      await confirmation.click();
      await page.waitForFunction(() => window.calls.length === 3);
      assert.equal(await page.evaluate(name=>window.calls[2][name],confirmationName),'confirm');
      assert.equal(await page.evaluate(()=>window.calls[2].aliases),'A distinct alias');
      await page.evaluate(() => window.finish({error:null}));
      await page.waitForFunction(() => !document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${browserType.name()} ${locale}: concept alias feedback, preserved fields, retry and confirmation submitter`);
      await page.close();
    }
  } finally { await browser.close(); }
}
