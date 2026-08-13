# Markdown and LaTeX Editor Regression Log

This file records editor bugs that have already happened in Math Woods. Read it before touching
`components/markdown/MarkdownEditor.tsx`, `lib/latex-ranges.ts`, `lib/markdown.ts`, or the editor CSS in
`app/globals.css`.

The goal is not ceremony. The goal is to stop a new fix from quietly undoing an older fix.

## 2026-08-13 - JSXGraph source can be folded without changing Markdown

Expected behavior:

- A complete fenced `jsxgraph` block has a small fold control beside its opening line.
- Folding hides only the editor presentation of the block; the complete fenced source remains in the document and is
  still used for saving, undo/redo, copy/paste, search, and rendered output.
- Ordinary Markdown, LaTeX, headings, and non-JSXGraph code blocks do not receive this dedicated fold control.
- Incomplete JSXGraph fences remain fully visible and editable.

## 2026-08-12 - Heading markers must remain visible and editable

Symptom:

- A heading such as `##### Examples` was replaced by a preview widget when the cursor reached the end or left the line.
- Backspace at the end of the heading could then collide with the replacement widget instead of deleting the final
  character normally.
- Heading shortcuts appeared to add invisible Markdown because the inserted `#` markers immediately disappeared.

Guardrail:

- Keep heading source, including every leading `#`, visible at all times.
- Heading shortcuts may still apply heading typography, but must not replace the heading line with a widget or hide its
  `HeaderMark` nodes.
- A caret at either edge of a heading must retain ordinary character-by-character editing behavior.

## 2026-08-05 - Focus events must not dispatch during a CodeMirror update

Symptom:

- Editing a problem could occasionally throw `Calls to EditorView.update are not allowed while an update is in progress`.
- The recorded stack originated from a focus handler on the editor DOM while CodeMirror was synchronizing its view.

Root cause:

- Preview focus was updated synchronously by overlapping CodeMirror and host-level `focusin`/`focusout` handlers.
- A browser focus event can fire while CodeMirror is updating its DOM, making a nested `view.dispatch` illegal.

Guardrail:

- Coalesce preview-focus changes and dispatch them in a microtask after the current CodeMirror update completes.
- Keep only one editor-level focus handler; do not add a second host listener that dispatches the same effect.
- Text edits, selection commands, LaTeX normalization and preview restoration keep their existing transaction paths.

## 2026-08-04 - Missing concept links must lead to a contribution page

Expected behavior:

- A wiki link whose target does not exist remains red, but opens a helpful missing-concept state instead of the
  generic 404 page.
- Preserve the original wiki-link target in the URL so the contribution page and new-concept form can show the
  intended title rather than only a normalized slug.
- Existing concepts and aliases still resolve to their real concept pages.
- Signed-out readers can see the explanation and are sent through sign-in before creating the concept.

## 2026-08-04 - Image borders are optional per image

Expected behavior:

- Rendered Markdown images have no border by default.
- Each image preview exposes a `Border` checkbox that updates only that image.
- Resizing an image must preserve its border choice, and changing the border must preserve its width.
- Keep the setting in Math Woods image URL metadata and remove that metadata from the URL sent to the browser.
- Existing Markdown images and the older `#mw-width-N` syntax must remain valid and borderless by default.

## 2026-08-02 - Exercise question markers must match the rendered page

Symptom:

- Ordered question markers such as `1)` appeared bold in the live editor but not on the rendered problem page.
- Compact sub-question markers such as `1)a)` were not recognized as question structure.

Guardrail:

- Keep the saved Markdown unchanged; recognize question markers for editor decoration and normalize only the temporary
  Markdown passed to the server renderer.
- Support both `1)a)` and `1) a)` without treating marker-like text inside inline or fenced code as a question.
- Do not implement this by changing CodeMirror list replacement behavior or by rewriting the active editor document.

## 2026-07-31 - Local drafts must not hide newer server edits

Symptom:

- A concept or problem changed by another contributor displayed the new text in its viewer, but opening the editor
  could silently restore an older local browser draft instead.

Root cause:

- Markdown drafts stored their own update time, but not the server value from which they were created.
- Draft restoration treated every value different from the current server content as recoverable, even when the server
  had changed after that draft was written.

Guardrail:

- Persist the initial server value with new local drafts and compare it when the editor is reopened.
- Edit pages should also provide the server update time so legacy drafts can be recognized as stale.
- When a local draft conflicts with newer server content, show the latest server version by default and preserve an
  explicit option to restore or discard the local draft. Never silently overwrite either version.

## 2026-07-27 - Heading shortcuts must not capture Shift-only symbols

Symptom:

- The default heading shortcuts used `Shift+1` through `Shift+6`.
- On common QWERTY layouts, those combinations type `!`, `@`, `#`, `$`, `%`, and `^`, so the editor intercepted
  essential symbols. In particular, `Shift+4` could not type the dollar delimiter needed for LaTeX.

Guardrail:

- Default heading shortcuts must use `Ctrl+1` through `Ctrl+6`, never a Shift-only combination.
- Keep application defaults, Prisma defaults, and existing saved default values aligned through a migration.
- Tests must verify that `Ctrl+number` selects the heading level and that `Shift+4` remains available for `$`.
- Users may still configure a different explicit shortcut in settings.

## 2026-07-18 - Autosave responses must not remount an active editor

Symptom:

- While typing in an autosaved exploration block, the caret or selected text could lose focus at apparently random
  moments.

Root cause:

- The autosave server action could return the freshly saved Markdown as a new `initialValue` prop.
- `MarkdownEditor` recreates its CodeMirror instance when `initialValue` changes, so the network response destroyed the
  active selection. The variable request duration made the interruption look random.

Guardrail:

- Autosaved Markdown fields must keep their initialization value stable for the lifetime of the mounted field.
- Switching to another block should mount a new field normally; an autosave response for the current block must not
  replace its active CodeMirror instance.
- Do not solve this by changing LaTeX preview decorations or Markdown parsing.

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
- Do not use CodeMirror `block: true` decorations for live display math previews; even standalone display replacements
  can destabilize line measurement when nearby text is edited.
- Non-standalone `$$...$$` ranges should use an inline replacement widget styled as a shrink-to-fit display preview.
  Using a CodeMirror block decoration or a 100%-wide inline widget in the middle of a line can collapse measurement and
  stack surrounding text one character per visual line.
- In development, mixed-line display previews should publish diagnostics to `window.__mathWoodsEditorDiagnostics`.
  Static diagnostics record why a range used the inline-display fallback; DOM diagnostics warn if the mounted widget
  drifts away from the expected shrink-to-fit CSS or becomes nearly as wide as its CodeMirror line.
- Display math widgets must still come from the direct `EditorView.decorations.from(...)` `StateField`, not from
  plugin-provided decorations.

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

## 2026-07-02 - MarkdownEditor must not be wrapped in a label

Symptom:

- Clicking anywhere inside the Markdown editor, or even moving over the editor area in some browser states, behaved as
  though the toolbar Image button had been clicked.
- This made concept/problem definitions impossible to edit because the browser kept activating the hidden file input.

Root cause:

- Several forms wrapped `<MarkdownEditor />` or `<LazyMarkdownEditor />` in a `<label>`.
- After image uploads were added, the editor contained a hidden `<input type="file">`; a label activates labelable
  controls inside it, so the whole editor area became a file-upload trigger.

Guardrail:

- Do not wrap `MarkdownEditor` or `LazyMarkdownEditor` in `<label>`. Use a neutral wrapper such as
  `<div className="grid gap-2">` plus a visual `<span className="text-sm font-medium">...</span>`.
- If the editor needs an accessible label in the future, pass an explicit prop and use `aria-labelledby`/`aria-label`
  on the editor host rather than an enclosing HTML label.

## 2026-06-30 - Markdown display math should render on its own centered line

Symptom:

- In rendered Markdown, text like `Before $$x^2$$ after` could keep the display equation inside the same paragraph
  flow even though double-dollar math is meant to read as a centered display equation.
- A previous fix only centered KaTeX display text with CSS; it did not force mixed-line `$$...$$` ranges onto their own
  rendered line.

Guardrail:

- Server-side Markdown rendering may split display math tokens onto standalone Markdown lines before `marked` parses the
  document.
- Do not apply that block splitting to `renderInlineMarkdown`, because problem titles and compact labels still need an
  inline-safe representation.
- Do not use this server-rendering rule as a reason to turn mixed-line `$$...$$` live-editor previews into CodeMirror
  block decorations; non-standalone display ranges in the editor must keep the shrink-to-fit inline-display fallback.

## 2026-06-30 - Mixed-line `$$...$$` should become standalone in the editor

Symptom:

- The rendered Markdown path split `Before $$x^2$$ after` correctly, but the live editor still only showed a fully
  centered block when the double-dollar range was already alone on its source line.

Guardrail:

- When a complete display math range is typed or pasted on a mixed line, normalize the Markdown source so the display
  range becomes its own line, for example `Before $$x^2$$ after` becomes `Before`, `$$x^2$$`, `after`.
- This lets the standalone display preview use the same source-line shape as rendered Markdown without adding blank
  lines or relying on CodeMirror `block: true` decorations.
- Do not make mixed-line display previews use a CodeMirror block decoration before the source has been normalized.

## 2026-06-30 - Avoid block decorations for display math in the editor

Symptom:

- Deleting near a rendered `$$...$$` block could make the next paragraph collapse into a one-character-wide column.
- A temporary attempt to force blank lines around display math avoided some adjacency cases but introduced a new bug:
  after typing `$$0=0$$`, moving to the next line, and typing a character, the character appeared on the third line.

Guardrail:

- The editor-side display math normalizer may put mixed-line `$$...$$` ranges on their own source line, but it must not
  add physical blank lines around display math.
- This normalization must happen in a CodeMirror transaction filter, before the editor renders/measures the dangerous
  intermediate state; doing it later from an update listener can leave stale one-character-wide measurements behind.
- Display math previews should be visually block-like through the widget's CSS, but they must not use CodeMirror
  `block: true` replacement decorations.

## 2026-07-03 - Multi-line deletion near LaTeX should suppress all previews briefly

Symptom:

- Selecting multiple visual/logical lines near inline LaTeX such as `$P'$`, then deleting the selection, could recreate
  the one-character-per-line layout collapse below the edit.
- The issue was easier to trigger in longer editor content than in short isolated snippets.

Root cause:

- The existing newline-deletion guard only suppressed LaTeX replacement previews on the cursor's joined line.
- During a multi-line deletion, CodeMirror can still measure nearby lower LaTeX replacement widgets while the document
  height and line wrapping are being recomputed.

Guardrail:

- When a transaction removes a newline, temporarily render all LaTeX ranges as raw source/highlighted tokens instead of
  replacement previews, not only ranges on the cursor line.
- This suppression should last only for that post-deletion editor state; previews may return on the next ordinary
  edit/focus transaction.

## 2026-07-17 - Temporary LaTeX suppression should resume automatically

Symptom:

- After some edits near display math, every live LaTeX preview could remain visible as raw highlighted source until the
  user clicked elsewhere in the editor.

Root cause:

- The multi-line deletion guard correctly suppressed all replacement previews for the dangerous post-deletion state,
  but it relied on a later edit, selection, or focus transaction to rebuild them.

Guardrail:

- Keep the global one-state suppression when a transaction removes a newline; it protects CodeMirror from stale
  one-character-wide line measurements.
- Schedule a dedicated, non-history transaction after the guarded layout has had time to settle so previews return
  automatically. Do not make restoration depend on a user click or unrelated edit.
- Continue deriving live-preview decorations from a `StateField`; the scheduling plugin must only request restoration,
  not own or mutate decorations directly.

## 2026-07-17 - Inline dollar autoclose must not be parsed as a display range

Symptom:

- Pressing `$` once to open inline math could unexpectedly move surrounding text onto new lines.
- The issue only appeared when non-whitespace text followed the cursor and another `$$` delimiter existed later in the
  document, which made it difficult to reproduce consistently.

Root cause:

- Inline dollar autoclose temporarily inserts `$$` with the cursor between the two characters.
- Before the user typed the inline formula, the display parser could pair that temporary `$$` with a later display
  delimiter across multiple lines. The display-line normalizer then treated the false range as genuine and rewrote the
  document with line breaks.

Guardrail:

- Mark the transaction that creates a fresh inline autoclose pair and skip display-line normalization for that
  transaction only.
- Do not disable normalization for the second `$` that promotes the pair toward `$$$$`/`$$...$$`, selected-text inline
  wrapping, ordinary edits inside a completed display range, or display-math keyboard shortcuts.
- Keep the parser and normalizer behavior for genuine `$$...$$` ranges unchanged.

## 2026-07-17 - Standalone display previews should remain vertically compact

Symptom:

- Consecutive source lines containing standalone `$$...$$` ranges appeared separated by large blank vertical areas in
  the live editor, even though the Markdown contained no blank logical lines.

Root cause:

- Display previews intentionally remained inline CodeMirror replacement decorations to avoid earlier block-measurement
  failures, but their root `<span>` was changed to `display: block` in CSS.
- CodeMirror places inline widget buffers before and after non-editable replacement widgets. Turning only the widget
  into a CSS block split those buffers and the widget across anonymous line boxes; explicit widget margin and padding
  increased the resulting height further.

Guardrail:

- Keep the root element of a non-block CodeMirror display widget inline-level (`inline-block`). Do not simulate a block
  by setting that root to `display: block`.
- Center an inactive standalone display preview with a line decoration on its existing CodeMirror source line. Do not
  apply that centering to mixed-content lines or while the range is being edited as raw source.
- Do not reintroduce `block: true` CodeMirror decorations or a full-width inline widget. Keep vertical margin at zero
  and use only compact padding so consecutive display lines remain close without touching.
- Do not put `overflow-x: auto` on the shrink-to-fit display widget itself: some browsers expose a tiny native
  scrollbar under short formulas. Let the editor scroller handle genuinely oversized content.

## 2026-07-19 - KaTeX should follow compact text sizing

Symptom:

- Markdown and live LaTeX could stay visually large inside compact UI, even when the surrounding text used a smaller
  font size.

Root cause:

- The shared rendered Markdown wrapper used an absolute `rem` size, so it ignored its container's local text scale.
- KaTeX's default `1.21em` size also enlarged live previews relative to CodeMirror's source text.

Guardrail:

- Keep rendered Markdown font sizing relative to its container (`em` or `inherit`) so its KaTeX scales with compact UI.
- Keep live KaTeX previews at the editor line's inherited font size. Do not restore KaTeX's default enlargement inside
  CodeMirror.

## 2026-07-23 - Inline KaTeX should share the surrounding text scale

Symptom:

- Inline variables in rendered content appeared raised and oversized beside ordinary prose, especially lowercase
  symbols such as `$d$` after text set in Spectral.

Root cause:

- KaTeX's bundled stylesheet applies `font-size: 1.21em` to every `.katex` root. Compact editor and title contexts
  already overrode that enlargement, but full rendered Markdown did not, so its math was 21% larger than its prose.

Guardrail:

- Keep the global `.katex` root at `font-size: 1em` so inline and display formulas inherit the scale of their context.
- Do not compensate with a global `vertical-align` nudge; that can misalign fractions, subscripts, display math, and
  live editor widgets. Let KaTeX's own struts handle the baseline after the font sizes match.

## 2026-07-23 - Link targets must keep concepts and problems distinct

Expected behavior:

- The editor link menu defaults to concepts and can switch explicitly to existing problems.
- Concept links keep the `[[target|label]]` syntax used by concept backlinks, aliases, missing-page links, and
  translation routing.
- Problem links use an internal Markdown link, `[label](/problems/slug)`, so a concept and a problem may share a slug
  without resolving to the wrong content type.
- Concept links remain blue. Problem links use the site's orange-red accent in rendered Markdown and on their visible
  label in the live editor, while keeping ordinary Markdown-link editing behavior.
- Problem mode must resolve an existing suggestion before enabling insertion. It must not offer the concept-specific
  missing-page creation flow.

Guardrail:

- Do not make every wiki-link target infer its type from the slug. That would be ambiguous and would change existing
  concept-link semantics.
- Switching the menu type must not remount CodeMirror or alter the selected source range before the user confirms.

## 2026-07-19 - JSXGraph fences stay source-editable

Guardrail:

- The shared Graph toolbar inserts a fenced `jsxgraph` JSON block at the selection with clean surrounding line breaks.
- Keep JSXGraph fences as ordinary source in CodeMirror. Do not turn them into block decorations or normalize their
  internal lines; the interactive board is mounted only in rendered Markdown.
- LaTeX detection must continue to ignore fenced code, including JSXGraph expression strings.

## 2026-07-20 - Rendered display math must not add a blank line after itself

Symptom:

- Markdown with three consecutive source lines (`text`, `$$...$$`, `text`) rendered a large empty vertical gap
  between the displayed equation and the following text, even though the source contained no blank line.

Root cause:

- With `breaks: true`, Marked emitted a `<br />` after the protected display-math token.
- KaTeX already renders `.katex-display` as a block, so that trailing break created an additional empty line and its
  default display margin made the gap more noticeable.

Guardrail:

- Remove only the generated `<br />` immediately following a display-math token before restoring its KaTeX HTML.
- Keep inline math and explicit Markdown paragraph breaks unchanged.
- Keep rendered `.prose-math .katex-display` margins compact; do not change CodeMirror display decorations for this
  viewer-only issue.

## 2026-07-20 - Backspace at a rendered wiki-link boundary must delete one bracket

Symptom:

- Pressing Backspace immediately after a rendered `[[target|label]]` preview did nothing, making the link appear
  undeletable from its right edge.

Root cause:

- The complete wiki-link source was hidden behind a CodeMirror replacement widget.
- Boundary-aware deletion existed for rendered LaTeX ranges, but not for rendered wiki-links.

Guardrail:

- Backspace immediately after a rendered wiki-link must delete only its final `]`.
- Delete immediately before a rendered wiki-link must delete only its first `[`. Selections and ordinary cursor
  positions must keep CodeMirror's native deletion behavior.
- Wiki-link-like text inside Markdown code spans or fences must not receive this special handling.

## 2026-07-27 - Multi-line display selections must remove the active preview before deletion

Symptom:

- Selecting everything inside a multi-line `$$...$$` range, while leaving both delimiters in place, then pressing
  Backspace could leave the old KaTeX preview squeezed into a one-character-wide column.
- The Markdown deletion itself was correct: the document became `$$$$`. The corruption was a stale editor layout,
  not saved text.

Root cause:

- An active display-math range intentionally showed raw source plus a secondary KaTeX widget anchored at the closing
  delimiter.
- That secondary widget remained mounted while the multi-line selection was deleted. CodeMirror could measure it
  against the collapsed post-deletion line before removing it.

Guardrail:

- While a non-empty selection crosses a line break inside a LaTeX range, keep only the raw highlighted source and do
  not mount the secondary active display preview.
- Keep the active preview for cursor-only edits and single-line selections.
- Preserve the existing one-state global preview suppression after transactions that remove line breaks.

## 2026-08-04 - Collapsible sections remain ordinary editor source

Syntax:

```md
:::fold Section title
Markdown, wiki links and LaTeX remain available here.
:::
```

Guardrail:

- The shared Fold toolbar inserts the source block and selects its placeholder title. If text is selected, preserve it
  as the body of the new section.
- Keep the complete block visible and editable in CodeMirror. Do not replace it with a widget or hide its body in the
  live editor; collapsing happens only in rendered Markdown through native `details` and `summary` elements.
- A fold marker inside a fenced code block stays literal. An unclosed fold also stays literal rather than swallowing the
  rest of the document.
- Fold bodies use the normal Markdown, wiki-link, image and KaTeX rendering pipeline. Inline-only Markdown rendering
  must not interpret fold blocks.
- Nested fold blocks are intentionally unsupported in this first version.
