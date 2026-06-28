# Markdown and LaTeX Editor Regression Log

This file records editor bugs that have already happened in Math Woods. Read it before touching
`components/markdown/MarkdownEditor.tsx`, `lib/latex-ranges.ts`, `lib/markdown.ts`, or the editor CSS in
`app/globals.css`.

The goal is not ceremony. The goal is to stop a new fix from quietly undoing an older fix.

## 2026-06-28 - Display LaTeX preview must not use plugin-provided block decorations

Symptom:

- Opening `/problems/new` could throw `RangeError: Block decorations may not be specified via plugins`.
- A related CodeMirror measurement error, `No tile at position ...`, could appear immediately before or after it.

Root cause:

- Standalone `$$...$$` previews were rendered as block replacement decorations from a `ViewPlugin`.
- CodeMirror forbids block decorations from plugin decoration sources because they can affect vertical layout after the
  editor has already planned viewport geometry.

Guardrail:

- Live Markdown/LaTeX decorations must be provided by the direct `EditorView.decorations.from(...)` facet through a
  `StateField`, not by `ViewPlugin` decoration output.
- Inline preview widgets may remain inline replacements, but display math widgets that use `block: true` must stay in
  the direct decoration field.

## 2026-06-28 - Raw LaTeX source should remain readable while editing

Expected behavior:

- When a LaTeX range is being edited as raw source, commands such as `\operatorname` and `\longrightarrow` should be
  visually distinct from braces, numbers, operators, and identifiers.
- This highlighting is only an editor aid. It must not affect saved Markdown, server rendering, KaTeX output, or
  copy/paste behavior.

Guardrail:

- Syntax coloring should be implemented with CodeMirror marks over the active raw LaTeX range.
- Do not color hidden/replaced KaTeX preview widgets, and do not change the LaTeX parsing rules just to improve colors.

## 2026-06-28 - `$$...$$` should always preview as display math

Symptom:

- `$x$` rendered in the live editor, but `$$x$$` stayed as raw dollar text when it appeared on a line with other text,
  for example `2x + 1 $$2x+1$$`.
- A later inline fallback made `$$x$$` preview in the middle of a line, but as inline math rather than an Obsidian-like
  centered display equation.

Root cause:

- Display math ranges were skipped entirely unless the `$$...$$` range was alone on its visual line.
- The inline fallback avoided broken block layout, but it made double-dollar syntax behave differently depending on
  surrounding text.

Guardrail:

- Do not skip non-standalone `$$...$$` ranges.
- Double-dollar ranges should render as block/display KaTeX even when they appear after other text on the same line,
  matching Obsidian-style editing.
- Only display ranges that are standalone on their line should use CodeMirror `block: true` decorations.
- Non-standalone `$$...$$` ranges should use an inline replacement widget styled as a shrink-to-fit display preview.
  Using a CodeMirror block decoration or a 100%-wide inline widget in the middle of a line can collapse measurement and
  stack surrounding text one character per visual line.
- In development, mixed-line display previews should publish diagnostics to `window.__mathWoodsEditorDiagnostics`.
  Static diagnostics record why a range used the inline-display fallback; DOM diagnostics warn if the mounted widget
  drifts away from the expected shrink-to-fit CSS or becomes nearly as wide as its CodeMirror line.
- Display math widgets that use CodeMirror `block: true` must still come from the direct
  `EditorView.decorations.from(...)` `StateField`, not from plugin-provided decorations.

## 2026-06-28 - Ordered list markers wrapped as `1` then `)`

Symptom:

- In the live editor, lines starting with ordered-list syntax such as `1)` or `3)` could render as `1` on one visual
  line and `)` on the next.
- This was especially visible near LaTeX blocks, because users often write problem parts after a displayed formula.
- The raw text was still correct, but the live preview looked corrupted while editing.

Root cause:

- CodeMirror's Markdown parser identifies `1)` and similar prefixes as list markers.
- Math Woods replaces Markdown list markers with `MarkdownListMarkWidget`.
- The widget CSS used `width: 1ch`, which is enough for a bullet but too narrow for ordered markers such as `1)`,
  `10)`, or `3.`.

Guardrail:

- `.cm-md-list-mark` must allow `width: max-content` and `white-space: nowrap`.
- Do not reintroduce a fixed `1ch` width for all list markers. If bullets need fixed visual sizing, split bullet and
  ordered-list styling into separate classes.

## 2026-06-28 - Arrow keys skipped rendered LaTeX ranges

Symptom:

- Pressing Left or Right beside a rendered `$...$`, `$$...$$`, `\(...\)`, or `\[...\]` preview jumped over the whole
  math range as if it were an atomic object.
- Pressing Up or Down from a neighboring line could also skip a rendered display math range instead of entering it.
- This made ordinary cursor navigation feel wrong, especially for display math blocks.

Root cause:

- Live LaTeX previews are CodeMirror replacement decorations while the cursor is outside the math range.
- CodeMirror's default arrow movement can move across a replacement decoration boundary without entering the hidden
  source text.

Guardrail:

- Left/Right at a rendered LaTeX boundary should move the cursor just inside the source range and set preview focus so
  the source becomes editable.
- Up/Down from an adjacent line to a line containing rendered LaTeX should also enter the source range when the target
  logical line contains math.
- Once the cursor is inside the source range, native character-by-character cursor movement should take over.
- Do not solve this by removing replacement widgets or by making LaTeX previews permanently editable text.

## Previous editor regressions to preserve

These are known behavioral fixes that should not be broken when changing live preview logic:

- Markdown live preview should update while typing, not only after the editor loses focus.
- Inline math delimited by single dollars, such as `$x^2$`, should render live when the cursor is outside that range.
- Display math delimited by double dollars, such as `$$x^2$$`, should render live when it is a standalone display range.
- Display math delimited by double dollars should render as centered display math even when it appears after other text
  on the same line.
- Pressing Backspace or Delete next to a rendered math range must delete one delimiter character, not the whole math
  block and not a character inside the math content.
- Pressing Backspace at the start of a line that begins with rendered math, for example before `$salut$ $$salut$$`,
  should delete the previous newline like normal text editing, not create or preserve a phantom extra line.
- Pressing Left, Right, Up, or Down next to a rendered math range should enter the math source, not skip over the whole
  range.
- Markdown headings and bullet points should preview in the editor, but their markup must remain editable when the
  cursor enters the relevant range.
- Right-clicking selected text should open the concept-link menu without losing the selected text.
