"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GUEST_CONTENT_VIEW_STORAGE_KEY,
  parseGuestContentViews,
  recordGuestContentView
} from "@/lib/guest-content-access";

type GuestContentViewGateProps = {
  contentKey: string;
  redirectingLabel: string;
  signedIn: boolean;
};

export function GuestContentViewGate({ contentKey, redirectingLabel, signedIn }: GuestContentViewGateProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tourActive = searchParams.get("tour") === "1";
  const [checkingAccess, setCheckingAccess] = useState(!signedIn && !tourActive);

  useEffect(() => {
    if (tourActive) {
      setCheckingAccess(false);
      return;
    }

    if (signedIn) {
      try {
        localStorage.removeItem(GUEST_CONTENT_VIEW_STORAGE_KEY);
      } catch {
        // Access remains available when local storage is unavailable.
      }
      setCheckingAccess(false);
      return;
    }

    try {
      const currentViews = parseGuestContentViews(localStorage.getItem(GUEST_CONTENT_VIEW_STORAGE_KEY));
      const result = recordGuestContentView(currentViews, contentKey);
      localStorage.setItem(GUEST_CONTENT_VIEW_STORAGE_KEY, JSON.stringify(result.viewedKeys));

      if (result.requiresLogin) {
        const query = searchParams.toString();
        const returnTo = `${pathname}${query ? `?${query}` : ""}`;
        window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
    } catch {
      // Do not block reading if browser storage is unavailable.
    }

    setCheckingAccess(false);
  }, [contentKey, pathname, searchParams, signedIn, tourActive]);

  if (!checkingAccess) return null;

  return (
    <div className="guest-content-view-gate" role="status" aria-label={redirectingLabel}>
      <span className="guest-content-view-spinner" aria-hidden="true" />
    </div>
  );
}
