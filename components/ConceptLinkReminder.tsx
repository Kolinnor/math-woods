"use client";

import { forwardRef } from "react";

export type ConceptLinkReminderLabels = {
  conceptLinkReminderHeading: string;
  conceptLinkReminderMessage: string;
};

export function revealBanner(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center"
  });
}

export const ConceptLinkReminder = forwardRef<HTMLDivElement, {
  labels: ConceptLinkReminderLabels;
}>(function ConceptLinkReminder({ labels }, ref) {
  return (
    <div ref={ref} className="quality-banner concept-link-reminder" role="status" tabIndex={-1}>
      <strong>{labels.conceptLinkReminderHeading}</strong>
      <p>{labels.conceptLinkReminderMessage}</p>
    </div>
  );
});
