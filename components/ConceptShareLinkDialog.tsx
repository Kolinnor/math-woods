"use client";

import { Check, Copy, Share2, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { MarkdownInline } from "@/components/MarkdownInline";
import type { ConceptShareConcept } from "@/components/ConceptShareDialog";
import type { Dictionary } from "@/lib/i18n/types";

type ConceptShareLinkDialogProps = {
  concept: ConceptShareConcept;
  labels: Dictionary["social"]["conceptShare"];
};

export type ConceptShareLinkDialogHandle = { open: () => void };

export const ConceptShareLinkDialog = forwardRef<ConceptShareLinkDialogHandle, ConceptShareLinkDialogProps>(
function ConceptShareLinkDialog({ concept, labels }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [absoluteLink, setAbsoluteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useImperativeHandle(ref, () => ({
    open() {
      setAbsoluteLink(new URL(`/concepts/${concept.slug}`, window.location.origin).href);
      setCopied(false);
      dialogRef.current?.showModal();
    }
  }), [concept.slug]);

  async function copyLink() {
    if (!absoluteLink) return;
    await navigator.clipboard.writeText(absoluteLink);
    setCopied(true);
  }

  async function shareLink() {
    if (!absoluteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: concept.title,
          text: labels.shareText.replace("{title}", concept.title),
          url: absoluteLink
        });
      } catch {
        // Closing the native share sheet is not an application error.
      }
      return;
    }
    await copyLink();
  }

  return (
    <dialog ref={dialogRef} className="problem-challenge-dialog">
      <header className="problem-challenge-header">
        <div className="problem-challenge-mark" aria-hidden="true"><Share2 size={27} /></div>
        <h2>{labels.linkTitle}</h2>
        <button
          type="button"
          className="icon-button secondary"
          onClick={() => dialogRef.current?.close()}
          title={labels.close}
          aria-label={labels.close}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="problem-challenge-link-result">
        <p className="muted text-sm">{labels.linkDescription}</p>
        <div className="problem-challenge-problem-field">
          <span className="text-sm font-medium">{labels.concept}</span>
          <div className="problem-challenge-selected">
            <div>
              <strong><MarkdownInline html={concept.titleHtml} /></strong>
              <span>{concept.domainLabel}</span>
            </div>
          </div>
        </div>
        <p>{labels.linkReady}</p>
        <div className="problem-challenge-link-copy">
          <input value={absoluteLink} readOnly aria-label={labels.linkLabel} />
          <button type="button" onClick={() => void copyLink()}>
            {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={() => void shareLink()}>
            <Share2 size={17} aria-hidden="true" />
            {labels.nativeShare}
          </button>
          <button type="button" onClick={() => dialogRef.current?.close()}>{labels.done}</button>
        </footer>
      </div>
    </dialog>
  );
});
