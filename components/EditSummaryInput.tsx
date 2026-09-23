"use client";

import { DraftTextInput } from "@/components/DraftTextInput";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { editSummaryValidationMessage } from "@/lib/form-feedback";

export function EditSummaryInput({ locale, ...props }: {
  locale: "fr" | "en";
  draftKey: string;
  resetSignal: string | number;
  placeholder?: string;
}) {
  return <DraftTextInput {...props} name="editSummary" characterLimit={CONTENT_LIMITS.shortText}
    limitMessage={editSummaryValidationMessage(locale)} />;
}
