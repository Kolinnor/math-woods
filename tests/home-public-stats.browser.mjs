import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const baseURL = process.env.MW_LOCAL_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
mkdirSync('runtime/home-public-stats', { recursive: true });
try {
  for (const locale of ['fr', 'en']) {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'math-woods-language', value: locale, url: baseURL }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 120000 });
    assert.equal(response.status(), 200);
    const stats = page.locator('.home-public-stats');
    await stats.waitFor();
    assert.equal(await stats.locator('strong').count(), 3);
    assert.equal(await stats.locator('a').nth(0).getAttribute('href'), '/problems');
    assert.equal(await stats.locator('a').nth(1).getAttribute('href'), '/concepts');
    assert.match(await stats.innerText(), locale === 'fr' ? /concepts à explorer/ : /concepts to explore/);
    console.log(locale, (await stats.innerText()).replaceAll('\n', ' | '));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await stats.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const boxes = await stats.locator('.home-public-stat').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top };
      }));
      assert.ok(boxes[0].right <= boxes[1].left && boxes[1].right <= boxes[2].left);
      await page.screenshot({ path: `runtime/home-public-stats/${locale}-${width}.png` });
      await stats.locator('.field-help').focus();
      assert.ok(await stats.locator('.field-help').evaluate(node => {
        const tip = getComputedStyle(node, '::after');
        const box = node.closest('.home-public-stat').getBoundingClientRect();
        return box.right - parseFloat(tip.width) >= 0;
      }));
      await stats.locator('a').first().focus();
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
