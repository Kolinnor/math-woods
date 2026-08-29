"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/types";

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
