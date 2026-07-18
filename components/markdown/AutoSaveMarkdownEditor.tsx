"use client";

import { useRef, type ComponentProps } from "react";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";

type AutoSaveMarkdownEditorProps = ComponentProps<typeof LazyMarkdownEditor>;

export function AutoSaveMarkdownEditor({ initialValue = "", ...props }: AutoSaveMarkdownEditorProps) {
  // Server-action responses may echo the saved text back while the user is still editing.
  const initialValueRef = useRef(initialValue);

  return <LazyMarkdownEditor {...props} initialValue={initialValueRef.current} />;
}
