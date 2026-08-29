"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { X } from "lucide-react";
import { dismissGuideCallout, guideCalloutWasDismissed } from "@/lib/guide-callout-dismissal";

export function ContributionGuideCallout({
  text,
  linkLabel,
  dismissLabel
}: {
  text: string;
  linkLabel: string;
  dismissLabel: string;
}) {
  // null while the stored choice is unknown, so a contributor who already
  // dismissed the callout never sees it flash back on every visit.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(guideCalloutWasDismissed());
  }, []);

  if (dismissed !== false) return null;

  return (
    <aside className="contribution-task-guide panel">
      <p>{text}</p>
      <div className="contribution-task-guide-actions">
        <Link href={"/guide" as Route} className="button secondary">
          {linkLabel}
        </Link>
        <button
          type="button"
          className="contribution-task-guide-dismiss"
          onClick={() => {
            dismissGuideCallout();
            setDismissed(true);
          }}
          title={dismissLabel}
          aria-label={dismissLabel}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
