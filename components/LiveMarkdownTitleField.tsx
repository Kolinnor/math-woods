"use client";

import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { dictionaryForLocale } from "@/lib/i18n/dictionary";
import type { InterfaceLocale } from "@/lib/i18n/types";

type LiveMarkdownTitleFieldProps = {
  defaultValue?: string;
  locale: InterfaceLocale;
  placeholder?: string;
  required?: boolean;
};

export function LiveMarkdownTitleField({
  defaultValue = "",
  locale,
  placeholder,
  required = false
}: LiveMarkdownTitleFieldProps) {
  const t = dictionaryForLocale(locale);

  return (
    <div className="live-markdown-title-field grid gap-2">
      <span className="text-sm font-medium">{t.contentEditor.title}</span>
      <MarkdownEditor
        name="title"
        initialValue={defaultValue}
        mode="title"
        ariaLabel={t.contentEditor.title}
        required={required}
        maxLength={CONTENT_LIMITS.title}
        placeholder={placeholder}
        lineNumbers={false}
        localDrafts={false}
        imageUploadEnabled={false}
      />
    </div>
  );
}
