"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/types";

// Every value crosses the server/client boundary through the provider, so the
// whole slice must stay serialisable. A function here would not fail tsc or
// next build: it throws at request time, on every route, because the provider
// is mounted in the root layout. This assignment fails to compile instead.
type AllStrings<T> = { [K in keyof T]: string };
type SerialisableEditorLabels = AllStrings<Dictionary["markdownEditor"]>;

const _serialisable: SerialisableEditorLabels = null as unknown as Dictionary["markdownEditor"];
void _serialisable;

export type MarkdownEditorLabels = Dictionary["markdownEditor"];

const MarkdownEditorLabelsContext = createContext<MarkdownEditorLabels | null>(null);

export function MarkdownEditorLabelsProvider({
  labels,
  children
}: {
  labels: MarkdownEditorLabels;
  children: ReactNode;
}) {
  return <MarkdownEditorLabelsContext.Provider value={labels}>{children}</MarkdownEditorLabelsContext.Provider>;
}

export function useMarkdownEditorLabels() {
  const labels = useContext(MarkdownEditorLabelsContext);
  if (!labels) throw new Error("useMarkdownEditorLabels must be used inside MarkdownEditorLabelsProvider.");
  return labels;
}
