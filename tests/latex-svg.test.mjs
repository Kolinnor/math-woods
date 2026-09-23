import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderInlineMarkdown } from '../lib/markdown.ts';

test('cancellation strokes, vector widths and formula colors survive both Markdown renderers', async () => {
  for (const render of [renderMarkdown, renderInlineMarkdown]) {
    for (const [command, strokes] of [['cancel', 1], ['bcancel', 1], ['xcancel', 2]]) {
      const html = await render(`$\\${command}{n\\times d}$`);
      assert.equal((html.match(/<line\b/g) ?? []).length, strokes);
      assert.match(html, /stroke-width="0\.046em"/);
    }
    const vector = await render('$\\vec{u}$');
    assert.match(vector, /<svg[^>]*style="width:0\.471em"/);
    assert.match(vector, /<path d=/);
    const colored = await render('${\\color{red}\\cancel{\\color{black}n\\times d}}$');
    assert.match(colored, /color:red/);
    assert.match(colored, /color:black/);
    assert.match(colored, /<line\b/);
    assert.match(await render('$\\overrightarrow{u}$'), /<path d=/);
  }
});

test('SVG support does not permit scripts, external resources, events or arbitrary styles', async () => {
  const html = await renderMarkdown(`<svg onload="alert(1)" style="width:2em;position:fixed;background:url(https://evil.test/a)">
<script>alert(1)</script><foreignObject><iframe src="https://evil.test"></iframe></foreignObject>
<use href="https://evil.test/a#x"></use><animate attributeName="href" values="javascript:alert(1)"></animate>
<line x1="0" y1="100%" x2="100%" y2="0" stroke-width="0.046em" onclick="alert(1)" style="stroke:url(https://evil.test)"></line>
<path d="M0 0" onmouseover="alert(1)" fill="url(https://evil.test)"></path></svg>
<span style="color:expression(alert(1));position:fixed;background:url(https://evil.test)">safe</span>`);
  assert.match(html, /style="width:2em"/);
  assert.match(html, /<line\b/);
  assert.doesNotMatch(html, /<script|<foreignobject|<iframe|<use|<animate|onload|onclick|onmouseover|evil\.test|javascript:|expression\(|position:|background:|fill=/i);
});
