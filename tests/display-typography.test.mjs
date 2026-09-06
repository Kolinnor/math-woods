import test from "node:test";
import assert from "node:assert/strict";
import { displayTypography } from "../lib/display-typography.ts";
import { renderMarkdown } from "../lib/markdown.ts";

test("FR/EN prose, Unicode letters and escaped apostrophes display typographically", () => {
  const input = "<p>L'aire n'est pas l'espace. It's Alice's turn. l'été l'œuvre l'e\u0301tude l&#39;aire l&#x27;aire l&apos;aire</p>";
  assert.equal(displayTypography(input), "<p>L’aire n’est pas l’espace. It’s Alice’s turn. l’été l’œuvre l’e\u0301tude l’aire l’aire l’aire</p>");
  assert.equal(displayTypography("'bonjour' y' 5'4 1990's l’aire"), "'bonjour' y' 5'4 1990's l’aire");
  assert.equal(displayTypography(displayTypography(input)), displayTypography(input));
});

test("tags, attributes, comments, code, math, graphs and editable content are unchanged", () => {
  const protectedHtml = `<pre><code>l'aire &lt;x&gt; l&#39;aire</code></pre><kbd>it's</kbd><samp>it's</samp>
<span class="katex"><span>f'g l&#39;aire</span></span><span class="katex-error">f'g</span>
<math><mtext>l'aire</mtext><annotation>f'g</annotation></math>
<div data-jsxgraph="{&quot;label&quot;:&quot;l'aire&quot;}">l'aire</div>
<textarea>l'aire</textarea><input value="l'aire"><div contenteditable="true"><b>l'aire</b></div>
<!-- l'aire --><span title="l'aire > d'ici" data-value="l'aire">l’aire</span>`;
  assert.equal(displayTypography(protectedHtml), protectedHtml);
  assert.equal(displayTypography(`${protectedHtml}<p>l'aire</p>`), `${protectedHtml}<p>l’aire</p>`);
});

test("URL destinations, visible URLs and email addresses are preserved; link prose improves", () => {
  const html = `<a href="https://example.org/l'aire">l'article</a> https://example.org/l'aire?q=d'ici www.example.org/l'aire o'connor@example.org`;
  assert.equal(displayTypography(html), html.replace("l'article", "l’article"));
  const linkedUrl = `<a href="https://example.org/l'aire">https://example.org/l'aire</a>`;
  assert.equal(displayTypography(linkedUrl), linkedUrl);
});

test("real Markdown rendering preserves source, KaTeX, code and links, including folds", async () => {
  const source = "L'aire et $f'g$ : `l'aire`.\n\n```text\nl'aire\n```\n\n[l'article](https://example.org/l'aire)\n\n:::fold L'exemple\nIt's useful.\n:::";
  const originalHtml = await renderMarkdown(source);
  const result = displayTypography(originalHtml);
  assert.match(result, /L’aire/);
  assert.match(result, /L’exemple/);
  assert.match(result, /It’s useful/);
  assert.match(result, /l’article/);
  for (const segment of originalHtml.matchAll(/<code[^>]*>[\s\S]*?<\/code>|<span class="katex">[\s\S]*?<\/annotation>/g)) {
    assert.ok(result.includes(segment[0]), "Rendered code and math must remain identical");
  }
  assert.equal(await renderMarkdown(source), originalHtml, "Display must not rewrite the stored/rendered source");
});
