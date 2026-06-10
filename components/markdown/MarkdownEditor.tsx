"use client";

import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from "@codemirror/view";
import katex from "katex";
import { useEffect, useRef, useState } from "react";
import { findLatexRanges } from "@/lib/latex-ranges";
import { findWikiLinkRanges, headingLevel, markdownPreviewClass } from "@/lib/markdown-preview";
import { overlapsRanges } from "@/lib/markdown-ranges";

type MarkdownEditorProps = {
  name: string;
  initialValue?: string;
  minHeight?: string;
  lineNumbers?: boolean;
};

class LatexWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly displayMode: boolean,
    readonly from: number
  ) {
    super();
  }

  eq(other: LatexWidget) {
    return other.formula === this.formula && other.displayMode === this.displayMode && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "cm-latex-preview cm-latex-display" : "cm-latex-preview cm-latex-inline";
    element.dataset.latexFrom = String(this.from);
    element.title = "Click to edit";
    element.setAttribute("aria-label", `LaTeX: ${this.formula}`);
    katex.render(this.formula, element, {
      displayMode: this.displayMode,
      throwOnError: false
    });
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: this.from + (this.displayMode ? 2 : 1) },
        effects: setPreviewFocus.of(true),
        scrollIntoView: true
      });
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly from: number
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return other.label === this.label && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = "cm-md-wikilink";
    element.textContent = this.label;
    element.title = "Click to edit";
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: this.from + 2 },
        effects: setPreviewFocus.of(true),
        scrollIntoView: true
      });
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

class MarkdownHeadingWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly level: number,
    readonly from: number
  ) {
    super();
  }

  eq(other: MarkdownHeadingWidget) {
    return other.text === this.text && other.level === this.level && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = `cm-md-heading cm-md-heading-${this.level}`;
    element.textContent = this.text;
    element.title = "Click to edit heading";
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: this.from + this.level + 1 },
        effects: setPreviewFocus.of(true),
        scrollIntoView: true
      });
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

function selectionOverlaps(view: EditorView, from: number, to: number) {
  return view.state.field(previewFocusField) && view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

const setPreviewFocus = StateEffect.define<boolean>();
const previewFocusField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPreviewFocus)) return effect.value;
    }
    return value;
  }
});

function buildLivePreviewDecorations(view: EditorView) {
  const text = view.state.doc.toString();
  const latexRanges = findLatexRanges(text);
  const wikiLinks = findWikiLinkRanges(text);
  const previewRanges = [...latexRanges, ...wikiLinks];
  const decorations = latexRanges
    .filter((range) => !selectionOverlaps(view, range.from, range.to))
    .map((range) =>
      Decoration.replace({
        widget: new LatexWidget(range.formula, range.displayMode, range.from),
        inclusive: false
      }).range(range.from, range.to)
    );

  decorations.push(
    ...wikiLinks
      .filter((range) => !selectionOverlaps(view, range.from, range.to))
      .map((range) =>
        Decoration.replace({
          widget: new WikiLinkWidget(range.label, range.from),
          inclusive: false
        }).range(range.from, range.to)
      )
  );

  syntaxTree(view.state).iterate({
    enter(node) {
      if (overlapsRanges(node.from, node.to, previewRanges)) return;
      const parent = node.node.parent;
      const parentName = parent?.name ?? "";
      const isMarkup =
        node.name === "HeaderMark" ||
        node.name === "EmphasisMark" ||
        node.name === "CodeMark" ||
        node.name === "StrikethroughMark" ||
        node.name === "LinkMark" ||
        (node.name === "URL" && parentName === "Link");
      const activeFrom = isMarkup ? (parent?.from ?? node.from) : node.from;
      const activeTo = isMarkup ? (parent?.to ?? node.to) : node.to;
      const active = selectionOverlaps(view, activeFrom, activeTo);
      const level = headingLevel(node.name);
      const previewClass = markdownPreviewClass(node.name);

      if (level && !active) {
        const headingText = view.state.doc.sliceString(node.from, node.to).replace(/^#{1,6}\s*/, "");
        decorations.push(
          Decoration.replace({
            widget: new MarkdownHeadingWidget(headingText, level, node.from),
            inclusive: false
          }).range(node.from, node.to)
        );
        return false;
      }

      if (previewClass && !active) {
        decorations.push(Decoration.mark({ class: previewClass }).range(node.from, node.to));
      }

      if (!active && isMarkup) {
        decorations.push(Decoration.replace({}).range(node.from, node.to));
      }
    }
  });

  return Decoration.set(decorations, true);
}

const liveMarkdownPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update: ViewUpdate) {
      const focusChanged = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setPreviewFocus))
      );
      if (update.docChanged || update.selectionSet || focusChanged) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
);

const previewFocusEvents = EditorView.domEventHandlers({
  mousedown(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(true) });
    return false;
  },
  focusin(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(true) });
    return false;
  },
  focusout(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(false) });
    return false;
  }
});

export function MarkdownEditor({
  name,
  initialValue = "",
  minHeight = "14rem",
  lineNumbers: showLineNumbers = true
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          showLineNumbers ? lineNumbers() : [],
          markdown(),
          previewFocusField,
          EditorView.focusChangeEffect.of((_state, focusing) => setPreviewFocus.of(focusing)),
          liveMarkdownPreview,
          previewFocusEvents,
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              minHeight,
              background: "var(--panel)",
              color: "var(--ink)",
              fontSize: "14px"
            },
            ".cm-content": {
              caretColor: "var(--editor-cursor)",
              fontFamily: "var(--font-sans)",
              padding: "14px"
            },
            ".cm-gutters": {
              background: "var(--panel-muted)",
              borderRight: "1px solid var(--line)",
              color: "var(--muted)"
            },
            ".cm-scroller": {
              minHeight
            },
            ".cm-cursor": {
              borderLeftColor: "var(--editor-cursor) !important",
              borderLeftWidth: "2px"
            },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              background: "var(--accent-soft)"
            },
            "&.cm-focused": {
              outline: "none"
            }
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setValue(update.state.doc.toString());
          })
        ]
      })
    });

    viewRef.current = view;
    const host = hostRef.current;
    const focusIn = () => view.dispatch({ effects: setPreviewFocus.of(true) });
    const focusOut = (event: FocusEvent) => {
      if (!host.contains(event.relatedTarget as Node | null)) {
        view.dispatch({ effects: setPreviewFocus.of(false) });
      }
    };
    const outsideInteraction = (event: Event) => {
      if (!host.contains(event.target as Node | null)) {
        view.dispatch({ effects: setPreviewFocus.of(false) });
      }
    };
    host.addEventListener("focusin", focusIn);
    host.addEventListener("focusout", focusOut);
    document.addEventListener("focusin", outsideInteraction, true);
    document.addEventListener("mousedown", outsideInteraction, true);

    return () => {
      host.removeEventListener("focusin", focusIn);
      host.removeEventListener("focusout", focusOut);
      document.removeEventListener("focusin", outsideInteraction, true);
      document.removeEventListener("mousedown", outsideInteraction, true);
      view.destroy();
      viewRef.current = null;
    };
  }, [initialValue, minHeight]);

  return (
    <div className="markdown-editor">
      <div ref={hostRef} className="markdown-editor-host" />
      <textarea name={name} value={value} readOnly hidden aria-hidden="true" />
    </div>
  );
}
