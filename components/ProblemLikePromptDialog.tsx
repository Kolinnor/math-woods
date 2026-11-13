"use client";

import { Heart, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ParticleBurstZone } from "@/components/ParticleBurstZone";
import { LIKE_PROMPT_COOKIE } from "@/lib/problem-like-prompt-shared";

export type ProblemLikePromptLabels = {
  question: string;
  message: string;
  like: string;
  close: string;
};

// Let the solve confetti play before the backdrop dims the page.
const OPEN_DELAY_MS = 700;
const SHOWN_STORAGE_PREFIX = "mw-like-prompt-shown:";

function wasShown(key: string) {
  try {
    return window.sessionStorage.getItem(SHOWN_STORAGE_PREFIX + key) !== null;
  } catch {
    return false;
  }
}

function rememberShown(key: string) {
  try {
    window.sessionStorage.setItem(SHOWN_STORAGE_PREFIX + key, "1");
  } catch {
    // Storage unavailable: the cleared cookie still prevents most repeats.
  }
}

/**
 * Invitation to like a problem, shown after the third consecutive solve without
 * any like. Pass `likeAction` (server action form) on the problem page, or
 * `onLike` from client-side rows. The dialog closes as soon as the heart is
 * pressed so the heart burst plays above the page rather than under the backdrop.
 */
export function ProblemLikePromptDialog({
  labels,
  likeAction,
  onLike,
  onClose,
  clearCookie = false,
  onceKey
}: {
  labels: ProblemLikePromptLabels;
  likeAction?: () => Promise<void>;
  onLike?: () => void;
  onClose?: () => void;
  clearCookie?: boolean;
  /** Identifies one solve; once shown for it, a reload or back navigation never reopens the prompt. */
  onceKey?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (clearCookie) document.cookie = `${LIKE_PROMPT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    if (onceKey && wasShown(onceKey)) return;
    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;
      if (onceKey) rememberShown(onceKey);
      dialog.showModal();
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [clearCookie, onceKey]);

  function close() {
    dialogRef.current?.close();
  }

  const likeButton = (
    <button
      type={likeAction ? "submit" : "button"}
      className="problem-action-tile problem-favorite-main favorite problem-like-prompt-button"
      onClick={() => {
        // Close after the click has bubbled to the burst zone and the form submit has started.
        window.setTimeout(close, 0);
        onLike?.();
      }}
    >
      <Heart size={25} />
      <span><strong>{labels.like}</strong></span>
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      className="problem-like-prompt-dialog"
      aria-labelledby="problem-like-prompt-message"
      onClose={onClose}
      // Only the close button (or liking) dismisses the prompt: clicks on the
      // backdrop do nothing, and Escape is swallowed. Blocking the keydown, not
      // just the cancel event, stops browsers from force-closing on repeats.
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.preventDefault();
      }}
    >
      <button type="button" className="icon-button secondary problem-like-prompt-close" onClick={close} title={labels.close} aria-label={labels.close}>
        <X size={17} aria-hidden="true" />
      </button>
      <p id="problem-like-prompt-message">
        <strong>{labels.question}</strong>
        <br />
        {labels.message}
      </p>
      <ParticleBurstZone kind="heart" active>
        {likeAction ? <form action={likeAction}>{likeButton}</form> : likeButton}
      </ParticleBurstZone>
    </dialog>
  );
}
