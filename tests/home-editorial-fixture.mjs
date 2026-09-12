// Isolated browser fixture for the real switcher. No database or publication side effects.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import path from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const webpack = require('next/dist/compiled/webpack/webpack');
webpack.init();
const directory = path.resolve('runtime/home-editorial-fixture');
mkdirSync(directory, { recursive: true });
const compiled = ts.transpileModule(readFileSync('components/HomeEditorialSwitcher.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(path.join(directory, 'switcher.js'), compiled);
writeFileSync(path.join(directory, 'entry.js'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HomeEditorialSwitcher } from './switcher.js';
function Fixture() {
  const [mode, setMode] = React.useState('priority');
  const [locale, setLocale] = React.useState('fr');
  const fr = locale === 'fr';
  const key = mode === 'new' ? 'fixture:contest-2' : mode === 'viewer' ? 'fixture-other:contest-1' : 'fixture:contest-1';
  return React.createElement(React.Fragment, null,
    React.createElement('label', null, 'Scénario ', React.createElement('select', {value:mode,onChange:e=>setMode(e.target.value)}, ...[['priority','Concours prioritaire'],['normal','Après la mise en avant'],['new','Nouveau concours'],['viewer','Autre compte'],['no-problem','Sans problème'],['no-contest','Sans concours']].map(([value,text])=>React.createElement('option',{key:value,value},text)))),
    React.createElement('label', null, ' Langue ', React.createElement('select', {value:locale,onChange:e=>setLocale(e.target.value)}, React.createElement('option',{value:'fr'},'Français'),React.createElement('option',{value:'en'},'English'))),
    React.createElement('main',{style:{marginTop:30}},React.createElement(HomeEditorialSwitcher, {
      key,preferenceKey:key,prioritizeContest:mode!=='normal',problemLabel:fr?'Problème du jour':'Problem of the day',contestLabel:fr?'Concours':'Contest',sectionLabel:fr?'À la une':'Featured',hideContestLabel:fr?'Masquer ce concours':'Hide this contest',showContestLabel:fr?'Réafficher le concours':'Show the contest again',
      problem:mode==='no-problem'?null:React.createElement('article',{className:'home-contest-card'},React.createElement('div',null,React.createElement('h2',null,fr?'Problème du jour de démonstration':'Sample daily problem'),React.createElement('p',null,'Contenu du problème.'))),
      contest:mode==='no-contest'?null:React.createElement('article',{className:'home-contest-card'},React.createElement('div',null,React.createElement('h2',null,fr?'Concours de démonstration':'Sample contest'),React.createElement('p',null,'Un concours de création de problèmes.'),React.createElement('a',{href:'#participer',className:'mw-primary-button'},fr?'Participer au concours':'Enter the contest')))
    })));
}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
`);
await new Promise((resolve, reject) => webpack.webpack({ mode: 'development', devtool: false, entry: path.join(directory,'entry.js'), output: { path: directory, filename: 'bundle.js' } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({all:false,errors:true}))) : resolve()));
const css = readdirSync('app/styles').filter(file=>file.endsWith('.css')).sort().map(file=>readFileSync(path.join('app/styles',file),'utf8')).join('\n');
const server = createServer((request,response) => {
  if (request.url === '/bundle.js') { response.setHeader('Content-Type','text/javascript'); response.end(readFileSync(path.join(directory,'bundle.js'))); return; }
  if (request.url !== '/') {response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type','text/html; charset=utf-8');
  response.end('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{padding:24px;max-width:980px;margin:auto;--font-serif:Georgia;--font-sans:Arial}label{margin-right:12px}</style><div id="root"></div><script src="/bundle.js"></script></html>');
});
server.listen(3217,'127.0.0.1',()=>console.log('Home editorial fixture: http://127.0.0.1:3217'));
