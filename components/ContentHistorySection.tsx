"use client";

import { useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { historyCopy } from "@/lib/content-history";

export function ContentHistorySection({ html, spoiler = false, locale }: { html: string; spoiler?: boolean; locale: string }) {
  const [revealed, setRevealed] = useState(false);
  const copy = historyCopy(locale);
  if (!html.trim()) return null;
  return <details className="content-history-section zen-hide">
    <summary><span>{copy.title}</span>{spoiler && <small>{copy.warning}</small>}</summary>
    <div className="content-history-body">
      {spoiler && !revealed
        ? <button type="button" className="secondary" onClick={() => setRevealed(true)}>{copy.reveal}</button>
        : <MarkdownBlock html={html} />}
    </div>
  </details>;
}
