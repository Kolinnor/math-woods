import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import katex from 'katex';
import { renderMarkdown } from '../lib/markdown.ts';
import * as problemStyles from '../lib/problem-styles.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const exports = {};
new Function('require', 'exports', ts.transpileModule(readFileSync('components/ProblemClassificationFields.tsx', 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
}).outputText)(name => name === '@/lib/problem-styles' ? problemStyles : require(name), exports);
const katexCss = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8').replace(/url\((fonts\/[^)]+)\)/g,
  (_, file) => `url(data:font/woff2;base64,${readFileSync(`node_modules/katex/dist/${file}`).toString('base64')})`);
const layout = readFileSync('app/layout.tsx', 'utf8');
const css = katexCss + readFileSync('app/globals.css', 'utf8').replace(/@import[^;]+;/g, '')
  + [...layout.matchAll(/import "\.\/(styles\/[^\"]+\.css)"/g)].map(m => readFileSync(`app/${m[1]}`, 'utf8')).join('\n');

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style><div class="prose-math">${await renderMarkdown('Left | Center | Right | Default\n:--- | :---: | ---: | ---\na | b | c | d')}</div>`);
    for (const tag of ['th', 'td']) {
      assert.deepEqual(await page.locator(tag).evaluateAll(cells => cells.map(cell => getComputedStyle(cell).textAlign)), ['left', 'center', 'right', 'left']);
    }
    // Identical styling for live KaTeX and the sanitized preview/published output.
    for (const formula of ['\\vec{u}', '\\overrightarrow{u}', '\\cancel{n\\times d}', '\\bcancel{x}', '\\xcancel{x}', '{\\color{red}\\cancel{\\color{black}n\\times d}}']) {
      await page.setContent(`<style>${css}</style><div id="direct" class="prose-math">${katex.renderToString(formula)}</div><div id="final" class="prose-math">${await renderMarkdown(`$${formula}$`)}</div>`);
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ['direct', 'final'].map(id => [...document.querySelectorAll(`#${id} svg`)].map(svg => ({
        width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height,
        strokes: [...svg.querySelectorAll('line')].map(line => ({ stroke: getComputedStyle(line).stroke, width: getComputedStyle(line).strokeWidth }))
      }))));
      assert.ok(metrics[1][0].width > 0, `${engine.name()}: visible ${formula}`);
      assert.deepEqual(metrics[1], metrics[0], `${engine.name()}: preview matches KaTeX for ${formula}`);
    }
    for (const width of [320, 800]) for (const locale of ['fr', 'en']) {
      await page.setViewportSize({ width, height: 900 });
      const fields = renderToStaticMarkup(React.createElement(exports.ProblemClassificationFields, { locale }));
      await page.setContent(`<style>${css}</style><form class="problem-compose-form">${fields}</form>`);
      const boxes = page.locator('.problem-style-option input');
      for (const box of await boxes.all()) {
        const bounds = await box.boundingBox();
        assert.ok(bounds.width >= 12 && bounds.width <= 24, `${engine.name()}/${locale}/${width}: checkbox width ${bounds.width}`);
        await box.locator('..').click(); assert.equal(await box.isChecked(), true);
        await box.focus(); await page.keyboard.press('Space'); assert.equal(await box.isChecked(), false);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${engine.name()}/${locale}/${width}: no horizontal overflow`);
    }
    console.log(`PASS ${engine.name()}: KaTeX vectors/cancellation and FR/EN checkboxes at 320/800px`);
  } finally { await browser.close(); }
}
