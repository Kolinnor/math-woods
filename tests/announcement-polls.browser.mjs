import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-polls-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
writeFileSync(path.join(dir, 'actions.js'), `
const submit=data=>{window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);};
export const voteAnnouncementPollAction=async(id,locale,state,data)=>submit(data);
export const setAnnouncementPollClosedAction=async(id,closed,locale,state,data)=>submit(data);
`);
writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
writeFileSync(path.join(dir, 'entry.js'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {AnnouncementPoll} from '@/components/AnnouncementPoll';
import {AnnouncementPollFields} from '@/components/AnnouncementPollFields';
import {ActionFeedbackForm} from '@/components/ActionFeedbackForm';
const root=createRoot(document.getElementById('root')); let sequence=0;
window.mount=(locale,mode)=>{window.calls=[];window.finish=null;root.render(mode==='create'
 ? React.createElement(ActionFeedbackForm,{key:++sequence,className:'panel',action:async(state,data)=>{window.calls.push(Object.fromEntries(data));return new Promise(resolve=>window.finish=resolve);}},
   React.createElement('label',null,'Title',React.createElement('input',{name:'title',defaultValue:'Annonce'})),
   React.createElement(AnnouncementPollFields,{locale}),React.createElement('button',{type:'submit'},'Publish'))
 : React.createElement(AnnouncementPoll,{key:++sequence,locale,announcementId:1,question:locale==='fr'?'Quel rythme pour les prochains concours ?':'How often should we run contests?',closed:mode==='closed',canManage:mode==='closed',selectedOptionId:mode==='results'?1:null,
   options:[{id:1,label:locale==='fr'?'Chaque semaine':'Every week',votes:3},{id:2,label:locale==='fr'?'Toutes les deux semaines':'Every other week',votes:1},{id:3,label:locale==='fr'?'Une fois par mois':'Once a month',votes:0}]}));};
`);
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,
  entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},
  resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias:{'@/lib/actions/announcement-actions':path.join(dir,'actions.js'),'@':root}},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(dir,'loader.cjs')}]}
},(error,stats)=>error||stats.hasErrors()?reject(error??Error(stats.toString({all:false,errors:true}))):resolve()));
// Use built site styles plus the new stylesheet so the fixture matches the site.
const cssDir=path.join(root,'.next/static/css');
const css=readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>readFileSync(path.join(cssDir,f),'utf8')).join('\n')
  +readFileSync('app/styles/92-announcements.css','utf8');

for(const engine of [chromium,webkit]) {
  const browser=await engine.launch({headless:true});
  try {
    for(const locale of ['fr','en']) {
      const page=await browser.newPage({viewport:{width:390,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('http://localhost:3214/**',route=>route.fulfill({contentType:'text/html',body:'<div class="forest-page-shell"><div id="root" class="panel" style="max-width:760px;margin:16px auto;padding:16px"></div></div>'}));
      await page.goto('http://localhost:3214/');await page.addStyleTag({content:css});await page.addScriptTag({path:path.join(dir,'bundle.js')});
      await page.evaluate(locale=>window.mount(locale,'create'),locale);
      const enabled=page.locator('input[name=includePoll]');await enabled.waitFor();
      assert.equal(await page.locator('input[name=pollQuestion]').isVisible(),false);
      await enabled.check();
      await page.locator('input[name=pollQuestion]').fill('Notre question');
      await page.locator('textarea').fill('Oui\nNon');
      await enabled.uncheck();await enabled.check();
      assert.equal(await page.locator('textarea').inputValue(),'Oui\nNon','toggle preserves the unfinished poll');
      await page.getByRole('button',{name:'Publish'}).click();
      await page.waitForFunction(()=>window.calls.length===1&&document.querySelector('fieldset').disabled);
      assert.equal(await page.evaluate(()=>window.calls[0].pollOptions),'Oui\nNon');
      await page.evaluate(()=>window.finish({error:'Use distinct answers'}));
      await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('input[name=title]').inputValue(),'Annonce');
      assert.equal(await page.locator('textarea').inputValue(),'Oui\nNon');
      await page.evaluate(locale=>window.mount(locale,'open'),locale);
      const radios=page.getByRole('radio');await radios.first().waitFor();
      assert.equal(await page.locator('.announcement-poll-track').count(),0);
      assert.equal(await page.locator('.announcement-poll-manage').count(),0);
      await radios.nth(1).locator('..').click();assert.equal(await radios.nth(1).isChecked(),true);
      await page.getByRole('button',{name:locale==='fr'?'Voter':'Vote',exact:true}).click();
      await page.waitForFunction(()=>window.calls.length===1&&document.querySelector('fieldset').disabled);
      assert.equal(await page.evaluate(()=>window.calls[0].optionId),'2');
      await page.evaluate(()=>window.finish({error:'The poll is closed'}));
      await page.getByRole('alert').waitFor();assert.equal(await radios.nth(1).isChecked(),true);
      await page.evaluate(locale=>window.mount(locale,'results'),locale);
      await page.locator('.announcement-poll-track').first().waitFor();
      assert.match(await page.locator('.announcement-poll-results').textContent(),/75%/);
      await page.locator('summary').click();
      assert.equal(await radios.first().isChecked(),true);
      for(const width of [320,1000]) {
        await page.setViewportSize({width,height:900});
        const box=await radios.first().boundingBox();
        assert.ok(box.width>=12&&box.width<=24,`${engine.name()} radio width: ${box.width}`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
      }
      await page.evaluate(locale=>window.mount(locale,'closed'),locale);
      await page.waitForFunction(()=>!document.querySelector('input[type=radio]'));
      assert.match(await page.locator('.announcement-poll-manage').textContent(),locale==='fr'?/Rouvrir/:/Reopen/);
      if(engine===chromium&&locale==='fr') await page.screenshot({path:'runtime/announcement-poll-preview.png',fullPage:true});
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine.name()} ${locale}: creation, preserved input, vote/change/closed states, responsive layout`);
      await page.close();
    }
  } finally { await browser.close(); }
}
