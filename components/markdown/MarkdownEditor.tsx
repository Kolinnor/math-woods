"use client";

import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { Compartment, EditorState, Prec, StateEffect, StateField, Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  type ViewUpdate,
  ViewPlugin,
  WidgetType
} from "@codemirror/view";
import katex from "katex";
import { ImageIcon, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from "react";
import {
  DEFAULT_LATEX_PREFERENCES,
  type LatexPreferenceValues
} from "@/lib/latex-preferences";
import { latexDeleteChange, type LatexDeleteDirection } from "@/lib/latex-deletion";
import {
  createDisplayMathLineBreakNormalizer,
  skipDisplayMathLineBreakNormalization
} from "@/lib/latex-display-line-transactions";
import {
  latexEditorPreferencesFromApi,
  latexKeyboardShortcut,
  latexShiftEnterShortcut,
  latexTabShortcut,
  latexTextInputShortcut,
  type LatexEditorShortcutResult
} from "@/lib/latex-editor-shortcuts";
import {
  latexPreviewDiagnosticsForRange,
  latexPreviewRenderMode,
  latexPreviewUsesBlockDecoration,
  latexPreviewUsesCenteredLine,
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
import {
  DEFAULT_MARKDOWN_HEADING_SHORTCUTS,
  markdownHeadingLevelForEvent,
  markdownHeadingLineText,
  type MarkdownHeadingShortcuts
} from "@/lib/markdown-shortcuts";
import {
  markdownImageSizingFromSrc,
  markdownImageSrcWithWidth,
  normalizeMarkdownImageWidth,
  type MarkdownImageWidth
} from "@/lib/markdown-images";
import { findWikiLinkRanges, headingLevel, markdownHeadingPreviewText, markdownPreviewClass } from "@/lib/markdown-preview";
import { overlapsRanges } from "@/lib/markdown-ranges";
import { ensureSlug } from "@/lib/slug";
import { cleanWikiLinkLabel, cleanWikiLinkTarget, wikiLinkMarkup } from "@/lib/wikilinks";
import {
  EDITOR_SETTINGS_VISITED_EVENT,
  editorSettingsWereVisited,
  markEditorSettingsVisited
} from "@/lib/editor-settings-visit";

const DRAFT_PREFIX = "math-woods-markdown-draft";
const DRAFT_SUBMIT_PREFIX = `${DRAFT_PREFIX}:submit`;
const DRAFT_SUBMIT_TTL_MS = 10 * 60 * 1000;
const LINK_MENU_VIEWPORT_MARGIN = 12;
const IMAGE_UPLOAD_ACCEPT = "image/avif,image/jpeg,image/png,image/webp";

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

type LinkMenuPosition = {
  left: number;
  top: number;
};

type MarkdownImageToolbarIcon = "copy" | "edit" | "delete";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKDOWN_IMAGE_TOOLBAR_ICONS: Record<
  MarkdownImageToolbarIcon,
  Array<["path" | "line" | "rect", Record<string, string>]>
> = {
  copy: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]
  ],
  edit: [
    [
      "path",
      {
        d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      }
    ],
    ["path", { d: "m15 5 4 4" }]
  ],
  delete: [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
    ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }],
    ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }]
  ]
};

function appendToolbarIcon(button: HTMLButtonElement, icon: MarkdownImageToolbarIcon, label: string) {
  button.className = "cm-md-image-icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");

  for (const [tagName, attributes] of MARKDOWN_IMAGE_TOOLBAR_ICONS[icon]) {
    const child = document.createElementNS(SVG_NS, tagName);
    for (const [name, value] of Object.entries(attributes)) {
      child.setAttribute(name, value);
    }
    svg.appendChild(child);
  }

  button.appendChild(svg);
}

type ConceptSuggestion = {
  title: string;
  slug: string;
  aliases: string[];
};

function linkTargetForSuggestion(suggestion: ConceptSuggestion) {
  return ensureSlug(suggestion.title, "") === suggestion.slug ? suggestion.title : suggestion.slug;
}

type ImageUploadResponse = {
  ok: boolean;
  error?: string;
  image?: {
    key: string;
    publicUrl: string;
  };
};

type MarkdownEditorProps = {
  name: string;
  initialValue?: string;
  minHeight?: string;
  lineNumbers?: boolean;
  draftKey?: string;
  resetSignal?: string | number | null;
};

type MarkdownDraft = {
  value: string;
  updatedAt: number;
};

type MarkdownDraftSubmit = {
  signal: string;
  submittedAt: number;
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

function markdownDraftSubmitKey(key: string) {
  return `${DRAFT_SUBMIT_PREFIX}:${key}`;
}

function resetSignalValue(resetSignal: MarkdownEditorProps["resetSignal"]) {
  if (resetSignal === null || resetSignal === undefined) return null;
  return String(resetSignal);
}

function readDraftSubmit(key: string): MarkdownDraftSubmit | null {
  try {
    const raw = window.localStorage.getItem(markdownDraftSubmitKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MarkdownDraftSubmit>;
    if (typeof parsed.signal !== "string" || typeof parsed.submittedAt !== "number") return null;
    return { signal: parsed.signal, submittedAt: parsed.submittedAt };
  } catch {
    return null;
  }
}

function writeDraftSubmit(key: string, resetSignal: string) {
  try {
    window.localStorage.setItem(
      markdownDraftSubmitKey(key),
      JSON.stringify({
        signal: resetSignal,
        submittedAt: Date.now()
      } satisfies MarkdownDraftSubmit)
    );
  } catch {
    // Draft submit markers are best-effort; editing must continue if storage is unavailable.
  }
}

function removeDraftSubmit(key: string) {
  try {
    window.localStorage.removeItem(markdownDraftSubmitKey(key));
  } catch {
    // Ignore storage errors.
  }
}

function freshDraftSubmitForSignal(key: string, resetSignal: string) {
  const submit = readDraftSubmit(key);
  if (!submit) return false;
  const fresh = Date.now() - submit.submittedAt <= DRAFT_SUBMIT_TTL_MS;
  if (!fresh) {
    removeDraftSubmit(key);
    return false;
  }
  return submit.signal === resetSignal;
}

function formatDraftTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function parseSelectedWikiLink(value: string) {
  const match = value.match(/^\[\[([^\]\n]+)\]\]$/);
  if (!match) return null;

  const [target, label] = match[1].split("|", 2);
  return {
    target: cleanWikiLinkTarget(target),
    label: cleanWikiLinkLabel(label ?? target)
  };
}

function nearestLinkMenuScroller(target: EventTarget | null, menu: HTMLElement) {
  let element = target instanceof HTMLElement ? target : null;

  while (element && menu.contains(element)) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;

    if (canScrollY || canScrollX) return element;
    if (element === menu) break;
    element = element.parentElement;
  }

  return menu;
}

function clampLinkMenuPosition(anchorX: number, anchorY: number, menu: HTMLElement): LinkMenuPosition {
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const rect = menu.getBoundingClientRect();
  const minLeft = viewportLeft + LINK_MENU_VIEWPORT_MARGIN;
  const minTop = viewportTop + LINK_MENU_VIEWPORT_MARGIN;
  const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - rect.width - LINK_MENU_VIEWPORT_MARGIN);
  const maxTop = Math.max(minTop, viewportTop + viewportHeight - rect.height - LINK_MENU_VIEWPORT_MARGIN);

  return {
    left: Math.min(Math.max(anchorX, minLeft), maxLeft),
    top: Math.min(Math.max(anchorY, minTop), maxTop)
  };
}

class LatexWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly renderDisplayMode: boolean,
    readonly useBlockLayout: boolean,
    readonly visualBlockLayout: boolean,
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
      other.visualBlockLayout === this.visualBlockLayout &&
      other.from === this.from &&
      other.editOffset === this.editOffset &&
      other.diagnosticSignature === this.diagnosticSignature
    );
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.useBlockLayout ? "div" : "span");
    element.className = this.renderDisplayMode
      ? `cm-latex-preview cm-latex-display${this.visualBlockLayout ? "" : " cm-latex-display-inline"}`
      : "cm-latex-preview cm-latex-inline";
    element.dataset.latexFrom = String(this.from);
    element.dataset.latexLayout = this.visualBlockLayout ? "visual-block-display" : this.renderDisplayMode ? "inline-display" : "inline";
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

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly src: string,
    readonly width: MarkdownImageWidth,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return other.alt === this.alt && other.src === this.src && other.width === this.width && other.from === this.from && other.to === this.to;
  }

  private replaceImage(view: EditorView, width: MarkdownImageWidth) {
    const normalizedWidth = normalizeMarkdownImageWidth(width);
    view.dispatch({
      changes: {
        from: this.from,
        to: this.to,
        insert: markdownImage(markdownImageSrcWithWidth(this.src, normalizedWidth), this.alt)
      },
      selection: { anchor: this.from },
      scrollIntoView: true
    });
    view.focus();
  }

  private deleteImage(view: EditorView) {
    view.dispatch({
      changes: { from: this.from, to: this.to },
      selection: { anchor: this.from },
      scrollIntoView: true
    });
    view.focus();
  }

  private editSource(view: EditorView) {
    view.focus();
    view.dispatch({
      selection: { anchor: this.from + 2 },
      effects: setPreviewFocus.of(true),
      annotations: previewOnly,
      scrollIntoView: true
    });
  }

  private startResize(
    view: EditorView,
    element: HTMLElement,
    widthLabel: HTMLElement,
    event: PointerEvent,
    horizontalDirection: -1 | 1
  ) {
    event.preventDefault();
    event.stopPropagation();

    const parent = element.parentElement;
    const parentWidth = parent?.getBoundingClientRect().width ?? 0;
    if (parentWidth <= 0) return;

    const startX = event.clientX;
    const startWidth = element.getBoundingClientRect().width;
    let nextWidth = this.width;
    const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    handle?.setPointerCapture?.(event.pointerId);
    element.classList.add("cm-md-image-resizing");

    const updateWidth = (clientX: number) => {
      const delta = (clientX - startX) * horizontalDirection;
      const nextPixels = startWidth + delta;
      nextWidth = normalizeMarkdownImageWidth((nextPixels / parentWidth) * 100);
      element.style.width = `${nextWidth}%`;
      widthLabel.textContent = `${nextWidth}%`;
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      element.classList.remove("cm-md-image-resizing");
      handle?.releasePointerCapture?.(event.pointerId);
      this.replaceImage(view, nextWidth);
    };

    const cancelResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      element.classList.remove("cm-md-image-resizing");
      element.style.width = `${this.width}%`;
      widthLabel.textContent = `${this.width}%`;
      handle?.releasePointerCapture?.(event.pointerId);
      view.focus();
    };

    function handlePointerMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      updateWidth(moveEvent.clientX);
    }

    function handlePointerUp(upEvent: PointerEvent) {
      upEvent.preventDefault();
      updateWidth(upEvent.clientX);
      stopResize();
    }

    function handlePointerCancel(cancelEvent: PointerEvent) {
      cancelEvent.preventDefault();
      cancelResize();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    view.focus();
  }

  toDOM(view: EditorView) {
    const element = document.createElement("figure");
    element.className = "cm-md-image";
    element.title = "Image preview";
    element.style.width = `${this.width}%`;

    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";
    image.decoding = "async";
    element.appendChild(image);

    if (this.alt) {
      const caption = document.createElement("figcaption");
      caption.textContent = this.alt;
      element.appendChild(caption);
    }

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-image-toolbar";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    appendToolbarIcon(copyButton, "copy", "Copy image URL");
    copyButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    copyButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void navigator.clipboard?.writeText(this.src);
      view.focus();
    });
    toolbar.appendChild(copyButton);

    const editButton = document.createElement("button");
    editButton.type = "button";
    appendToolbarIcon(editButton, "edit", "Edit Markdown source");
    editButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.editSource(view);
    });
    toolbar.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    appendToolbarIcon(deleteButton, "delete", "Delete image");
    deleteButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.deleteImage(view);
    });
    toolbar.appendChild(deleteButton);

    const widthLabel = document.createElement("span");
    widthLabel.className = "cm-md-image-width";
    widthLabel.textContent = `${this.width}%`;
    widthLabel.title = "Drag an image corner to resize";
    toolbar.appendChild(widthLabel);
    element.appendChild(toolbar);

    const resizeHandles: Array<[string, -1 | 1]> = [
      ["top-left", -1],
      ["top-right", 1],
      ["bottom-left", -1],
      ["bottom-right", 1]
    ];
    for (const [position, direction] of resizeHandles) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `cm-md-image-resize-handle cm-md-image-resize-${position}`;
      handle.title = "Drag to resize image";
      handle.setAttribute("aria-label", "Resize image");
      handle.addEventListener("pointerdown", (event) => {
        this.startResize(view, element, widthLabel, event, direction);
      });
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      element.appendChild(handle);
    }

    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        effects: setPreviewFocus.of(true),
        annotations: previewOnly
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

function setMarkdownHeadingLevel(view: EditorView, level: number) {
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const seenLines = new Set<number>();

  for (const range of view.state.selection.ranges) {
    const from = Math.min(range.from, range.to);
    const to = range.empty ? from : Math.max(from, Math.max(range.from, range.to) - 1);
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      if (seenLines.has(lineNumber)) continue;
      seenLines.add(lineNumber);

      const line = view.state.doc.line(lineNumber);
      const nextText = markdownHeadingLineText(line.text, level);
      if (nextText !== line.text) {
        changes.push({ from: line.from, to: line.to, insert: nextText });
      }
    }
  }

  if (changes.length) {
    view.dispatch({
      changes,
      effects: setPreviewFocus.of(true),
      scrollIntoView: true
    });
  }

  return true;
}

function markdownShortcutExtension(shortcuts: MarkdownHeadingShortcuts) {
  return EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.isComposing) return false;

      const level = markdownHeadingLevelForEvent(event, shortcuts);
      if (level === null) return false;

      event.preventDefault();
      return setMarkdownHeadingLevel(view, level);
    }
  });
}

function dispatchLatexShortcutResult(view: EditorView, result: LatexEditorShortcutResult) {
  view.dispatch({
    changes: result.changes,
    selection: typeof result.anchor === "number" ? { anchor: result.anchor } : undefined,
    effects: setPreviewFocus.of(true),
    annotations: result.skipDisplayMathLineBreakNormalization
      ? skipDisplayMathLineBreakNormalization.of(true)
      : undefined,
    scrollIntoView: true
  });
}

function latexShortcutExtension(preferences: LatexPreferenceValues) {
  return [
    EditorView.inputHandler.of((view, from, to, text) => {
      const result = latexTextInputShortcut(view.state.doc.toString(), from, to, text, preferences);
      if (!result) return false;

      dispatchLatexShortcutResult(view, result);
      return true;
    }),
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.isComposing) return false;

        const selection = view.state.selection.main;
        const source = view.state.doc.toString();

        if (event.key === "Tab") {
          const result = selection.empty ? latexTabShortcut(source, selection.from, preferences) : null;
          if (!result) return false;

          event.preventDefault();
          dispatchLatexShortcutResult(view, result);
          return true;
        }

        if (event.key === "Enter" && event.shiftKey && selection.empty) {
          const result = latexShiftEnterShortcut(source, selection.from, preferences);
          if (!result) return false;

          event.preventDefault();
          dispatchLatexShortcutResult(view, result);
          return true;
        }

        const result = latexKeyboardShortcut(source, selection.from, selection.to, event, preferences);
        if (!result) return false;

        event.preventDefault();
        dispatchLatexShortcutResult(view, result);
        return true;
      }
    })
  ];
}

function markdownShortcutsFromApi(data: unknown): MarkdownHeadingShortcuts {
  if (!data || typeof data !== "object") return DEFAULT_MARKDOWN_HEADING_SHORTCUTS;
  const raw = data as Partial<Record<keyof MarkdownHeadingShortcuts, unknown>>;

  return {
    markdownHeadingShortcuts:
      typeof raw.markdownHeadingShortcuts === "boolean"
        ? raw.markdownHeadingShortcuts
        : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeadingShortcuts,
    markdownHeading1Shortcut:
      typeof raw.markdownHeading1Shortcut === "string" ? raw.markdownHeading1Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading1Shortcut,
    markdownHeading2Shortcut:
      typeof raw.markdownHeading2Shortcut === "string" ? raw.markdownHeading2Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading2Shortcut,
    markdownHeading3Shortcut:
      typeof raw.markdownHeading3Shortcut === "string" ? raw.markdownHeading3Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading3Shortcut,
    markdownHeading4Shortcut:
      typeof raw.markdownHeading4Shortcut === "string" ? raw.markdownHeading4Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading4Shortcut,
    markdownHeading5Shortcut:
      typeof raw.markdownHeading5Shortcut === "string" ? raw.markdownHeading5Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading5Shortcut,
    markdownHeading6Shortcut:
      typeof raw.markdownHeading6Shortcut === "string" ? raw.markdownHeading6Shortcut : DEFAULT_MARKDOWN_HEADING_SHORTCUTS.markdownHeading6Shortcut
  };
}

function imageAltText(filename: string, selectedText: string) {
  const selected = selectedText.replace(/\s+/g, " ").trim();
  if (selected && selected.length <= 120) return selected.replace(/[\[\]]/g, "");

  const fallback = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (fallback || "Uploaded image").replace(/[\[\]]/g, "");
}

function markdownImage(url: string, alt: string) {
  return `![${alt}](${url})`;
}

function parseMarkdownImage(markdown: string) {
  const match = markdown.match(/^!\[([^\]\n]*)\]\((\S+?)(?:\s+["'][^"']*["'])?\)$/);
  if (!match) return null;
  if (!/^https?:\/\//i.test(match[2])) return null;
  const sizing = markdownImageSizingFromSrc(match[2]);
  return {
    alt: match[1],
    src: sizing.src,
    width: sizing.width
  };
}

function imageInsertText(view: EditorView, imageMarkdown: string) {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const before = view.state.doc.sliceString(line.from, selection.from);
  const after = view.state.doc.sliceString(selection.to, line.to);
  const prefix = before.trim() ? "\n\n" : "";
  const suffix = after.trim() ? "\n\n" : "";

  return {
    from: selection.from,
    to: selection.to,
    insert: `${prefix}${imageMarkdown}${suffix}`
  };
}

function clipboardImageFile(data: DataTransfer | null) {
  if (!data) return null;

  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith("image/")) return file;
  }

  return null;
}

const setPreviewFocus = StateEffect.define<boolean>();
const resumeLatexPreview = StateEffect.define<void>();
const displayMathLineBreakNormalizer = createDisplayMathLineBreakNormalizer(setPreviewFocus);
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

const suppressLatexPreviewOnJoinedLine = StateField.define<boolean>({
  create: () => false,
  update(_value, transaction) {
    if (transaction.effects.some((effect) => effect.is(resumeLatexPreview))) return false;
    if (!transaction.docChanged) return false;

    let removedLineBreak = false;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const deleted = transaction.startState.doc.sliceString(fromA, toA);
      if (deleted.includes("\n") && !inserted.toString().includes("\n")) {
        removedLineBreak = true;
      }
    });

    return removedLineBreak;
  }
});

const resumeLatexPreviewAfterLayout = ViewPlugin.fromClass(
  class {
    private firstFrame: number | null = null;
    private secondFrame: number | null = null;

    update(update: ViewUpdate) {
      if (!update.state.field(suppressLatexPreviewOnJoinedLine) || this.firstFrame !== null || this.secondFrame !== null) {
        return;
      }

      this.firstFrame = window.requestAnimationFrame(() => {
        this.firstFrame = null;
        this.secondFrame = window.requestAnimationFrame(() => {
          this.secondFrame = null;
          if (!update.view.state.field(suppressLatexPreviewOnJoinedLine)) return;

          update.view.dispatch({
            effects: resumeLatexPreview.of(undefined),
            annotations: previewOnly
          });
        });
      });
    }

    destroy() {
      if (this.firstFrame !== null) window.cancelAnimationFrame(this.firstFrame);
      if (this.secondFrame !== null) window.cancelAnimationFrame(this.secondFrame);
    }
  }
);

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
  const suppressJoinedLinePreview = state.field(suppressLatexPreviewOnJoinedLine);
  const decorations = latexRanges.flatMap((range) => {
    const renderMode = latexPreviewRenderMode(text, range);
    const renderDisplayMode = renderMode === "display";
    const useBlockLayout = renderDisplayMode && latexPreviewUsesBlockDecoration(text, range);
    const visualBlockLayout = latexPreviewUsesCenteredLine(text, range);
    const diagnostics = latexPreviewDiagnosticsForRange(text, range, renderDisplayMode, useBlockLayout);
    reportLatexPreviewDiagnostics(diagnostics);
    const widget = new LatexWidget(
      range.formula,
      renderDisplayMode,
      useBlockLayout,
      visualBlockLayout,
      range.from,
      latexOpeningDelimiterLength(text, range.from),
      latexDiagnosticSignature(diagnostics),
      diagnostics
    );
    const suppressPreview =
      suppressJoinedLinePreview &&
      !selectionOverlapsRange(state, range.from, range.to);

    if (selectionOverlapsRange(state, range.from, range.to) || suppressPreview) {
      const activeDecorations = findLatexSyntaxTokens(text, range).map((token) =>
        Decoration.mark({ class: `cm-latex-token cm-latex-${token.kind}` }).range(token.from, token.to)
      );

      if (renderDisplayMode && !suppressPreview) {
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
      ...(visualBlockLayout
        ? [Decoration.line({ class: "cm-latex-display-line" }).range(state.doc.lineAt(range.from).from)]
        : []),
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
      if (node.name === "Image") {
        const active = selectionOverlapsRange(state, node.from, node.to);
        if (!active) {
          const image = parseMarkdownImage(state.doc.sliceString(node.from, node.to));
          if (!image) return;
          decorations.push(
            Decoration.replace({
              widget: new MarkdownImageWidget(image.alt, image.src, image.width, node.from, node.to),
              inclusive: false
            }).range(node.from, node.to)
          );
          return false;
        }
        return;
      }

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
        const headingText = markdownHeadingPreviewText(state.doc.sliceString(node.from, node.to));
        if (!headingText) return;
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
    const latexPreviewResumed = transaction.effects.some((effect) => effect.is(resumeLatexPreview));
    if (transaction.docChanged || transaction.selection || focusChanged || latexPreviewResumed) {
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
  draftKey,
  resetSignal = null
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageUploadingRef = useRef(false);
  const draftKeyRef = useRef<string | null>(null);
  const resetSignalRef = useRef(resetSignal);
  const markdownShortcutCompartmentRef = useRef(new Compartment());
  const latexShortcutCompartmentRef = useRef(new Compartment());
  const linkMenuRef = useRef<HTMLDivElement | null>(null);
  const linkTargetInputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialValue);
  const [restoredDraftAt, setRestoredDraftAt] = useState<number | null>(null);
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);
  const [linkMenuPosition, setLinkMenuPosition] = useState<LinkMenuPosition | null>(null);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkSuggestions, setLinkSuggestions] = useState<ConceptSuggestion[]>([]);
  const [linkSuggestionsLoading, setLinkSuggestionsLoading] = useState(false);
  const [selectedLinkSuggestionQuery, setSelectedLinkSuggestionQuery] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const [showLatexSettingsHint, setShowLatexSettingsHint] = useState(false);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const resolvedDraftKey = `${DRAFT_PREFIX}:${draftKey ?? `${window.location.pathname}:${name}`}`;
    draftKeyRef.current = resolvedDraftKey;
    const currentResetSignal = resetSignalValue(resetSignal);
    if (currentResetSignal !== null) {
      const submit = readDraftSubmit(resolvedDraftKey);
      const submittedThenChanged =
        submit &&
        Date.now() - submit.submittedAt <= DRAFT_SUBMIT_TTL_MS &&
        submit.signal !== currentResetSignal;
      if (submittedThenChanged) {
        removeMarkdownDraft(resolvedDraftKey);
      }
      if (submit && (submittedThenChanged || Date.now() - submit.submittedAt > DRAFT_SUBMIT_TTL_MS)) {
        removeDraftSubmit(resolvedDraftKey);
      }
    }
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
          suppressLatexPreviewOnJoinedLine,
          liveMarkdownPreview,
          resumeLatexPreviewAfterLayout,
          previewFocusEvents,
          displayMathLineBreakNormalizer,
          EditorView.domEventHandlers({
            paste: (event) => {
              const file = clipboardImageFile(event.clipboardData);
              if (!file) return false;

              event.preventDefault();
              void uploadImage(file);
              return true;
            }
          }),
          markdownShortcutCompartmentRef.current.of(markdownShortcutExtension(DEFAULT_MARKDOWN_HEADING_SHORTCUTS)),
          latexShortcutCompartmentRef.current.of(latexShortcutExtension(DEFAULT_LATEX_PREFERENCES)),
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
              hostRef.current?.closest("form")?.dispatchEvent(new Event("input", { bubbles: true }));

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
    const form = host.closest("form");
    const markDraftSubmitted = () => {
      const key = draftKeyRef.current;
      const currentResetSignal = resetSignalValue(resetSignalRef.current);
      if (!key || currentResetSignal === null) return;
      writeDraftSubmit(key, currentResetSignal);
    };
    form?.addEventListener("submit", markDraftSubmitted);

    return () => {
      host.removeEventListener("focusin", focusIn);
      host.removeEventListener("focusout", focusOut);
      host.removeEventListener("contextmenu", openLinkMenu);
      document.removeEventListener("focusin", outsideInteraction, true);
      document.removeEventListener("mousedown", outsideInteraction, true);
      form?.removeEventListener("submit", markDraftSubmitted);
      view.destroy();
      viewRef.current = null;
    };
  }, [draftKey, initialValue, minHeight, name, showLineNumbers]);

  useEffect(() => {
    if (!linkMenu) return;
    window.requestAnimationFrame(() => linkTargetInputRef.current?.focus());
  }, [linkMenu]);

  useEffect(() => {
    let cancelled = false;
    const locallyVisited = editorSettingsWereVisited();
    const hideSettingsHint = () => setShowLatexSettingsHint(false);
    window.addEventListener(EDITOR_SETTINGS_VISITED_EVENT, hideSettingsHint);

    fetch("/api/editor-preferences", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const settingsVisited = locallyVisited || data?.editorSettingsVisited === true;
        if (data?.editorSettingsVisited === true) markEditorSettingsVisited();
        setShowLatexSettingsHint(!settingsVisited);
        const view = viewRef.current;
        if (!view) return;

        const shortcuts = markdownShortcutsFromApi(data);
        const latexPreferences = latexEditorPreferencesFromApi(data);
        view.dispatch({
          effects: [
            markdownShortcutCompartmentRef.current.reconfigure(markdownShortcutExtension(shortcuts)),
            latexShortcutCompartmentRef.current.reconfigure(latexShortcutExtension(latexPreferences))
          ],
          annotations: previewOnly
        });
      })
      .catch(() => {
        // Defaults stay active if preferences are unavailable.
        if (!cancelled) setShowLatexSettingsHint(!locallyVisited);
      });

    return () => {
      cancelled = true;
      window.removeEventListener(EDITOR_SETTINGS_VISITED_EVENT, hideSettingsHint);
    };
  }, []);

  useLayoutEffect(() => {
    if (!linkMenu) {
      setLinkMenuPosition(null);
      return;
    }

    const menu = linkMenuRef.current;
    if (!menu) return;

    const updatePosition = () => {
      const nextPosition = clampLinkMenuPosition(linkMenu.x, linkMenu.y, menu);
      setLinkMenuPosition((currentPosition) =>
        currentPosition?.left === nextPosition.left && currentPosition.top === nextPosition.top ? currentPosition : nextPosition
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [linkMenu, linkSuggestions.length, linkSuggestionsLoading, linkTarget]);

  useEffect(() => {
    if (resetSignalRef.current === resetSignal) return;

    const key = draftKeyRef.current;
    const previousResetSignal = resetSignalValue(resetSignalRef.current);
    if (!key || previousResetSignal === null || !freshDraftSubmitForSignal(key, previousResetSignal)) {
      resetSignalRef.current = resetSignal;
      return;
    }

    resetSignalRef.current = resetSignal;
    if (key) {
      removeMarkdownDraft(key);
      removeDraftSubmit(key);
    }
    setRestoredDraftAt(null);
    setValue(initialValue);
    setLinkMenu(null);
    setLinkSuggestions([]);
    setSelectedLinkSuggestionQuery(null);

    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: initialValue
      },
      annotations: previewOnly
    });
  }, [initialValue, resetSignal]);

  useEffect(() => {
    if (!linkMenu) {
      setLinkSuggestions([]);
      setLinkSuggestionsLoading(false);
      setSelectedLinkSuggestionQuery(null);
      return;
    }

    const query = linkTarget.trim();
    if (!query) {
      setLinkSuggestions([]);
      setLinkSuggestionsLoading(false);
      return;
    }
    if (selectedLinkSuggestionQuery === query) {
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
  }, [linkMenu, linkTarget, selectedLinkSuggestionQuery]);

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
    setSelectedLinkSuggestionQuery(null);
    viewRef.current?.focus();
  }

  function selectLinkSuggestion(suggestion: ConceptSuggestion) {
    const target = linkTargetForSuggestion(suggestion);
    setLinkTarget(target);
    setLinkText((currentText) => currentText.trim() ? currentText : suggestion.title);
    setLinkSuggestions([]);
    setLinkSuggestionsLoading(false);
    setSelectedLinkSuggestionQuery(target);
    linkTargetInputRef.current?.focus();
  }

  function applyLinkMenu() {
    const view = viewRef.current;
    if (!view || !linkMenu) return;

    const insert = wikiLinkMarkup(linkTarget, linkText || linkMenu.selectedText);
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
    setSelectedLinkSuggestionQuery(null);
    view.focus();
  }

  function handleLinkMenuWheel(event: WheelEvent<HTMLDivElement>) {
    const scroller = nearestLinkMenuScroller(event.target, event.currentTarget);

    event.preventDefault();
    event.stopPropagation();
    scroller.scrollTop += event.deltaY;
    scroller.scrollLeft += event.deltaX;
  }

  async function uploadImage(file: File) {
    const view = viewRef.current;
    if (!view) return;
    if (imageUploadingRef.current) {
      setImageUploadMessage("Wait for the current image upload to finish.");
      return;
    }

    const selection = view.state.selection.main;
    const selectedText = selection.empty ? "" : view.state.doc.sliceString(selection.from, selection.to);
    const body = new FormData();
    body.set("image", file);

    imageUploadingRef.current = true;
    setImageUploading(true);
    setImageUploadMessage(null);

    try {
      const response = await fetch("/api/images/upload", {
        method: "POST",
        body
      });
      const data = (await response.json().catch(() => null)) as ImageUploadResponse | null;

      if (!response.ok || !data?.ok || !data.image?.publicUrl) {
        throw new Error(data?.error || "Image upload failed.");
      }

      const insert = imageInsertText(view, markdownImage(data.image.publicUrl, imageAltText(file.name, selectedText)));
      view.dispatch({
        changes: insert,
        selection: { anchor: insert.from + insert.insert.length },
        effects: setPreviewFocus.of(true),
        scrollIntoView: true
      });
      view.focus();
      setImageUploadMessage("Image inserted.");
      window.setTimeout(() => setImageUploadMessage(null), 2400);
    } catch (error) {
      setImageUploadMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      imageUploadingRef.current = false;
      setImageUploading(false);
    }
  }

  function chooseImageFile() {
    setImageUploadMessage(null);
    imageInputRef.current?.click();
  }

  const cleanLinkTarget = cleanWikiLinkTarget(linkTarget);
  const cleanLinkText = cleanWikiLinkLabel(linkText || linkMenu?.selectedText || "");
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
      <div className="markdown-editor-toolbar" aria-label="Editor tools">
        <button
          type="button"
          className="secondary markdown-editor-tool-button"
          onClick={chooseImageFile}
          disabled={imageUploading}
          title="Insert image"
        >
          {imageUploading ? <Loader2 size={14} aria-hidden="true" /> : <ImageIcon size={14} aria-hidden="true" />}
          <span>{imageUploading ? "Uploading" : "Image"}</span>
        </button>
        {(imageUploadMessage || showLatexSettingsHint) && (
          <span className="markdown-editor-toolbar-status">
            {imageUploadMessage || (
              <>
                Configure LaTeX shortcuts in <a href="/settings?tab=latex" onClick={markEditorSettingsVisited}>Settings</a>.
              </>
            )}
          </span>
        )}
        <input
          ref={imageInputRef}
          type="file"
          className="markdown-editor-file-input"
          accept={IMAGE_UPLOAD_ACCEPT}
          aria-hidden="true"
          hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (file) void uploadImage(file);
          }}
        />
      </div>
      <div ref={hostRef} className="markdown-editor-host" />
      {linkMenu && (
        <div
          ref={linkMenuRef}
          className="markdown-link-menu"
          style={{ left: linkMenuPosition?.left ?? linkMenu.x, top: linkMenuPosition?.top ?? linkMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onWheel={handleLinkMenuWheel}
          onTouchMove={(event) => event.stopPropagation()}
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
              onChange={(event) => {
                setSelectedLinkSuggestionQuery(null);
                setLinkTarget(event.target.value);
              }}
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
