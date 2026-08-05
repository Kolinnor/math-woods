"use client";

import { useEffect } from "react";
import { SITE_PRESENCE_HEARTBEAT_MS, isSitePresenceId } from "@/lib/site-presence-config";

const PRESENCE_STORAGE_KEY = "math-woods-presence-id";
let ephemeralPresenceId: string | null = null;

export function SitePresenceHeartbeat() {
  useEffect(() => {
    const presenceId = browserPresenceId();
    const heartbeat = () => {
      void fetch("/api/presence", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
        headers: { "X-Math-Woods-Presence": presenceId }
      }).catch(() => undefined);
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, SITE_PRESENCE_HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

function browserPresenceId() {
  try {
    const existing = window.localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (isSitePresenceId(existing)) return existing as string;

    const created = crypto.randomUUID();
    window.localStorage.setItem(PRESENCE_STORAGE_KEY, created);
    return created;
  } catch {
    ephemeralPresenceId ??= crypto.randomUUID();
    return ephemeralPresenceId;
  }
}
