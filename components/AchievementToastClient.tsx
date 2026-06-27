"use client";

import type { Route } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

export function AchievementToastClient({
  notificationId,
  href,
  body,
  dismissAction
}: {
  notificationId: number;
  href: string;
  body: string;
  dismissAction: (notificationId: number) => Promise<void>;
}) {
  const [visible, setVisible] = useState(true);
  const dismissedRef = useRef(false);
  const [, startTransition] = useTransition();

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    startTransition(() => {
      void dismissAction(notificationId);
    });
  }, [dismissAction, notificationId]);

  useEffect(() => {
    const timeout = window.setTimeout(dismiss, 30_000);
    return () => window.clearTimeout(timeout);
  }, [dismiss]);

  if (!visible) return null;

  return (
    <aside className="achievement-toast" aria-live="polite">
      <Link href={href as Route} className="achievement-toast-link">
        <span>Achievement unlocked</span>
        <strong>{body}</strong>
      </Link>
      <button type="button" className="achievement-toast-close" onClick={dismiss} aria-label="Dismiss achievement">
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
