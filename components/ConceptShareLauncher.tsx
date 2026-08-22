"use client";

import { Link2, Share2, UserRound, X } from "lucide-react";
import { useRef, type RefObject } from "react";
import {
  ConceptShareDialog,
  type ConceptShareConcept,
  type ConceptShareDialogHandle
} from "@/components/ConceptShareDialog";
import {
  ConceptShareLinkDialog,
  type ConceptShareLinkDialogHandle
} from "@/components/ConceptShareLinkDialog";
import type { Dictionary } from "@/lib/i18n/types";

type ConceptShareLauncherProps = {
  className?: string;
  concept: ConceptShareConcept;
  labels: Dictionary["social"]["conceptShare"];
};

export function ConceptShareLauncher({ className, concept, labels }: ConceptShareLauncherProps) {
  const chooserRef = useRef<HTMLDialogElement>(null);
  const userDialogRef = useRef<ConceptShareDialogHandle>(null);
  const linkDialogRef = useRef<ConceptShareLinkDialogHandle>(null);

  function openShare(
    dialogRef: RefObject<ConceptShareDialogHandle | ConceptShareLinkDialogHandle | null>
  ) {
    chooserRef.current?.close();
    window.setTimeout(() => dialogRef.current?.open(), 0);
  }

  return (
    <>
      <button
        type="button"
        className={className ? `challenge-button ${className}` : "button challenge-button w-full"}
        onClick={() => chooserRef.current?.showModal()}
      >
        <Share2 size={16} aria-hidden="true" />
        <span>{labels.button}</span>
      </button>

      <dialog ref={chooserRef} className="problem-challenge-dialog problem-challenge-method-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true"><Share2 size={27} /></div>
          <h2>{labels.chooserTitle}</h2>
          <button
            type="button"
            className="icon-button secondary"
            onClick={() => chooserRef.current?.close()}
            title={labels.close}
            aria-label={labels.close}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="problem-challenge-methods">
          <button type="button" onClick={() => openShare(userDialogRef)}>
            <UserRound size={21} aria-hidden="true" />
            <span>{labels.shareWithUser}</span>
          </button>
          <button type="button" className="secondary" onClick={() => openShare(linkDialogRef)}>
            <Link2 size={21} aria-hidden="true" />
            <span>{labels.shareByLink}</span>
          </button>
        </div>
      </dialog>

      <ConceptShareDialog ref={userDialogRef} concept={concept} labels={labels} />
      <ConceptShareLinkDialog ref={linkDialogRef} concept={concept} labels={labels} />
    </>
  );
}
