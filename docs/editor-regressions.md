# Markdown and LaTeX Editor Regression Log

This file records editor bugs that have already happened in Math Woods. Read it before touching
`components/markdown/MarkdownEditor.tsx`, `lib/latex-ranges.ts`, `lib/markdown.ts`, or the editor CSS in
`app/globals.css`.

The goal is not ceremony. The goal is to stop a new fix from quietly undoing an older fix.

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

## Previous editor regressions to preserve

These are known behavioral fixes that should not be broken when changing live preview logic:

- Markdown live preview should update while typing, not only after the editor loses focus.
- Inline math delimited by single dollars, such as `$x^2$`, should render live when the cursor is outside that range.
- Display math delimited by double dollars, such as `$$x^2$$`, should render live when it is a standalone display range.
- Display math should not be preview-replaced when it appears mid-sentence in a way that would destroy surrounding text
  flow; editing raw delimiters must remain possible.
- Pressing Backspace or Delete next to a rendered math range must not delete the whole math block at once.
- Pressing Backspace just after the closing `$` of `$math$` should delete the final math character and reveal/edit the
  math source, rather than doing nothing.
- Markdown headings and bullet points should preview in the editor, but their markup must remain editable when the
  cursor enters the relevant range.
- Right-clicking selected text should open the concept-link menu without losing the selected text.
