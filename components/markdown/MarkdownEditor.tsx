"use client";

import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Prec, StateEffect, StateField, Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  WidgetType
} from "@codemirror/view";
import katex from "katex";
import { useEffect, useRef, useState } from "react";
import { latexDeleteChange, type LatexDeleteDirection } from "@/lib/latex-deletion";
import {
  latexPreviewDiagnosticsForRange,
  latexPreviewRenderMode,
  latexPreviewUsesBlockDecoration,
  type LatexPreviewDiagnostic
} from "@/lib/latex-live-preview";
import {
  latexCursorTargetForArrow,
  latexCursorTargetForVerticalArrow,
  type LatexArrowDirection,
  type LatexVerticalArrowDirection
} from "@/lib/latex-navigation";
import { findLatexRanges } from "@/lib/latex-ranges";
import { findLatexSyntaxTokens } from "@/lib/latex-syntax-highlight";
import { findWikiLinkRanges, headingLevel, markdownPreviewClass } from "@/lib/markdown-preview";
import { overlapsRanges } from "@/lib/markdown-ranges";

const DRAFT_PREFIX = "math-woods-markdown-draft";

type LatexWidgetLayoutDiagnostic = {
  code: "inline-display-widget-measured-wide" | "inline-display-widget-style-drift";
  severity: "warning";
  message: string;
  from: number;
  to: number;
  formula: string;
  line: LatexPreviewDiagnostic["line"];
  layout: LatexPreviewDiagnostic["layout"];
  measured: {
    widgetWidth: number;
    lineWidth: number;
    display: string;
    width: string;
    katexDisplay: string | null;
    katexWidth: string | null;
  };
};

type MathWoodsEditorDiagnostics = {
  latexPreviews: LatexPreviewDiagnostic[];
  latexLayoutWarnings: LatexWidgetLayoutDiagnostic[];
};

declare global {
  interface Window {
    __mathWoodsEditorDiagnostics?: MathWoodsEditorDiagnostics;
  }
}

type LinkMenuState = {
  x: number;
  y: number;
  from: number;
  to: number;
  selectedText: string;
};

type ConceptSuggestion = {
  title: string;
  slug: string;
  aliases: string[];
};

type MarkdownEditorProps = {
  name: string;
  initialValue?: string;
  minHeight?: string;
  lineNumbers?: boolean;
  draftKey?: string;
};

type MarkdownDraft = {
  value: string;
  updatedAt: number;
};

function readMarkdownDraft(key: string): MarkdownDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MarkdownDraft>;
    if (typeof parsed.value !== "string" || typeof parsed.updatedAt !== "number") return null;
    return { value: parsed.value, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function writeMarkdownDraft(key: string, value: string) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        value,
        updatedAt: Date.now()
      } satisfies MarkdownDraft)
    );
  } catch {
    // Drafts are a convenience layer; editing must continue if storage is unavailable.
  }
}

function removeMarkdownDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

function formatDraftTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function cleanWikiLinkTarget(value: string) {
  return value.replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim();
}

function wikiLinkMarkup(target: string, label: string) {
  const cleanTarget = cleanWikiLinkTarget(target || label);
  const cleanLabel = label.replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleanTarget) return cleanLabel;
  if (!cleanLabel || cleanLabel.toLowerCase() === cleanTarget.toLowerCase()) return `[[${cleanTarget}]]`;
  return `[[${cleanTarget}|${cleanLabel}]]`;
}

function parseSelectedWikiLink(value: string) {
  const match = value.match(/^\[\[([^\]\n]+)\]\]$/);
  if (!match) return null;

  const [target, label] = match[1].split("|", 2);
  return {
    target: cleanWikiLinkTarget(target),
    label: (label ?? target).replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim()
  };
}

class LatexWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly renderDisplayMode: boolean,
    readonly useBlockLayout: boolean,
    readonly from: number,
    readonly editOffset: number,
    readonly diagnosticSignature: string,
    readonly diagnostics: LatexPreviewDiagnostic[]
  ) {
    super();
  }

  eq(other: LatexWidget) {
    return (
      other.formula === this.formula &&
      other.renderDisplayMode === this.renderDisplayMode &&
      other.useBlockLayout === this.useBlockLayout &&
      other.from === this.from &&
      other.editOffset === this.editOffset &&
      other.diagnosticSignature === this.diagnosticSignature
    );
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.useBlockLayout ? "div" : "span");
    element.className = this.renderDisplayMode
      ? `cm-latex-preview cm-latex-display${this.useBlockLayout ? "" : " cm-latex-display-inline"}`
      : "cm-latex-preview cm-latex-inline";
    element.dataset.latexFrom = String(this.from);
    element.dataset.latexLayout = this.useBlockLayout ? "block-display" : this.renderDisplayMode ? "inline-display" : "inline";
    element.title = "Click to edit";
    element.setAttribute("aria-label", `LaTeX: ${this.formula}`);
    katex.render(this.formula, element, {
      displayMode: this.renderDisplayMode,
      throwOnError: false
    });
    scheduleLatexWidgetLayoutDiagnostics(element, this.diagnostics);
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: this.from + this.editOffset },
        effects: setPreviewFocus.of(true),
        annotations: previewOnly,
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
        annotations: previewOnly,
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
        annotations: previewOnly,
        scrollIntoView: true
      });
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

class MarkdownListMarkWidget extends WidgetType {
  constructor(
    readonly marker: string,
    readonly from: number
  ) {
    super();
  }

  eq(other: MarkdownListMarkWidget) {
    return other.marker === this.marker && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = "cm-md-list-mark";
    element.textContent = /^[*+-]$/.test(this.marker) ? "\u2022" : this.marker;
    element.title = "Click to edit list marker";
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: this.from + this.marker.length },
        effects: setPreviewFocus.of(true),
        annotations: previewOnly,
        scrollIntoView: true
      });
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

function selectionOverlapsRange(state: EditorState, from: number, to: number) {
  if (!state.field(previewFocusField)) return false;

  return state.selection.ranges.some((range) => {
    if (range.empty) return range.from > from && range.from < to;
    return Math.max(range.from, from) < Math.min(range.to, to);
  });
}

function latexOpeningDelimiterLength(text: string, position: number) {
  return text.startsWith("$$", position) || text.startsWith("\\(", position) || text.startsWith("\\[", position) ? 2 : 1;
}

function deleteLatexBoundaryCharacter(view: EditorView, direction: LatexDeleteDirection) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const text = view.state.doc.toString();
  const change = latexDeleteChange(text, selection.from, direction);
  if (!change) return false;

  view.dispatch({
    changes: { from: change.from, to: change.to },
    selection: { anchor: change.anchor },
    effects: setPreviewFocus.of(true),
    scrollIntoView: true
  });
  return true;
}

function enterLatexWithArrow(view: EditorView, direction: LatexArrowDirection) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const target = latexCursorTargetForArrow(view.state.doc.toString(), selection.from, direction);
  if (target === null) return false;

  view.dispatch({
    selection: { anchor: target },
    effects: setPreviewFocus.of(true),
    annotations: previewOnly,
    scrollIntoView: true
  });
  return true;
}

function enterLatexWithVerticalArrow(view: EditorView, direction: LatexVerticalArrowDirection) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const target = latexCursorTargetForVerticalArrow(view.state.doc.toString(), selection.from, direction);
  if (target === null) return false;

  view.dispatch({
    selection: { anchor: target },
    effects: setPreviewFocus.of(true),
    annotations: previewOnly,
    scrollIntoView: true
  });
  return true;
}

const setPreviewFocus = StateEffect.define<boolean>();
const previewOnly = Transaction.addToHistory.of(false);
const previewFocusField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPreviewFocus)) return effect.value;
    }
    return value;
  }
});

const latexDiagnosticWarningKeys = new Set<string>();

function editorDiagnosticsEnabled() {
  return process.env.NODE_ENV !== "production";
}

function editorDiagnosticsStore() {
  if (!editorDiagnosticsEnabled() || typeof window === "undefined") return null;

  window.__mathWoodsEditorDiagnostics ??= {
    latexPreviews: [],
    latexLayoutWarnings: []
  };
  return window.__mathWoodsEditorDiagnostics;
}

function keepLatest<T>(items: T[], limit: number) {
  if (items.length > limit) items.splice(0, items.length - limit);
}

function latexDiagnosticSignature(diagnostics: LatexPreviewDiagnostic[]) {
  return diagnostics
    .map((diagnostic) => `${diagnostic.code}:${diagnostic.from}:${diagnostic.to}:${diagnostic.layout.kind}:${diagnostic.line.text}`)
    .join("|");
}

function reportLatexPreviewDiagnostics(diagnostics: LatexPreviewDiagnostic[]) {
  if (diagnostics.length === 0) return;

  const store = editorDiagnosticsStore();
  if (!store) return;

  store.latexPreviews.push(...diagnostics);
  keepLatest(store.latexPreviews, 200);

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "info") continue;

    const key = latexDiagnosticSignature([diagnostic]);
    if (latexDiagnosticWarningKeys.has(key)) continue;
    latexDiagnosticWarningKeys.add(key);

    const log = diagnostic.severity === "error" ? console.error : console.warn;
    log("[Math Woods editor] LaTeX preview diagnostic", diagnostic);
  }
}

function reportLatexLayoutWarning(warning: LatexWidgetLayoutDiagnostic) {
  const store = editorDiagnosticsStore();
  if (!store) return;

  store.latexLayoutWarnings.push(warning);
  keepLatest(store.latexLayoutWarnings, 100);

  const key = `${warning.code}:${warning.from}:${warning.to}:${warning.measured.widgetWidth}:${warning.measured.lineWidth}:${warning.layout.kind}`;
  if (latexDiagnosticWarningKeys.has(key)) return;
  latexDiagnosticWarningKeys.add(key);
  console.warn("[Math Woods editor] LaTeX layout warning", warning);
}

function scheduleLatexWidgetLayoutDiagnostics(element: HTMLElement, diagnostics: LatexPreviewDiagnostic[]) {
  if (!editorDiagnosticsEnabled() || typeof window === "undefined") return;

  const inlineDisplayDiagnostic = diagnostics.find(
    (diagnostic) => diagnostic.code === "display-math-inline-display-fallback"
  );
  if (!inlineDisplayDiagnostic) return;

  window.requestAnimationFrame(() => {
    const lineElement = element.closest(".cm-line") as HTMLElement | null;
    if (!lineElement || !element.isConnected) return;

    const rect = element.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const katexDisplay = element.querySelector(".katex-display") as HTMLElement | null;
    const katexStyle = katexDisplay ? window.getComputedStyle(katexDisplay) : null;
    const measured = {
      widgetWidth: rect.width,
      lineWidth: lineRect.width,
      display: style.display,
      width: style.width,
      katexDisplay: katexStyle?.display ?? null,
      katexWidth: katexStyle?.width ?? null
    };
    const hasTextAround = inlineDisplayDiagnostic.line.before.trim() !== "" || inlineDisplayDiagnostic.line.after.trim() !== "";

    if (style.display !== "inline-block" || katexStyle?.display !== "inline-block") {
      reportLatexLayoutWarning({
        code: "inline-display-widget-style-drift",
        severity: "warning",
        message: "A mixed-line display math widget no longer has the shrink-to-fit inline display CSS expected by the editor.",
        from: inlineDisplayDiagnostic.from,
        to: inlineDisplayDiagnostic.to,
        formula: inlineDisplayDiagnostic.formula,
        line: inlineDisplayDiagnostic.line,
        layout: inlineDisplayDiagnostic.layout,
        measured
      });
    }

    if (hasTextAround && lineRect.width > 0 && rect.width >= lineRect.width * 0.9) {
      reportLatexLayoutWarning({
        code: "inline-display-widget-measured-wide",
        severity: "warning",
        message: "A mixed-line display math widget is almost as wide as its CodeMirror line and may squeeze surrounding text.",
        from: inlineDisplayDiagnostic.from,
        to: inlineDisplayDiagnostic.to,
        formula: inlineDisplayDiagnostic.formula,
        line: inlineDisplayDiagnostic.line,
        layout: inlineDisplayDiagnostic.layout,
        measured
      });
    }
  });
}

function buildLivePreviewDecorations(state: EditorState) {
  const text = state.doc.toString();
  const latexRanges = findLatexRanges(text);
  const wikiLinks = findWikiLinkRanges(text);
  const previewRanges = [...latexRanges, ...wikiLinks];
  const decorations = latexRanges.flatMap((range) => {
    const renderMode = latexPreviewRenderMode(text, range);
    const renderDisplayMode = renderMode === "display";
    const useBlockLayout = renderDisplayMode && latexPreviewUsesBlockDecoration(text, range);
    const diagnostics = latexPreviewDiagnosticsForRange(text, range, renderDisplayMode, useBlockLayout);
    reportLatexPreviewDiagnostics(diagnostics);
    const widget = new LatexWidget(
      range.formula,
      renderDisplayMode,
      useBlockLayout,
      range.from,
      latexOpeningDelimiterLength(text, range.from),
      latexDiagnosticSignature(diagnostics),
      diagnostics
    );

    if (selectionOverlapsRange(state, range.from, range.to)) {
      const activeDecorations = findLatexSyntaxTokens(text, range).map((token) =>
        Decoration.mark({ class: `cm-latex-token cm-latex-${token.kind}` }).range(token.from, token.to)
      );

      if (renderDisplayMode) {
        activeDecorations.push(
          Decoration.widget({
            widget,
            block: useBlockLayout,
            side: 1
          }).range(range.to)
        );
      }

      return activeDecorations;
    }

    return [
      Decoration.replace({
        widget,
        block: useBlockLayout,
        inclusive: false
      }).range(range.from, range.to)
    ];
  });

  decorations.push(
    ...wikiLinks
      .filter((range) => !selectionOverlapsRange(state, range.from, range.to))
      .map((range) =>
        Decoration.replace({
          widget: new WikiLinkWidget(range.label, range.from),
          inclusive: false
        }).range(range.from, range.to)
      )
  );

  syntaxTree(state).iterate({
    enter(node) {
      if (overlapsRanges(node.from, node.to, previewRanges)) return;
      const parent = node.node.parent;
      const parentName = parent?.name ?? "";
      if (node.name === "ListMark") {
        const active = selectionOverlapsRange(state, node.from, node.to);
        if (!active) {
          const marker = state.doc.sliceString(node.from, node.to);
          decorations.push(
            Decoration.replace({
              widget: new MarkdownListMarkWidget(marker, node.from),
              inclusive: false
            }).range(node.from, node.to)
          );
        }
        return;
      }

      const isMarkup =
        node.name === "HeaderMark" ||
        node.name === "EmphasisMark" ||
        node.name === "CodeMark" ||
        node.name === "StrikethroughMark" ||
        node.name === "LinkMark" ||
        (node.name === "URL" && parentName === "Link");
      const activeFrom = isMarkup ? (parent?.from ?? node.from) : node.from;
      const activeTo = isMarkup ? (parent?.to ?? node.to) : node.to;
      const active = selectionOverlapsRange(state, activeFrom, activeTo);
      const level = headingLevel(node.name);
      const previewClass = markdownPreviewClass(node.name);

      if (level && !active) {
        const headingText = state.doc.sliceString(node.from, node.to).replace(/^#{1,6}\s*/, "");
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

const liveMarkdownPreview = StateField.define<DecorationSet>({
  create: (state) => buildLivePreviewDecorations(state),
  update(decorations, transaction) {
    const focusChanged = transaction.effects.some((effect) => effect.is(setPreviewFocus));
    if (transaction.docChanged || transaction.selection || focusChanged) {
      return buildLivePreviewDecorations(transaction.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const previewFocusEvents = EditorView.domEventHandlers({
  mousedown(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(true), annotations: previewOnly });
    return false;
  },
  focusin(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(true), annotations: previewOnly });
    return false;
  },
  focusout(_event, view) {
    view.dispatch({ effects: setPreviewFocus.of(false), annotations: previewOnly });
    return false;
  }
});

export function MarkdownEditor({
  name,
  initialValue = "",
  minHeight = "14rem",
  lineNumbers: showLineNumbers = true,
  draftKey
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const linkTargetInputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialValue);
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(null);
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkSuggestions, setLinkSuggestions] = useState<ConceptSuggestion[]>([]);
  const [linkSuggestionsLoading, setLinkSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const resolvedDraftKey = `${DRAFT_PREFIX}:${draftKey ?? `${window.location.pathname}:${name}`}`;
    draftKeyRef.current = resolvedDraftKey;
    const savedDraft = readMarkdownDraft(resolvedDraftKey);
    const startValue = savedDraft && savedDraft.value !== initialValue ? savedDraft.value : initialValue;

    if (savedDraft && savedDraft.value === initialValue) {
      removeMarkdownDraft(resolvedDraftKey);
    }
    setValue(startValue);
    setRestoredDraftAt(savedDraft && savedDraft.value !== initialValue ? savedDraft.updatedAt : null);

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: startValue,
        extensions: [
          showLineNumbers ? lineNumbers() : [],
          markdown(),
          history(),
          Prec.highest(keymap.of(historyKeymap)),
          Prec.highest(
            keymap.of([
              {
                key: "Backspace",
                run: (view) => deleteLatexBoundaryCharacter(view, "backward")
              },
              {
                key: "Delete",
                run: (view) => deleteLatexBoundaryCharacter(view, "forward")
              },
              {
                key: "ArrowLeft",
                run: (view) => enterLatexWithArrow(view, "backward")
              },
              {
                key: "ArrowRight",
                run: (view) => enterLatexWithArrow(view, "forward")
              },
              {
                key: "ArrowUp",
                run: (view) => enterLatexWithVerticalArrow(view, "up")
              },
              {
                key: "ArrowDown",
                run: (view) => enterLatexWithVerticalArrow(view, "down")
              }
            ])
          ),
          previewFocusField,
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
            if (update.docChanged) {
              const nextValue = update.state.doc.toString();
              setValue(nextValue);
              setRestoredDraftAt(null);

              if (nextValue === initialValue) {
                removeMarkdownDraft(resolvedDraftKey);
              } else {
                writeMarkdownDraft(resolvedDraftKey, nextValue);
              }
            }
          })
        ]
      })
    });

    viewRef.current = view;
    const host = hostRef.current;
    const focusIn = () => view.dispatch({ effects: setPreviewFocus.of(true), annotations: previewOnly });
    const focusOut = (event: FocusEvent) => {
      if (!host.contains(event.relatedTarget as Node | null)) {
        view.dispatch({ effects: setPreviewFocus.of(false), annotations: previewOnly });
      }
    };
    const outsideInteraction = (event: Event) => {
      const target = event.target as Node | null;
      const targetElement = target instanceof Element ? target : null;
      if (targetElement?.closest(".markdown-link-menu")) return;

      if (!host.contains(target)) {
        view.dispatch({ effects: setPreviewFocus.of(false), annotations: previewOnly });
        setLinkMenu(null);
      }
    };
    const openLinkMenu = (event: MouseEvent) => {
      const selection = view.state.selection.main;
      if (selection.empty) return;

      const selectedText = view.state.doc.sliceString(selection.from, selection.to).trim();
      if (!selectedText) return;
      const selectedLink = parseSelectedWikiLink(selectedText);

      event.preventDefault();
      view.focus();
      view.dispatch({ effects: setPreviewFocus.of(true), annotations: previewOnly });
      setLinkTarget(selectedLink?.target ?? cleanWikiLinkTarget(selectedText));
      setLinkText(selectedLink?.label ?? selectedText);
      setLinkMenu({
        x: event.clientX,
        y: event.clientY,
        from: selection.from,
        to: selection.to,
        selectedText
      });
    };
    host.addEventListener("focusin", focusIn);
    host.addEventListener("focusout", focusOut);
    host.addEventListener("contextmenu", openLinkMenu);
    document.addEventListener("focusin", outsideInteraction, true);
    document.addEventListener("mousedown", outsideInteraction, true);

    return () => {
      host.removeEventListener("focusin", focusIn);
      host.removeEventListener("focusout", focusOut);
      host.removeEventListener("contextmenu", openLinkMenu);
      document.removeEventListener("focusin", outsideInteraction, true);
      document.removeEventListener("mousedown", outsideInteraction, true);
      view.destroy();
      viewRef.current = null;
    };
  }, [draftKey, initialValue, minHeight, name, showLineNumbers]);

  useEffect(() => {
    if (!linkMenu) return;
    window.requestAnimationFrame(() => linkTargetInputRef.current?.focus());
  }, [linkMenu]);

  useEffect(() => {
    if (!linkMenu) {
      setLinkSuggestions([]);
      setLinkSuggestionsLoading(false);
      return;
    }

    const query = linkTarget.trim();
    if (!query) {
      setLinkSuggestions([]);
      setLinkSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLinkSuggestionsLoading(true);
      fetch(`/api/concepts/suggest?q=${encodeURIComponent(query)}`, {
        signal: controller.signal
      })
        .then((response) => (response.ok ? response.json() : { concepts: [] }))
        .then((data: { concepts?: ConceptSuggestion[] }) => {
          setLinkSuggestions(Array.isArray(data.concepts) ? data.concepts : []);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setLinkSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLinkSuggestionsLoading(false);
        });
    }, 160);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [linkMenu, linkTarget]);

  function discardDraft() {
    const key = draftKeyRef.current;
    if (key) removeMarkdownDraft(key);
    setRestoredDraftAt(null);
    setValue(initialValue);
    viewRef.current?.dispatch({
      changes: {
        from: 0,
        to: viewRef.current.state.doc.length,
        insert: initialValue
      },
      annotations: previewOnly
    });
  }

  function closeLinkMenu() {
    setLinkMenu(null);
    setLinkSuggestions([]);
    viewRef.current?.focus();
  }

  function selectLinkSuggestion(suggestion: ConceptSuggestion) {
    setLinkTarget(suggestion.title);
    linkTargetInputRef.current?.focus();
  }

  function applyLinkMenu() {
    const view = viewRef.current;
    if (!view || !linkMenu) return;

    const insert = wikiLinkMarkup(linkTarget, linkText);
    view.dispatch({
      changes: {
        from: linkMenu.from,
        to: linkMenu.to,
        insert
      },
      selection: { anchor: linkMenu.from + insert.length },
      effects: setPreviewFocus.of(true),
      scrollIntoView: true
    });
    setLinkMenu(null);
    setLinkSuggestions([]);
    view.focus();
  }

  const cleanLinkTarget = cleanWikiLinkTarget(linkTarget);
  const cleanLinkText = linkText.replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim();
  const hasExactSuggestion = linkSuggestions.some((suggestion) => {
    const target = cleanLinkTarget.toLowerCase();
    const aliases = suggestion.aliases.map((alias) => alias.toLowerCase());
    return suggestion.title.toLowerCase() === target || suggestion.slug.toLowerCase() === target || aliases.includes(target);
  });
  const canApplyLink = Boolean(cleanLinkTarget && cleanLinkText);

  return (
    <div className="markdown-editor">
      {restoredDraftAt && (
        <div className="markdown-draft-notice">
          <span>Draft restored from {formatDraftTime(restoredDraftAt)}.</span>
          <button type="button" className="secondary" onClick={discardDraft}>
            Discard draft
          </button>
        </div>
      )}
      <div ref={hostRef} className="markdown-editor-host" />
      {linkMenu && (
        <div
          className="markdown-link-menu"
          style={{ left: linkMenu.x, top: linkMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="markdown-link-menu-title">
            <span className="markdown-link-menu-icon" aria-hidden="true" />
            <strong>Add link</strong>
          </div>
          <label>
            Text shown
            <input
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canApplyLink) {
                  event.preventDefault();
                  applyLinkMenu();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeLinkMenu();
                }
              }}
              placeholder="Text in the article"
            />
          </label>
          <label>
            Concept page
            <input
              ref={linkTargetInputRef}
              value={linkTarget}
              onChange={(event) => setLinkTarget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLinkMenu();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeLinkMenu();
                }
              }}
              placeholder="Existing or new concept"
            />
          </label>
          <div className="markdown-link-menu-results">
            {linkSuggestionsLoading && <p>Searching concepts...</p>}
            {!linkSuggestionsLoading &&
              linkSuggestions.map((suggestion) => (
                <button key={suggestion.slug} type="button" onClick={() => selectLinkSuggestion(suggestion)}>
                  <strong>{suggestion.title}</strong>
                  {suggestion.aliases.length > 0 && <span>{suggestion.aliases.slice(0, 3).join(", ")}</span>}
                </button>
              ))}
            {cleanLinkTarget && !hasExactSuggestion && (
              <div className="markdown-link-menu-new">
                <span>New concept link: "{cleanLinkTarget}"</span>
                <a href={`/concepts/new?title=${encodeURIComponent(cleanLinkTarget)}`} target="_blank" rel="noreferrer">
                  Create page
                </a>
              </div>
            )}
          </div>
          <div className="markdown-link-menu-actions">
            <button type="button" className="secondary" onClick={closeLinkMenu}>
              Cancel
            </button>
            <button type="button" onClick={applyLinkMenu} disabled={!canApplyLink}>
              Add link
            </button>
          </div>
        </div>
      )}
      <textarea name={name} value={value} readOnly hidden aria-hidden="true" />
    </div>
  );
}
