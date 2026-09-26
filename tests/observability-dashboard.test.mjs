import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function compile(file, globals = {}, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code, {exports, require: name => modules[name] ?? require(name), URL, Error, ...globals});
  return exports;
}
function fixture({fail = () => false, empty = false, configured = true, lcpDurationMs = 0} = {}) {
  const requests = [];
  const module = compile('lib/observability-dashboard.ts', {
    process: {env:{OBSERVABILITY_PROMETHEUS_URL: configured ? 'http://metrics.test:9090' : ''}},
    AbortSignal: {timeout: timeoutMs => ({timeoutMs})},
    fetch: async (url, options) => {
      const query = url.searchParams.get('query') ?? '';
      requests.push({url, timeoutMs:options.signal.timeoutMs});
      if (fail(url)) return {ok:false,status:503};
      // Reproduce the measured six-second LCP query without sleeping in the test.
      if (query.includes('topk') && options.signal.timeoutMs < lcpDurationMs) throw new Error('Query timed out');
      let data;
      if (url.pathname.endsWith('/alerts')) data = {alerts:[]};
      else if (empty) data = {result:[]};
      else if (url.pathname.endsWith('/query_range')) data = {result:[{metric:{},values:[[1,'12'],[2,'NaN'],[3,'14']]}]};
      else if (query === 'up') data = {result:[{metric:{job:'app'},value:[1,'1']}]};
      else if (query.includes('topk')) data = {result:[{metric:{route:'/concepts',device:'mobile'},value:[1,'1200']}]};
      else data = {result:[{metric:{name:'LCP',device:'mobile'},value:[1,query.includes('rating="poor"')?'2':'10']}]};
      return {ok:true,json:async()=>({status:'success',data})};
    }
  });
  return {...module, requests};
}
async function render(dashboard, locale='fr') {
  let authorized = false;
  const chart = compile('components/ObservabilityChart.tsx');
  const page = compile('app/moderation/performance/page.tsx', {}, {
    'next/link': {default:({children,...props}) => React.createElement('a',props,children)},
    '@/components/ForestPageLayout': {ForestPageLayout:({children}) => React.createElement('main',null,children)},
    '@/components/ObservabilityChart': chart,
    '@/lib/auth': {requireOwner: async()=>{authorized=true;}},
    '@/lib/i18n/server': {getInterfaceLocale:async()=>locale},
    '@/lib/observability-dashboard': {OBSERVABILITY_RANGES:['24h','7d','30d'],parseObservabilityRange:()=> '30d',loadObservabilityDashboard:async()=>dashboard}
  });
  const html = renderToStaticMarkup(await page.default({searchParams:Promise.resolve({range:'30d'})}));
  assert.ok(authorized, 'page still requires the owner');
  return html;
}

test('30d accepts the measured six-second LCP query and keeps the full requested range', async()=>{
  const f=fixture({lcpDurationMs:6000});
  const result=await f.loadObservabilityDashboard('30d');
  assert.equal(result.available,true);
  assert.equal(result.unavailableSections.length,0);
  assert.equal(result.slowRoutes[0].lcpMs,1200);
  assert.equal(result.webVitalQuality[0].poorPercent,20);
  for(const {url,timeoutMs} of f.requests){
    const q=url.searchParams.get('query')??'';
    if(url.pathname.endsWith('query_range') || q.includes('[30d]')) {
      assert.equal(timeoutMs,15000);
      assert.equal(url.searchParams.get('timeout'),'14s');
    }else assert.equal(timeoutMs,4000);
    if(url.pathname.endsWith('query_range')){
      assert.equal(Number(url.searchParams.get('end'))-Number(url.searchParams.get('start')),30*86400);
      assert.equal(url.searchParams.get('step'),'7200');
    }
  }
  assert.equal(result.charts[0].points.length,2,'non-finite samples remain excluded');
});

test('a failed monthly browser query keeps server charts, collectors and quality results visible', async()=>{
  const result=await fixture({fail:url=>url.searchParams.get('query')?.includes('topk')}).loadObservabilityDashboard('30d');
  assert.equal(result.available,true);
  assert.deepEqual(Array.from(result.unavailableSections),['slowRoutes']);
  assert.equal(result.charts.length,7);
  assert.ok(result.charts.every(chart=>chart.points.length===2));
  assert.equal(result.targets[0].up,true);
  for(const locale of ['fr','en']){
    const html=await render(result,locale);
    assert.match(html,/observability-chart/);
    assert.match(html,locale==='fr'?/Certaines mesures n’ont pas pu être chargées/:/Some measurements could not be loaded/);
    assert.doesNotMatch(html,locale==='fr'?/Le suivi est temporairement indisponible/:/Monitoring is currently unavailable/);
  }
});

test('failed alert and chart requests are never presented as healthy or as missing history', async()=>{
  const result=await fixture({fail:url=>url.pathname.endsWith('/alerts') || url.searchParams.get('query')?.includes('node_cpu')}).loadObservabilityDashboard('30d');
  assert.equal(result.available,true);
  assert.equal(result.charts.find(chart=>chart.key==='cpu').points.length,0);
  const html=await render(result);
  assert.doesNotMatch(html,/Aucune alerte active/);
  assert.doesNotMatch(html,/Pas encore de données/);
  assert.match(html,/Ces mesures n’ont pas pu être chargées/);
});

test('total outage is distinct from successful queries with no historical data', async()=>{
  const down=await fixture({fail:()=>true}).loadObservabilityDashboard('30d');
  assert.equal(down.available,false);
  assert.match(await render(down),/Le suivi est temporairement indisponible/);
  const empty=await fixture({empty:true}).loadObservabilityDashboard('30d');
  assert.equal(empty.available,true);
  assert.equal(empty.unavailableSections.length,0);
  const html=await render(empty);
  assert.match(html,/Aucune mesure de navigateur disponible pour cette période/);
  assert.doesNotMatch(html,/Le suivi est temporairement indisponible/);
  const unconfigured=fixture({configured:false});
  assert.equal((await unconfigured.loadObservabilityDashboard('30d')).available,false);
  assert.equal(unconfigured.requests.length,0);
});

test('shorter windows preserve their range and use bounded timeouts', async()=>{
  for(const [range,seconds,timeout] of [['24h',86400,4000],['7d',7*86400,10000]]){
    const f=fixture();await f.loadObservabilityDashboard(range);
    for(const {url,timeoutMs} of f.requests.filter(r=>r.url.pathname.endsWith('/query_range'))){
      assert.equal(timeoutMs,timeout);
      assert.equal(Number(url.searchParams.get('end'))-Number(url.searchParams.get('start')),seconds);
    }
  }
});
