"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  guestProgressContentKey,
  GUEST_PROGRESS_PROMPT_THRESHOLD
} from "@/lib/guest-progress";

const VISITED_CONTENT_KEY = "math-woods:guest-progress:visited";
const DISMISSED_SESSION_KEY = "math-woods:guest-progress:dismissed";

function storedVisitedContent() {
  try {
    const value = JSON.parse(localStorage.getItem(VISITED_CONTENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function GuestProgressPrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const contentKey = useMemo(
    () => guestProgressContentKey(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams]
  );

  useEffect(() => {
    if (!contentKey) return;

    try {
      const visited = new Set(storedVisitedContent());
      visited.add(contentKey);
      localStorage.setItem(VISITED_CONTENT_KEY, JSON.stringify([...visited]));

      if (
        visited.size >= GUEST_PROGRESS_PROMPT_THRESHOLD &&
        sessionStorage.getItem(DISMISSED_SESSION_KEY) !== "true"
      ) {
        setVisible(true);
      }
    } catch {
      // Browsing still works when storage is unavailable or blocked.
    }
  }, [contentKey]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_SESSION_KEY, "true");
    } catch {
      // The local state is enough for the current page when storage is blocked.
    }
    setVisible(false);
  }

  if (!visible || pathname === "/login") return null;

  return (
    <aside className="guest-progress-prompt" aria-live="polite">
      <p><Link href="/login">Log in</Link> to record your progress. It is free.</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss login reminder" title="Dismiss">
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
