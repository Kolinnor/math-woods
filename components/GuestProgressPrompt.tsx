"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GUEST_PROGRESS_PROMPT_DELAY_MS } from "@/lib/guest-progress";

const SHOWN_SESSION_KEY = "math-woods:guest-progress:shown";

export function GuestProgressPrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const returnTo = useMemo(
    () => `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams]
  );
  const signInHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  const shouldSchedule = pathname !== "/login";

  useEffect(() => {
    if (!shouldSchedule) return;

    try {
      if (sessionStorage.getItem(SHOWN_SESSION_KEY) === "true") return;
    } catch {
      // The reminder can still appear when session storage is unavailable.
    }

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SHOWN_SESSION_KEY, "true");
      } catch {
        // Local state is enough when session storage is unavailable.
      }
      setVisible(true);
    }, GUEST_PROGRESS_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [shouldSchedule]);

  function dismiss() {
    setVisible(false);
  }

  if (!visible || pathname === "/login") return null;

  return (
    <aside className="guest-progress-prompt" role="dialog" aria-live="polite" aria-labelledby="guest-progress-message">
      <button
        type="button"
        className="guest-progress-prompt-close"
        onClick={dismiss}
        aria-label="Close"
        title="Close"
      >
        <X size={20} aria-hidden="true" />
      </button>
      <p id="guest-progress-message">
        Sign in to record your progress. It is free and only takes a few seconds.
      </p>
      <Link href={signInHref as never} className="mw-primary-button guest-progress-prompt-action">
        Sign in
      </Link>
    </aside>
  );
}
