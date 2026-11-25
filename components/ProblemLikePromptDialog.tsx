"use client";

import { Heart, X } from "lucide-react";
import { useEffect, useState, useId } from "react";
import { createPortal } from "react-dom";
import { ParticleBurstZone } from "@/components/ParticleBurstZone";
import { LIKE_PROMPT_COOKIE, likePromptCooldownElapsed } from "@/lib/problem-like-prompt-shared";

export type ProblemLikePromptLabels = {
  question: string;
  message: string;
  like: string;
  close: string;
};

// Let the solve confetti play before displaying the unobtrusive invitation.
const OPEN_DELAY_MS = 700;
const LAST_SHOWN_STORAGE_KEY = "mw-like-prompt-last-shown";
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

/** Non-modal invitation: no focus change, scroll lock or backdrop. */
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
  const [visible, setVisible] = useState(false);
  const messageId = useId();

  useEffect(() => {
    if (clearCookie) document.cookie = `${LIKE_PROMPT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    if (onceKey && wasShown(onceKey)) return;
    const timer = window.setTimeout(() => {
      try {
        if (!likePromptCooldownElapsed(window.localStorage.getItem(LAST_SHOWN_STORAGE_KEY), Date.now())) return;
        window.localStorage.setItem(LAST_SHOWN_STORAGE_KEY, String(Date.now()));
      } catch { /* Storage may be unavailable; the invitation still remains dismissible. */ }
      if (onceKey) rememberShown(onceKey);
      setVisible(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [clearCookie, onceKey]);

  function close() {
    setVisible(false);
    onClose?.();
  }

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setVisible(false); onClose?.(); }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [visible, onClose]);

  if (!visible) return null;

  const likeButton = (
    <button
      type={likeAction ? "submit" : "button"}
      className="problem-action-tile problem-favorite-main favorite problem-like-prompt-button"
      onClick={() => {
        // Let the click reach the burst zone and submit the form before hiding.
        window.setTimeout(close, 0);
        onLike?.();
      }}
    >
      <Heart size={25} />
      <span><strong>{labels.like}</strong></span>
    </button>
  );

  return createPortal(
    <aside className="problem-like-prompt-dialog" aria-labelledby={messageId}>
      <button type="button" className="icon-button secondary problem-like-prompt-close" onClick={close} title={labels.close} aria-label={labels.close}>
        <X size={17} aria-hidden="true" />
      </button>
      <p id={messageId} role="status">
        <strong>{labels.question}</strong>
        {labels.message}
      </p>
      <ParticleBurstZone kind="heart" active>
        {likeAction ? <form action={likeAction}>{likeButton}</form> : likeButton}
      </ParticleBurstZone>
    </aside>,
    document.body
  );
}
