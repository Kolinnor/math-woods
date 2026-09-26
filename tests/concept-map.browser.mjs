// Browser checks for the /concepts map: npm run test:concept-map:browser
// Bundles the real client components with a fake API and drives them in Chromium (WebGL
// through SwiftShader), on a desktop viewport and on a phone-sized touch viewport.
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, devices } from '@playwright/test';
import { buildConceptMapGraph, buildConceptMapPayload, prepareConceptMap } from '../lib/concept-map.ts';
import { computeConceptMapLayout } from '../lib/concept-map-layout.ts';
import { en } from '../lib/i18n/dictionaries/en.ts';

const require = createRequire(import.meta.url), root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'mathwoods-concept-map-'));
const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
writeFileSync(path.join(dir, 'loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
writeFileSync(path.join(dir, 'navigation.js'), `window.__pushed=[];const router={push:url=>window.__pushed.push(url),replace:url=>window.__pushed.push(url)};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);`);
writeFileSync(path.join(dir, 'link.js'), `import React from 'react';export default function Link({href,prefetch,scroll,...props}){return React.createElement('a',{href,...props});}`);
writeFileSync(path.join(dir, 'entry.js'), `
import React from 'react';import {createRoot} from 'react-dom/client';
import {ConceptMap} from '@/components/ConceptMap';
import {ConceptBrowserViewSwitch} from '@/components/ConceptBrowserViewSwitch';
const config=window.mapConfig;
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
  React.createElement(ConceptBrowserViewSwitch,{view:'map',labels:{group:'Display',map:'Map',list:'List'}}),
  React.createElement(ConceptMap,config)));
`);
await new Promise((resolve, reject) => webpack.webpack({
  mode: 'development', devtool: false, entry: path.join(dir, 'entry.js'), output: { path: dir, filename: 'bundle.js', chunkFilename: '[name].chunk.js', publicPath: '/' },
  resolve: { extensions: ['.js', '.ts', '.tsx'], modules: [path.join(root, 'node_modules')], alias: { '@': root, 'next/navigation': path.join(dir, 'navigation.js'), 'next/link': path.join(dir, 'link.js') } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(dir, 'loader.cjs') }] }
}, (error, stats) => error || stats.hasErrors() ? reject(error ?? Error(stats.toString({ all: false, errors: true }))) : resolve()));

const domainLabels = { algebra: 'Algebra', 'linear-algebra': 'Linear algebra', 'general-topology': 'Topology', 'real-analysis': 'Real analysis', 'probability-statistics': 'Probability' };
// A small but realistic graph: two languages, stubs, hubs and isolated concepts.
const domains = ['algebra', 'linear-algebra', 'general-topology', 'real-analysis', 'probability-statistics'];
const concepts = [], links = [];
for (let index = 0; index < 90; index += 1) {
  const group = `group-${index}`;
  concepts.push({ id: index * 2 + 1, slug: `notion-${index}`, title: index === 3 ? 'Espace $L^p$' : `Notion ${index}`, language: 'en', translationGroupId: group, translatedFromConceptId: null, status: index % 7 === 0 ? 'STUB' : 'USABLE', kind: 'DEFINITION', domainCode: domains[index % domains.length], aliases: [] });
  if (index % 3 === 0) concepts.push({ id: index * 2 + 2, slug: `notion-fr-${index}`, title: `Notion française ${index}`, language: 'fr', translationGroupId: group, translatedFromConceptId: index * 2 + 1, status: 'USABLE', kind: 'DEFINITION', domainCode: domains[index % domains.length], aliases: [] });
}
for (let index = 1; index < 80; index += 1) {
  links.push({ sourceId: index * 2 + 1, targetSlug: `notion-${Math.floor(index / 2)}` });
  if (index % 4 === 0) links.push({ sourceId: index * 2 + 1, targetSlug: `notion-${(index * 7) % 80}` });
  if (index % 3 === 0) links.push({ sourceId: index * 2 + 2, targetSlug: `notion-${(index * 5) % 90}` }); // French pages cite too
}
const rows = { concepts, redirects: [], links };
// The English map is small, but gets levels of detail and two tiers as if it were large.
const prepared = {
  en: prepareConceptMap(buildConceptMapGraph(rows, 'en'), await computeConceptMapLayout(buildConceptMapGraph(rows, 'en')), { overviewBudget: 30, tierBudget: 45 }),
  fr: prepareConceptMap(buildConceptMapGraph(rows, 'fr'), await computeConceptMapLayout(buildConceptMapGraph(rows, 'fr')))
};
const payloads = {};
for (const language of ['en', 'fr']) {
  payloads[language] = prepared[language].tiers.map((_, index) => {
    const payload = buildConceptMapPayload(prepared[language], index + 1);
    const titleHtml = Object.fromEntries(Object.entries(payload.nodes.title).map(([index]) => [index, 'Espace <i>L</i><sup>p</sup>']));
    return { ...payload, titleHtml };
  });
}
const enFirst = payloads.en[0], enLast = payloads.en.at(-1);
assert.ok(payloads.en.length >= 3 && enFirst.maxLevel > 0, 'the fixture exercises tiers and levels');
assert.deepEqual(payloads.fr[0].tiers, [{ end: 30, level: 0 }]);
// Global node arrays of the English map, as the client sees them once every tier is merged.
const all = {
  slug: payloads.en.flatMap((payload) => payload.nodes.slug),
  label: payloads.en.flatMap((payload) => payload.nodes.label),
  domain: payloads.en.flatMap((payload) => payload.nodes.domain),
  links: payloads.en.flatMap((payload) => payload.links)
};
const enTierRequests = payloads.en.map((_, index) => `en:${index + 1}`);
const nodeIndex = (slug) => all.slug.indexOf(slug);
const summaryOf = (payload) => `${payload.total.nodes} concepts · ${payload.total.links} links`;

const bundle = readFileSync(path.join(dir, 'bundle.js'), 'utf8');
let failApi = false, apiDelay = 0, staleOnce = false;
const requests = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.endsWith('.js')) {
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    response.end(url.pathname === '/bundle.js' ? bundle : readFileSync(path.join(dir, path.basename(url.pathname))));
    return;
  }
  if (url.pathname === '/api/concepts/map') {
    const language = url.searchParams.get('lang'), tier = Number(url.searchParams.get('tier'));
    requests.push(`${language}:${tier}`);
    if (apiDelay) await new Promise((resolve) => setTimeout(resolve, apiDelay));
    if (failApi) { response.statusCode = 500; response.end('{}'); return; }
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (staleOnce && tier === 2) {
      // The map changed on the server between two tiers.
      staleOnce = false;
      response.end(JSON.stringify({ ...payloads[language][1], version: 'newer' }));
      return;
    }
    response.end(JSON.stringify(payloads[language][tier - 1] ?? { ...payloads[language][0], tier, offset: payloads[language][0].total.nodes, nodes: { slug: [], label: [], x: [], y: [], domain: [], status: [], kind: [], degree: [], level: [], title: {}, terms: {} }, links: [], titleHtml: {} }));
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  const config = { language: url.searchParams.get('lang') ?? 'en', copy: en.conceptMap, domainLabels, kindLabels: en.concepts.kinds, statusLabels: en.concepts.statuses, listHref: '/concepts?view=list' };
  response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*,::before,::after{box-sizing:border-box}body{margin:0;font-family:sans-serif}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${readFileSync(path.join(root, 'app/styles/65-concepts.css'), 'utf8')}</style></head><body><div id="root"></div><script>window.mapConfig=${JSON.stringify(config)}</script><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const waitFor = async (predicate, message, timeout = 5000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const browser = await chromium.launch({
  headless: true,
  // Optional: point to an installed Chromium when Playwright's own build is not downloaded.
  executablePath: process.env.CONCEPT_MAP_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
// Observe the actual canvas text, rather than just DOM controls, to cover label density.
async function trackCanvasText(context) {
  await context.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (this.globalAlpha > 0) (this.canvas.__drawnText ??= []).push(String(text));
      return fill.call(this, text, ...args);
    };
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      this.canvas.__drawnText = [];
      return clear.apply(this, args);
    };
  });
}
const drawnTitles = page => page.locator('canvas.sigma-labels').evaluate(canvas => canvas.__drawnText ?? []);
try {
  // Desktop, with a slow API: the map, its search and its controls are there before the data.
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await trackCanvasText(context);
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  apiDelay = 1500;
  await page.goto(`${base}/concepts`);
  const search = page.getByRole('combobox', { name: en.conceptMap.searchLabel });
  await search.waitFor();
  assert.equal(await page.locator('.concept-map-frame').getAttribute('data-loading'), 'true');
  assert.ok(await page.getByRole('button', { name: en.conceptMap.zoomIn }).isVisible());
  const frameBox = await page.locator('.concept-map-stage').boundingBox();
  assert.ok(frameBox.width > 600 && frameBox.height > 400, 'the map has its final size at once');
  assert.equal(await page.getByRole('alert').count(), 0);
  const loadingText = await page.getByText(en.conceptMap.loading).boundingBox();
  assert.ok(!loadingText || loadingText.width <= 1, 'no visible loading message over the map');
  assert.equal(await page.locator('.concept-map-stage').getAttribute('aria-busy'), 'true');
  apiDelay = 0;
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.concept-map-frame').getAttribute('data-loading'), null);
  await page.getByText(summaryOf(enFirst)).waitFor();
  assert.equal(await page.locator('.concept-map-stage').getAttribute('role'), 'application');
  assert.equal(await page.locator('.concept-map-domains input[type=checkbox]').count(), enFirst.domains.length);
  // The rest of the map follows when the browser is idle, one level at a time, and only for the
  // language of the page.
  await waitFor(() => enTierRequests.every((item) => requests.includes(item)), `every tier on a large screen (${requests})`);
  assert.deepEqual(requests, enTierRequests, 'each tier once, in order, only for the English map');

  await page.waitForTimeout(400);
  const overviewTitles = await drawnTitles(page);
  assert.ok(overviewTitles.length > 0 && overviewTitles.length <= 6, 'overview has a small set of domain names');
  assert.ok(overviewTitles.every(title => Object.values(domainLabels).includes(title)), 'overview has no permanent concept titles');
  for (let step = 0; step < 2; step++) {
    await page.getByRole('button', { name: en.conceptMap.zoomIn }).click();
    await page.waitForTimeout(400);
  }
  const zoomTitles = await drawnTitles(page);
  assert.ok(zoomTitles.length <= 10, `intermediate zoom limits titles in the viewport: ${JSON.stringify(zoomTitles)}`);
  assert.ok(zoomTitles.every(title => !Object.values(domainLabels).includes(title)), 'zoom replaces domains with concepts');
  await page.getByRole('button', { name: en.conceptMap.resetView }).click();
  await page.waitForTimeout(400);

  // Search: combobox, keyboard choice, selection panel, hash and live announcement.
  await search.fill('notion 1');
  const options = page.getByRole('option');
  assert.ok((await options.count()) > 1 && (await options.count()) <= 8);
  assert.equal(await options.first().locator('.concept-map-result-label').textContent(), 'Notion 1');
  await search.press('ArrowDown');
  await search.press('ArrowUp');
  await search.press('Enter');
  const heading = page.locator('.concept-map-selection h2');
  await heading.getByText('Notion 1', { exact: true }).waitFor();
  await page.waitForFunction(() => location.hash === '#concept=notion-1');
  await page.waitForTimeout(400);
  assert.ok((await drawnTitles(page)).length <= 6, 'selection only names a few neighbors');
  const selectedText = await page.locator('canvas.sigma-hovers').evaluate(canvas => canvas.__drawnText ?? []);
  assert.ok([...await drawnTitles(page), ...selectedText].includes('Notion 1'), 'the selected concept stays named');
  const selected = nodeIndex('notion-1');
  const cites = [], citedBy = [];
  for (let index = 0; index < all.links.length; index += 2) {
    if (all.links[index] === selected) cites.push(all.links[index + 1]);
    if (all.links[index + 1] === selected) citedBy.push(all.links[index]);
  }
  assert.equal(await page.locator('.concept-map-neighbors').nth(0).locator('li').count(), cites.length);
  assert.equal(await page.locator('.concept-map-neighbors').nth(1).locator('li').count(), citedBy.length);
  const open = page.locator('.concept-map-selection a.concept-map-open');
  assert.match(await open.getAttribute('href'), /^\/concepts\/notion-1\?viewLanguage=en$/);
  assert.equal((await open.textContent()).trim(), 'Open the page');
  await page.getByText(`Notion 1: cites ${cites.length}, cited by ${citedBy.length}.`).waitFor({ state: 'attached' });

  // Neighbors are buttons that move the selection along the graph.
  const neighborLabel = all.label[citedBy[0]];
  await page.locator('.concept-map-neighbors').nth(1).getByRole('button', { name: `Show ${neighborLabel} on the map` }).click();
  await heading.getByText(neighborLabel, { exact: true }).waitFor();

  // Titles with mathematics use the rendered HTML, whatever tier they came from.
  await search.fill('Espace');
  await search.press('Enter');
  await heading.locator('sup', { hasText: 'p' }).waitFor();

  // Escape clears the selection from the keyboard.
  await page.locator('.concept-map-stage').focus();
  await page.keyboard.press('Escape');
  await page.locator('.concept-map-selection-hint').waitFor();
  await page.waitForFunction(() => location.hash === '');

  // Canvas: select a concept by clicking it, open its page with a double click.
  await search.fill('Notion 12');
  await search.press('Enter');
  await page.waitForTimeout(700); // camera animation, the concept is now at the center
  await page.locator('.concept-map-close').click();
  const stage = await page.locator('.concept-map-stage').boundingBox();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await heading.getByText('Notion 12', { exact: true }).waitFor();
  await page.mouse.dblclick(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.waitForFunction(() => window.__pushed.includes('/concepts/notion-12?viewLanguage=en'));
  await page.waitForTimeout(400); // outside Sigma's double-click window
  await page.mouse.click(stage.x + 8, stage.y + stage.height - 8); // empty stage
  await page.locator('.concept-map-selection-hint').waitFor();

  // Domain filters hide concepts and drop a selection that became invisible.
  await search.fill('Notion 12');
  await search.press('Enter');
  const selectedDomain = enFirst.domains[all.domain[nodeIndex('notion-12')]];
  await page.locator('.concept-map-domains li', { hasText: domainLabels[selectedDomain.code] }).locator('input').uncheck();
  await page.locator('.concept-map-selection-hint').waitFor();
  await page.getByText(`${enFirst.total.nodes - selectedDomain.count} of ${enFirst.total.nodes} concepts shown`).waitFor();
  await search.fill('Notion 12');
  assert.equal(await page.getByRole('option', { name: /Notion 12/ }).count(), 0, 'hidden domains are not searched');
  await page.getByRole('button', { name: en.conceptMap.allDomains }).click();
  await page.getByText(summaryOf(enFirst)).waitFor();

  // Zoom controls and keyboard shortcuts keep working.
  for (const name of [en.conceptMap.zoomIn, en.conceptMap.zoomOut, en.conceptMap.resetView]) await page.getByRole('button', { name }).click();
  await page.locator('.concept-map-stage').focus();
  for (const key of ['+', 'ArrowLeft', 'ArrowUp', '-', '0']) await page.keyboard.press(key);

  // A shared link with #concept= opens on that concept, even one of the last tier.
  const lateSlug = enLast.nodes.slug[0];
  const lateLabel = enLast.nodes.label[0];
  await page.goto(`${base}/concepts?shared=1#concept=${lateSlug}`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await heading.getByText(lateLabel, { exact: true }).waitFor();
  await page.goto(`${base}/concepts#concept=notion-fr-9`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await page.waitForTimeout(600);
  assert.equal(await heading.count(), 0, 'a French page is not on the English map');
  await page.evaluate(() => { location.hash = '#concept=notion-9'; });
  await heading.getByText('Notion 9', { exact: true }).waitFor();
  assert.equal(await page.locator('.concept-map-index').count(), 0, 'no text version of the map');
  assert.equal(await page.locator('.concept-map-legend, .concept-map-note').count(), 0);

  // The Map/List switch remembers the choice in a durable cookie.
  await page.evaluate(() => sessionStorage.setItem('math-woods:filters:concepts', 'q=groupe&page=2&view=map'));
  await page.locator('.concept-view-switch a', { hasText: 'List' }).click();
  await page.waitForFunction(() => window.__pushed.includes('/concepts?q=groupe&view=list'));
  const cookie = (await context.cookies()).find((item) => item.name === 'math-woods-concepts-view');
  assert.equal(cookie?.value, 'list');
  assert.ok(cookie.expires > Date.now() / 1000 + 300 * 86400);
  assert.deepEqual(errors, []);
  await context.close();

  // Real wheel events at different pixel densities, including ergonomic mouse drivers
  // that report line/page units or emit bursts for one notch. Read the camera through
  // the existing navigation persistence, without adding test hooks to the component.
  for (const deviceScaleFactor of [1, 2]) for (const reducedMotion of ['no-preference', 'reduce']) {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor, reducedMotion });
    page = await context.newPage();
    await page.goto(`${base}/concepts`);
    await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
    const cameraState = () => page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      return JSON.parse(sessionStorage.getItem('math-woods:concept-map:camera'));
    });
    const reset = async () => {
      await page.getByRole('button', { name: en.conceptMap.resetView }).click();
      await page.waitForTimeout(400);
      const state = await cameraState();
      assert.ok(Math.abs(state.x - 0.5) < 0.001 && Math.abs(state.y - 0.5) < 0.001 && Math.abs(state.ratio - 1) < 0.001, 'reset recovers the overview');
    };
    const wheel = async (deltaY, deltaMode = 0, burst = 1) => {
      await page.locator('canvas.sigma-mouse').evaluate((canvas, args) => {
        const box = canvas.getBoundingClientRect();
        for (let i = 0; i < args.burst; i++) canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: box.left + box.width * 0.85,
          clientY: box.top + box.height * 0.75, deltaY: args.deltaY, deltaMode: args.deltaMode
        }));
      }, { deltaY, deltaMode, burst });
      await page.waitForTimeout(200);
      return cameraState();
    };
    for (const [delta, unit, burst] of [[-120,0,1],[-100000,0,1],[-3,1,1],[-1,2,1],[-120,0,100],[120,0,100]]) {
      await reset();
      const state = await wheel(delta, unit, burst);
      assert.ok(state.ratio >= 1 / 1.151 && state.ratio <= 1.151, `bounded notch/burst: ${JSON.stringify({delta,unit,burst,state,deviceScaleFactor,reducedMotion})}`);
      assert.ok(delta < 0 ? state.ratio < 1 : state.ratio > 1, 'wheel direction is respected');
      assert.ok(Math.abs(state.x - 0.5) < 0.2 && Math.abs(state.y - 0.5) < 0.2, 'off-centre wheel does not throw the graph away');
    }
    await reset();
    assert.ok((await wheel(-1)).ratio > 0.99, 'tiny high-resolution event makes a tiny zoom');
    await reset();
    await page.evaluate(() => {
      const key = 'math-woods:concept-map:camera', state = JSON.parse(sessionStorage.getItem(key));
      sessionStorage.setItem(key, JSON.stringify({...state, x: 10000, y: -10000}));
    });
    await page.reload();
    await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
    await page.waitForTimeout(400);
    const restored = await cameraState();
    assert.ok(Math.abs(restored.x - 0.5) < 1 && Math.abs(restored.y - 0.5) < 1, 'an old lost view is constrained back to the graph');
    await reset();
    await context.close();
  }

  // The French map only holds French pages.
  requests.length = 0;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await page.goto(`${base}/concepts?lang=fr#concept=notion-fr-9`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await page.getByText(summaryOf(payloads.fr[0])).waitFor();
  await page.locator('.concept-map-selection h2').getByText('Notion française 9', { exact: true }).waitFor();
  assert.equal(await page.locator('.concept-map-selection a.concept-map-open').getAttribute('href'), '/concepts/notion-fr-9?viewLanguage=fr');
  await page.getByRole('combobox').fill('notion 1');
  const frenchResults = await page.locator('.concept-map-result-label').allTextContents();
  assert.ok(frenchResults.length > 0 && frenchResults.every((label) => label.startsWith('Notion française')), 'found through the other translations, shown in French');
  assert.equal(await page.locator('section.concept-map').getAttribute('lang'), 'fr');
  assert.ok(requests.every((item) => item.startsWith('fr:')), requests.join());
  await context.close();

  // A tier of a newer map is not mixed with the old one: the map starts again from tier 1.
  requests.length = 0;
  staleOnce = true;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await page.goto(`${base}/concepts`);
  await waitFor(() => requests.filter((item) => item === 'en:1').length === 2 && enTierRequests.every((item) => requests.includes(item)), `reload after a stale tier (${requests})`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await page.getByRole('combobox').fill(enLast.nodes.label[0]);
  await page.getByRole('option', { name: new RegExp(enLast.nodes.label[0]) }).first().waitFor();
  await context.close();

  // Errors can be retried; the list stays reachable.
  failApi = true;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await page.goto(`${base}/concepts`);
  await page.getByRole('alert').getByText(en.conceptMap.loadError).waitFor();
  assert.equal(await page.getByRole('link', { name: en.conceptMap.openList }).getAttribute('href'), '/concepts?view=list');
  failApi = false;
  await page.getByRole('button', { name: en.conceptMap.retry }).click();
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await context.close();

  // Without WebGL the page says so and offers the list.
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : original.call(this, type, ...rest); };
  });
  page = await context.newPage();
  await page.goto(`${base}/concepts`);
  await page.getByText(en.conceptMap.webglUnavailable).waitFor();
  assert.equal(await page.getByRole('link', { name: en.conceptMap.openList }).getAttribute('href'), '/concepts?view=list');
  await context.close();

  // Phone: the next tiers wait for a need (zoom, search, selection); touch, collapsible domain
  // filters, selection as a sheet.
  requests.length = 0;
  const { defaultBrowserType: _webkit, ...phone } = devices['iPhone 13'];
  context = await browser.newContext(phone);
  await trackCanvasText(context);
  page = await context.newPage();
  await page.goto(`${base}/concepts`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await page.waitForTimeout(1500);
  const phoneTitles = await drawnTitles(page);
  assert.ok(phoneTitles.length <= 3 && phoneTitles.every(title => Object.values(domainLabels).includes(title)), 'phone overview is limited to domain names');
  assert.deepEqual(requests, ['en:1', 'en:2'], 'a phone loads the overview and the next level only');
  const toggle = page.locator('.concept-map-domains h2 button');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.concept-map-domain-body').isVisible(), false);
  await toggle.click();
  assert.equal(await page.locator('.concept-map-domain-body').isVisible(), true);
  assert.equal(await page.locator('.concept-map-selection').isVisible(), false, 'no empty sheet over the map');
  // Zooming in brings the deeper levels, one step ahead of the camera.
  for (let step = 0; step < 2; step += 1) {
    await page.getByRole('button', { name: en.conceptMap.zoomIn }).tap();
    await page.waitForTimeout(400);
  }
  await waitFor(() => requests.includes('en:3'), `the deeper levels when zooming in (${requests})`);
  assert.deepEqual(requests, enTierRequests);
  await page.getByRole('button', { name: en.conceptMap.resetView }).tap();
  await page.getByRole('combobox').fill('Notion 20');
  await page.getByRole('combobox').press('Enter');
  await page.waitForTimeout(700);
  const sheet = await page.locator('.concept-map-selection').boundingBox();
  const phoneStage = await page.locator('.concept-map-stage').boundingBox();
  assert.ok(sheet.y > phoneStage.y + phoneStage.height * 0.4 && sheet.y + sheet.height <= phoneStage.y + phoneStage.height + 1, 'the sheet covers the bottom of the map');
  await page.locator('.concept-map-close').tap();
  // The concept stays visible above the sheet: tapping where it was centered selects it again.
  await page.touchscreen.tap(phoneStage.x + phoneStage.width / 2, phoneStage.y + phoneStage.height * 0.25);
  await page.locator('.concept-map-selection h2').getByText('Notion 20', { exact: true }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`).join('\n')));
  assert.ok(overflow <= 0, 'no horizontal scroll on a phone');
  await context.close();

  // A search needs every concept: it loads the remaining tiers at once.
  requests.length = 0;
  context = await browser.newContext(phone);
  page = await context.newPage();
  await page.goto(`${base}/concepts`);
  await page.locator('.concept-map-stage[data-ready="true"]').waitFor();
  await page.getByRole('combobox').tap();
  await waitFor(() => enTierRequests.every((item) => requests.includes(item)), `every tier for a search (${requests})`);
  await page.getByRole('combobox').fill(enLast.nodes.label[0]);
  await page.getByRole('option', { name: new RegExp(enLast.nodes.label[0]) }).first().waitFor();
  await context.close();
  console.log(`concept map browser checks passed (${enFirst.total.nodes} concepts in tiers of ${payloads.en.map((payload) => payload.nodes.slug.length).join(' + ')}, ${enFirst.total.links} links)`);
} finally {
  await browser.close();
  server.close();
}
