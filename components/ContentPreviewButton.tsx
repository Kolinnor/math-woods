"use client";

import { Eye, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownInline } from "@/components/MarkdownInline";

type ContentPreviewButtonProps = {
  contentType: "concept" | "problem";
};

type PreviewResponse = {
  titleHtml?: string;
  bodyHtml?: string;
  error?: string;
};

export function ContentPreviewButton({ contentType }: ContentPreviewButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function openPreview() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "");

    setPreview(null);
    setLoading(true);
    dialogRef.current?.showModal();

    try {
      const response = await fetch("/api/content-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bodyMarkdown })
      });
      const result = await response.json() as PreviewResponse;
      if (!response.ok) throw new Error(result.error || "Preview could not be generated.");
      setPreview(result);
    } catch (error) {
      setPreview({ error: error instanceof Error ? error.message : "Preview could not be generated." });
    } finally {
      setLoading(false);
    }
  }

  const fallbackTitle = contentType === "problem" ? "Untitled problem" : "Untitled concept";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="secondary content-preview-button"
        onClick={openPreview}
        aria-haspopup="dialog"
      >
        <Eye size={17} aria-hidden="true" />
        Preview
      </button>
      <dialog
        ref={dialogRef}
        className="content-preview-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="content-preview-dialog-header">
          <span>Preview</span>
          <button
            type="button"
            className="secondary icon-button"
            aria-label="Close preview"
            title="Close preview"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="content-preview-dialog-body">
          {loading && (
            <div className="content-preview-loading" role="status">
              <Loader2 size={20} className="spin" aria-hidden="true" />
              Rendering preview...
            </div>
          )}
          {!loading && preview?.error && (
            <p className="quality-banner quality-needs-work" role="alert">{preview.error}</p>
          )}
          {!loading && preview?.titleHtml !== undefined && preview.bodyHtml !== undefined && (
            <article className={`content-preview-sheet content-preview-${contentType}`}>
              <p className="content-preview-type">{contentType}</p>
              <h1>
                <MarkdownInline html={preview.titleHtml || fallbackTitle} />
              </h1>
              <div className="content-preview-markdown">
                <MarkdownBlock html={preview.bodyHtml} />
              </div>
            </article>
          )}
        </div>
      </dialog>
    </>
  );
}
