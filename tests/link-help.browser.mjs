import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), ts = require('typescript');
function loadTs(file) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', code)(require, exports);
  return exports;
}
const { FieldHelp } = loadTs('components/FieldHelp.tsx');
const dictionaries = { fr: loadTs('lib/i18n/dictionaries/fr.ts').fr, en: loadTs('lib/i18n/dictionaries/en.ts').en };
const css = ['12-layout-compatibility', '21-exploration-studio'].map(name => readFileSync(`app/styles/${name}.css`, 'utf8')).join('\n');

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [320, 390, 1280]) for (const locale of ['fr', 'en']) {
      const page = await browser.newPage({ viewport: { width, height: 700 } });
      const labels = dictionaries[locale].markdownEditor;
      const field = (label, help) => React.createElement('label', null,
        React.createElement('span', { className: 'field-label-with-help' }, label, React.createElement(FieldHelp, { text: help })),
        React.createElement('input', { defaultValue: 'Les Éléments' }));
      // Use the link menu's real field markup, shared help component and styles.
      const markup = renderToStaticMarkup(React.createElement('div', { className: 'markdown-link-menu', style: { right: 16, top: 16 } },
        React.createElement('strong', null, labels.addLink),
        React.createElement('p', null, labels.conceptLinkSyntaxHelp),
        field(labels.textShown, labels.textShownHelp), field(labels.linksTo, labels.linksToHelp),
        React.createElement('div', { style: { height: 150 } }, labels.addLink)));
      await page.setContent(`<style>*{box-sizing:border-box}html{font-size:20px}body{margin:0;--panel:white;--ink:#202521;--accent:green;--line-strong:#aaa}${css}</style>${markup}`);
      for (const help of await page.locator('.field-help').all()) {
        for (const mode of ['hover', 'focus']) {
          if (mode === 'hover') await help.hover();
          else { await page.mouse.move(0, 699); await help.focus(); }
          await page.waitForTimeout(150);
          const bounds = await help.evaluate(el => {
            const menu = el.closest('.markdown-link-menu'), label = el.closest('.field-label-with-help');
            const style = getComputedStyle(el, '::after');
            return { visible: style.visibility, tooltipWidth: parseFloat(style.width), labelWidth: label.getBoundingClientRect().width,
              overflow: menu.scrollWidth - menu.clientWidth, text: style.content, viewportOverflow: document.documentElement.scrollWidth > innerWidth };
          });
          assert.equal(bounds.visible, 'visible');
          assert.ok(bounds.tooltipWidth <= bounds.labelWidth + 1, `${engineName}/${locale}/${width}/${mode}: tooltip exceeds the field`);
          assert.ok(bounds.overflow <= 1, `${engineName}/${locale}/${width}/${mode}: horizontal scrolling`);
          assert.equal(bounds.viewportOverflow, false);
          assert.ok(bounds.text.includes(await help.getAttribute('data-tooltip')));
        }
      }
      console.log(`PASS ${engineName} ${locale} ${width}px: both help texts fit on hover and focus`);
      await page.close();
    }
  } finally { await browser.close(); }
}
