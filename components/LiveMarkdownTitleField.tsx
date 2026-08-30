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
  contentKind?: "concept" | "problem";
};

export function LiveMarkdownTitleField({
  defaultValue = "",
  locale,
  placeholder,
  required = false,
  contentKind = "concept"
}: LiveMarkdownTitleFieldProps) {
  const t = dictionaryForLocale(locale);
  const isProblem = contentKind === "problem";
  const configuredMaxLength = isProblem ? CONTENT_LIMITS.problemTitle : CONTENT_LIMITS.title;
  const maxLength = Math.max(configuredMaxLength, defaultValue.length);

  return (
    <div className="live-markdown-title-field grid gap-2">
      <span className="text-sm font-medium">{t.contentEditor.title}</span>
      <MarkdownEditor
        name="title"
        initialValue={defaultValue}
        mode="title"
        ariaLabel={t.contentEditor.title}
        required={required}
        maxLength={maxLength}
        characterGuide={isProblem ? {
          target: 100,
          revealAt: 90,
          label: locale === "fr" ? "Titre concis recommandé" : "Concise title recommended",
          overflowMessage: locale === "fr"
            ? `Le titre reste accepté jusqu’à ${maxLength} caractères.`
            : `The title is still accepted up to ${maxLength} characters.`
        } : undefined}
        placeholder={placeholder}
        lineNumbers={false}
        localDrafts={false}
        imageUploadEnabled={false}
      />
    </div>
  );
}
