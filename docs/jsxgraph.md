# JSXGraph blocks

Math Woods renders interactive JSXGraph boards from fenced Markdown blocks. The body of the fence is declarative JSON;
JavaScript is intentionally not executed from user-authored content.

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
