"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { contentHistory, historyCopy, type ContentHistory } from "@/lib/content-history";
import { clearAcknowledgedEditorDrafts, markEditorDraftSubmission } from "@/lib/editor-draft-receipts";

export function ContentHistoryEditor({ initial, locale, draftKey, resetSignal, sourceUpdatedAt, allowSpoiler = false }: {
  initial?: Partial<ContentHistory>; locale: string; draftKey: string;
  resetSignal?: string | number | null; sourceUpdatedAt?: number; allowSpoiler?: boolean;
}) {
  const history = contentHistory(initial);
  const copy = historyCopy(locale);
  const root = useRef<HTMLElement>(null);
  const [added, setAdded] = useState(history.historyEnabled || Boolean(history.historyMarkdown));
  const [enabled, setEnabled] = useState(history.historyEnabled);
  const [spoiler, setSpoiler] = useState(history.historySpoiler);
  const optionsKey = `math-woods-text-field-draft:${draftKey}-options`;
  const baseOptions = JSON.stringify([history.historyEnabled, history.historySpoiler]);
  useEffect(() => {
    clearAcknowledgedEditorDrafts();
    try {
      const draft = JSON.parse(localStorage.getItem(`math-woods-markdown-draft:${draftKey}`) ?? "null");
      if (draft?.value?.trim()) setAdded(true);
      const options = JSON.parse(localStorage.getItem(optionsKey) ?? "null");
      if (options?.baseValue === baseOptions) {
        const value = JSON.parse(options.value);
        if (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "boolean")) {
          setEnabled(value[0]); setSpoiler(value[1]); setAdded(true);
        }
      }
    } catch { /* Storage is optional. */ }
  }, [draftKey, optionsKey, baseOptions]);
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const submit = () => markEditorDraftSubmission(form, optionsKey, JSON.stringify([enabled, spoiler]));
    form.addEventListener("submit", submit, true);
    return () => form.removeEventListener("submit", submit, true);
  }, [optionsKey, enabled, spoiler]);
  function updateOptions(nextEnabled: boolean, nextSpoiler: boolean) {
    setEnabled(nextEnabled); setSpoiler(nextSpoiler);
    try {
      localStorage.setItem(optionsKey, JSON.stringify({ value: JSON.stringify([nextEnabled, nextSpoiler]), baseValue: baseOptions, updatedAt: Date.now() }));
    } catch { /* Storage is optional. */ }
  }
  return <section ref={root} className="content-history-editor">
    {!added && <button type="button" className="secondary" onClick={() => { setAdded(true); updateOptions(true, spoiler); }}>{copy.add}</button>}
    {added && <div className="grid gap-3">
      <h2>{copy.title}</h2>
      <p className="muted text-sm">{copy.help}</p>
      <label className="checkbox-field"><input type="checkbox" name="historyEnabled" checked={enabled} onChange={event => updateOptions(event.target.checked, spoiler)} /><span>{copy.show}</span></label>
      <p className="muted text-sm">{copy.hidden}</p>
      <MarkdownEditor name="historyMarkdown" initialValue={history.historyMarkdown} draftKey={draftKey}
        confirmDraftSave={!draftKey.includes(":new:")} resetSignal={resetSignal} sourceUpdatedAt={sourceUpdatedAt}
        maxLength={60000} ariaLabel={copy.title} minHeight="12rem" />
      {allowSpoiler && <label className="checkbox-field"><input type="checkbox" name="historySpoiler" checked={spoiler} onChange={event => updateOptions(enabled, event.target.checked)} /><span>{copy.spoiler}</span></label>}
    </div>}
  </section>;
}
