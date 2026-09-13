# JSXGraph blocks

Math Woods renders interactive JSXGraph boards from fenced Markdown blocks. The body of the fence can be declarative JSON or a complete HTML figure, including CSS and JavaScript.
HTML figures run in their own sandboxed document.

````markdown
```jsxgraph
{
  "boundingBox": [-5, 5, 5, -5],
  "axis": true,
  "height": 360,
  "elements": [
    {
      "id": "a",
      "type": "slider",
      "parents": [[-4, 4], [1, 4], [-2, 1, 2]],
      "attributes": { "name": "a" }
    },
    {
      "type": "functiongraph",
      "parents": ["a*x^2"],
      "attributes": { "strokeColor": "#2f6f4e", "strokeWidth": 3 }
    }
  ]
}
```
````

## Configuration

- `boundingBox`: `[left, top, right, bottom]`; defaults to `[-5, 5, 5, -5]`.
- `axis`, `grid`, `keepAspectRatio`: optional booleans.
- `height`: optional height from 220 to 720 pixels. The board remains responsive on narrow screens.
- `elements`: ordered JSXGraph element definitions. Later elements may reference earlier element ids in `parents`.
- `id`: optional stable identifier, required when another element or an animation references this element.
- `type`: a supported geometric JSXGraph type such as `point`, `line`, `circle`, `polygon`, `slider`, `glider`,
  `functiongraph`, `curve`, `intersection` or `transformation`.
- `parents`: the normal JSXGraph parent array. String expressions use JSXGraph's restricted mathematical expression parser.
- `attributes`: JSXGraph visual and interaction attributes. HTML, remote media, event handlers and executable content are
  rejected.

## Animation

An optional animation can drive a `slider` or `glider` by id:

```json
"animation": {
  "target": "t",
  "direction": 1,
  "steps": 180,
  "delay": 33,
  "rounds": -1,
  "autoplay": true
}
```

Readers can pause or resume an animation. Autoplay is disabled when the operating system requests reduced motion.

## Editor guardrails

- The shared `Graph` toolbar button inserts a valid starter block in every Markdown editor.
- Keep JSXGraph fences editable as source in CodeMirror. Do not add block decorations or mutate their line structure.
- Invalid graph JSON must fail locally with a rendered message and must never break the surrounding Markdown.

## HTML and JavaScript figures

Paste the complete HTML directly between the existing `jsxgraph` fences. No preset, registration or site release
is needed for each new drawing after this general renderer is deployed. The same block works in previews and pages.
Keep CSS and custom JavaScript inline; include absolute URLs for supported external libraries.

````markdown
```jsxgraph
<!doctype html>
<html lang="fr">
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.13.1/distrib/jsxgraph.css">
  <style>#box { width:100%; height:360px; }</style>
</head>
<body>
  <div id="box"></div>
  <button id="move" type="button">Move the point</button>
  <script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.13.1/distrib/jsxgraphcore.js"></script>
  <script>
    const board = JXG.JSXGraph.initBoard('box', {boundingbox:[-5,5,5,-5], axis:true});
    const point = board.create('point', [1,2], {name:'A'});
    document.getElementById('move').onclick = () => point.moveTo([3,1], 500);
  </script>
</body>
</html>
```
````

HTML fragments with `<style>` and `<script>` also work. An outer pair of `{ ... }` left over from the JSON starter
is tolerated around an HTML paste. Each figure has its own document, so IDs can be reused by another figure.
Standalone JavaScript needs its `<script>` tags and any containers/library imports it uses.
The source remains ordinary editable Markdown. HTML is limited to 200,000 characters; JSON boards keep their 50,000 limit.

The sandbox permits scripts but has no access to the MathWoods DOM, cookies, storage or API. Forms, popups, top navigation
and nested frames are disabled. A CSP placed before the authored markup permits inline scripts/styles and libraries from
jsDelivr, cdnjs, unpkg and jsxgraph.org. Images must be embedded as data/blob URLs; local relative files are not bundled.
External dependencies require a network connection. More restrictive CSPs inside pasted documents still apply.
The document builder is not a sanitizer for use in the parent page: it must always run with `sandbox="allow-scripts"`.

The frame adapts to its content between 220 and 1400 px, with scrolling for taller content. It follows the site color scheme
and releases its browsing context when removed. The `mathwoodsvisibilitychange` event on the figure's window has
`event.detail.visible` for scripts that want to pause offscreen animations. Arbitrary animations are not rewritten.
JavaScript/resource errors are displayed beside the figure without breaking surrounding Markdown.

Validation: `npm run test:core` and `npm run test:jsxgraph:browser`.

Browser behavior references: [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)
and [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
