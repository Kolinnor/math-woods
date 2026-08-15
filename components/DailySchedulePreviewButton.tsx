"use client";

import { Eye } from "lucide-react";
import type { MouseEvent } from "react";

type DailySchedulePreviewButtonProps = {
  dateKey: string;
  fieldNames: string[];
  href: string;
  label?: string;
};

export function DailySchedulePreviewButton({
  dateKey,
  fieldNames,
  href,
  label = "Preview"
}: DailySchedulePreviewButtonProps) {
  function previewDraft(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    const formData = form ? new FormData(form) : null;
    const url = new URL(href, window.location.origin);
    url.searchParams.set("date", dateKey);
    url.searchParams.set("draft", "1");

    for (const fieldName of fieldNames) {
      const values = formData?.getAll(fieldName) ?? [];
      for (const value of values) {
        if (typeof value !== "string" || value === "") continue;
        url.searchParams.append(fieldName, value);
      }
    }

    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <button type="button" className="button secondary" onClick={previewDraft}>
      <Eye size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
