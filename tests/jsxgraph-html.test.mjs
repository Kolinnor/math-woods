import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsxGraphConfig, encodeJsxGraphConfig, decodeJsxGraphConfig } from '../lib/jsxgraph.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { jsxGraphFrameDocument } from '../lib/jsxgraph-frame.ts';

const document = '<!doctype html><html lang="fr"><head><style>#box{height:360px}</style></head><body><div id="box"></div><script>const label="cœur & ∂"; document.getElementById("box").textContent=label;</script></body></html>';
test('HTML documents, fragments and pasted outer braces survive the real Markdown pipeline', async () => {
  for (const source of [document, `<style>p{color:green}</style><p>Figure</p><script>const t = () => 3;</script>`, '{\n'+document+'\n}']) {
    const parsed = parseJsxGraphConfig(source);
    assert.equal(parsed.ok, true);
    assert.ok('html' in parsed.config);
    assert.deepEqual(decodeJsxGraphConfig(encodeJsxGraphConfig(parsed.config)), parsed);
    const html = await renderMarkdown('```jsxgraph\n'+source+'\n```');
    assert.match(html, /class="jsxgraph-embed"/);
    assert.doesNotMatch(html, /<script|<iframe|<style|<!doctype/i);
    assert.deepEqual(decodeJsxGraphConfig(html.match(/data-jsxgraph="([^"]+)"/)[1]), parsed);
  }
});

test('encoded HTML cannot escape its holder; ordinary Markdown still rejects scripts', async () => {
  const payload = '<div>\" onmouseover=\"alert(1)\"></div><script>parent.document.body.innerHTML="bad"</script>';
  const html = await renderMarkdown('```jsxgraph\n'+payload+'\n```');
  assert.doesNotMatch(html, /" onmouseover=|<script|<iframe/);
  assert.equal(decodeJsxGraphConfig(html.match(/data-jsxgraph="([^"]+)"/)[1]).config.html, payload);
  assert.doesNotMatch(await renderMarkdown(payload), /<script|<[^>]*\sonmouseover=/);
});

test('existing JSON stays valid and restricted; there is no named preset', () => {
  assert.equal(parseJsxGraphConfig('{"elements":[{"type":"point","parents":[0,0]}]}').ok,true);
  for (const source of ['{"preset":"torus-loops"}', '{"html":123}', '{"html":""}', '{"html":"<div></div>","src":"https://example.com"}', '{"elements":[{"type":"point","parents":["window.fetch(1)",0]}]}', '{"elements":[{"type":"text","parents":[0,0,"<script>alert(1)</script>"]}]}']) {
    assert.equal(parseJsxGraphConfig(source).ok,false,source);
  }
});

test('HTML size limit and escaped transport round-trip agree at their boundary', () => {
  const html = '<div>'+ '\n'.repeat(199989) + '</div>';
  assert.equal(html.length,200000);
  const parsed=parseJsxGraphConfig(html);
  assert.equal(parsed.ok,true);
  assert.deepEqual(decodeJsxGraphConfig(encodeJsxGraphConfig(parsed.config)),parsed);
  assert.equal(parseJsxGraphConfig(html+'x').ok,false);
  assert.equal(parseJsxGraphConfig(JSON.stringify({html:html+'x'})).ok,false);
  assert.equal(decodeJsxGraphConfig('%ZZ').ok,false);
});

test('trusted policy precedes authored tags and scripts remain in order', () => {
  const result=jsxGraphFrameDocument(document,'dark');
  assert.ok(result.indexOf('Content-Security-Policy') < result.indexOf(document));
  assert.ok(result.includes(document));
  assert.match(result,/connect-src 'none'/);
  assert.match(result,/base-uri 'none'/);
  assert.match(result,/color-scheme:dark/);
  for (const script of result.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
});
