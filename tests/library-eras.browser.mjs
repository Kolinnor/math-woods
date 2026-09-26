// Real era page and form; isolated database/actions, with server validation tested separately.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium, webkit } from '@playwright/test';

const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-eras-'));
const write = (name, source) => { const file = path.join(dir, name); writeFileSync(file, source); return file; };
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};`);
const alias = {
  'next/link': write('link.js', `import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`),
  'next/navigation': write('navigation.js', `export function notFound(){throw new Error('Not found')}`),
  '@/lib/auth': write('auth.js', `export const requireAdmin=async()=>({id:1,role:'OWNER'});`),
  '@/lib/permissions': write('permissions.js', `export const canUseAdminTools=()=>true;`),
  '@/lib/i18n/server': write('locale.js', `export const getInterfaceLocale=async()=>window.locale;`),
  '@/lib/db': write('db.js', `export const prisma={libraryEra:{findMany:async()=>[-3500,1700].map((startYear,i)=>({id:i+1,slug:'era-'+i,nameFr:'Époque '+i,nameEn:'Era '+i,startYear,color:'#6d6555',descriptionFr:'Description initiale',descriptionEn:'Initial description'}))}};`),
  '@/lib/actions/library-era-actions': write('actions.js', `
    export async function saveLibraryEraAction(id,state,data){
      window.calls.push({id,...Object.fromEntries(data)});
      await new Promise(resolve=>setTimeout(resolve,100));
      const fr=data.get('locale')==='fr',year=Number(data.get('startYear'));
      if(year===0)return {error:fr?'Utilisez -1 ou 1, sans année zéro.':'Use -1 or 1, without year zero.'};
      if(year===1700)return {error:fr?'Une époque commence déjà cette année-là.':'An era already starts that year.'};
      window.saved.push(id);return {error:''};
    }
    export async function deleteLibraryEraAction(id,data){window.deleted.push({id,locale:data.get('locale')})}
    export async function createDefaultLibraryErasAction(){}
  `),
  '@': root
};
const entry = write('entry.js', `import React from 'react';import {createRoot} from 'react-dom/client';import Page from '@/app/library/eras/page';const root=createRoot(document.getElementById('root'));Page({searchParams:Promise.resolve({})}).then(tree=>root.render(tree));`);
await new Promise((resolve, reject) => webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.js','.ts','.tsx'],modules:[path.join(root,'node_modules')],alias},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error??new Error(stats.toString({all:false,errors:true}))):resolve()));
const files = [...readFileSync('app/layout.tsx','utf8').matchAll(/import "(\.\/[^"\n]+\.css)"/g)].map(m=>path.join('app',m[1]));
const source = files.map(file=>readFileSync(file,'utf8').replace('@import "./styles/68-library.css";',readFileSync('app/styles/68-library.css','utf8'))).join('\n').replace(/@import[^;]+;/g,'');
const css = (await postcss([tailwind({content:['./app/library/eras/page.tsx','./components/ActionFeedbackForm.tsx','./components/ForestPageLayout.tsx'],theme:{},plugins:[]})]).process(source,{from:undefined})).css;
mkdirSync('runtime/library-eras',{recursive:true});
for (const engine of [chromium,webkit]) {
  const browser = await engine.launch({headless:true});
  try {
    for (const locale of ['fr','en']) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('http://localhost:3216/**',route=>{
        const pathname=new URL(route.request().url()).pathname;
        if(pathname.startsWith('/art/'))return route.fulfill({body:readFileSync(path.join(root,'public',pathname)),contentType:'image/avif'});
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
      });
      await page.goto('http://localhost:3216/library/eras');
      await page.evaluate(locale=>{window.locale=locale;window.calls=[];window.saved=[];window.deleted=[];window.process={env:{NODE_ENV:'development'}};},locale);
      await page.addStyleTag({content:css}); await page.addScriptTag({path:path.join(dir,'bundle.js')});
      await page.locator('.library-era-new').waitFor();
      for (const mode of ['edit','create']) {
        const card=mode==='edit'?page.locator('.library-era-card').first():page.locator('.library-era-new');
        const form=card.locator('form').first();
        const values={nameFr:'Mon époque à conserver',nameEn:'Keep my era',descriptionFr:'Une description française détaillée.',descriptionEn:'A detailed English description.',color:'#228866',startYear:'0'};
        for(const [name,value] of Object.entries(values))await form.locator(`[name=${name}]`).fill(value);
        await form.getByRole('button',{name:locale==='fr'?(mode==='edit'?'Enregistrer':'Ajouter'):(mode==='edit'?'Save':'Add'),exact:true}).click();
        const alert=form.getByRole('alert');await alert.waitFor();
        assert.match(await alert.innerText(),locale==='fr'?/année zéro/:/year zero/);
        assert.equal(await alert.evaluate(el=>el===document.activeElement),true,'Validation error is focused');
        for(const [name,value] of Object.entries(values))assert.equal(await form.locator(`[name=${name}]`).inputValue(),value,`${mode} keeps ${name}`);
        await page.setViewportSize({width:390,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
        await page.screenshot({path:`runtime/library-eras/${engine.name()}-${locale}-${mode}-mobile.png`,fullPage:true});
        await form.locator('[name=startYear]').fill('1700');await form.locator('button[type=submit]').click();
        await page.waitForFunction(()=>document.activeElement?.textContent?.includes(window.locale==='fr'?'déjà':'already'));
        assert.equal(await form.locator('[name=descriptionFr]').inputValue(),values.descriptionFr,'Collision keeps description');
        await form.locator('[name=startYear]').fill('1750');await form.locator('button[type=submit]').click();
        await page.waitForFunction(count=>window.saved.length===count,mode==='edit'?1:2);
        await alert.waitFor({state:'detached'});
        assert.equal(await form.getByRole('alert').count(),0,'Corrected form saves');
        await page.setViewportSize({width:1440,height:1000});
      }
      assert.equal(await page.locator('form form').count(),0,'Deletion is not nested in save form');
      const first=page.locator('.library-era-card').first();await first.locator('summary').click();
      await first.getByRole('button',{name:locale==='fr'?'Confirmer la suppression':'Confirm deletion',exact:true}).click();
      await page.waitForFunction(()=>window.deleted.length===1);
      assert.deepEqual(await page.evaluate(()=>window.deleted),[{id:1,locale}]);
      assert.equal(await page.evaluate(()=>window.calls.length),6,'Delete does not submit the save action');
      await page.screenshot({path:`runtime/library-eras/${engine.name()}-${locale}-desktop.png`,fullPage:true});
      assert.deepEqual(errors,[]);await page.close();
      console.log('PASS',engine.name(),locale,'create/edit validation preserves all fields, correction, independent deletion, mobile');
    }
  } finally {await browser.close();}
}
