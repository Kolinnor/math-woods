"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownInline } from "@/components/MarkdownInline";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { dictionaryForLocale } from "@/lib/i18n/dictionary";
import type { InterfaceLocale } from "@/lib/i18n/types";

type LiveMarkdownTitleFieldProps = {
  defaultValue?: string;
  initialHtml?: string;
  locale: InterfaceLocale;
  placeholder?: string;
  required?: boolean;
};

export function LiveMarkdownTitleField({
  defaultValue = "",
  initialHtml = "",
  locale,
  placeholder,
  required = false
}: LiveMarkdownTitleFieldProps) {
  const t = dictionaryForLocale(locale);
  const [value, setValue] = useState(defaultValue);
  const [html, setHtml] = useState(initialHtml);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map(defaultValue ? [[defaultValue, initialHtml]] : []));

  useEffect(() => {
    const title = value.trim();
    if (!title) {
      setHtml("");
      setLoading(false);
      return;
    }

    const cachedHtml = cache.current.get(value);
    if (cachedHtml !== undefined) {
      setHtml(cachedHtml);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/title-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: value }),
          signal: controller.signal
        });
        const result = await response.json() as { html?: string };
        if (!response.ok || result.html === undefined) return;
        cache.current.set(value, result.html);
        setHtml(result.html);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setHtml("");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <label className="live-markdown-title-field grid gap-2">
      <span className="text-sm font-medium">{t.contentEditor.title}</span>
      <input
        name="title"
        required={required}
        maxLength={CONTENT_LIMITS.title}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      {value.trim() && (
        <span
          className={loading ? "live-markdown-title-preview is-loading" : "live-markdown-title-preview"}
          aria-label={t.contentEditor.liveTitlePreview}
          aria-live="polite"
        >
          {html ? <MarkdownInline html={html} /> : <span aria-hidden="true">&nbsp;</span>}
        </span>
      )}
    </label>
  );
}
