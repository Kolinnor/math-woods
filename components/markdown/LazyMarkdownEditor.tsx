"use client";

import dynamic from "next/dynamic";

export const LazyMarkdownEditor = dynamic(
  () => import("@/components/markdown/MarkdownEditor").then((module) => module.MarkdownEditor),
  {
    ssr: false,
    loading: () => <div className="markdown-editor-loading" aria-hidden="true" />
  }
);
