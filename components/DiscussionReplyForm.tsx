"use client";

import { useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Reply, Send, X } from "lucide-react";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { LanguageField } from "@/components/LanguageField";
import { DiscussionReplyQuote } from "@/components/DiscussionReplyQuote";
import type { DiscussionReplyPreview } from "@/lib/discussion-reply-preview";

export function DiscussionReplyForm({ action, reply, locale, draftKey, resetSignal, anchorPrefix, withLanguage = false }: {
  action: (data: FormData) => Promise<void>;
  reply: DiscussionReplyPreview;
  locale: "fr" | "en";
  draftKey: string;
  resetSignal: number;
  anchorPrefix: "post" | "comment";
  withLanguage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, transition] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const fr = locale === "fr";
  const close = () => { setOpen(false); setError(""); button.current?.focus(); };
  return <div className={`discussion-reply-control${open ? " is-open" : ""}`}>
    <button ref={button} type="button" className="discussion-text-action" aria-expanded={open} aria-controls={formId}
      disabled={pending} onClick={() => { setSuccess(false); open ? close() : setOpen(true); }}>
      <Reply size={14} aria-hidden="true" />{fr ? "Répondre" : "Reply"}
    </button>
    {success && <span role="status" className="muted">{fr ? "Réponse publiée." : "Reply posted."}</span>}
    {open && <form id={formId} className="discussion-inline-form discussion-reply-form" aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        setError("");
        transition(async () => {
          try {
            await action(data);
            close();
            setSuccess(true);
          } catch (cause) {
            unstable_rethrow(cause);
            setError(fr
              ? "La réponse n’a pas pu être publiée. Vérifiez votre connexion et que le commentaire existe toujours. Votre saisie est conservée."
              : "The reply could not be posted. Check your connection and that the comment still exists. Your text has been preserved.");
          }
        });
      }}>
      <input type="hidden" name="parentId" value={reply.id} />
      <input type="hidden" name="replyInline" value="1" />
      <DiscussionReplyQuote reply={reply} anchorPrefix={anchorPrefix} locale={locale} />
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={pending} className="contents">
        <LazyMarkdownEditor name="bodyMarkdown" minHeight="7rem" lineNumbers={false}
          draftKey={`${draftKey}:reply-to:${reply.id}`} resetSignal={resetSignal} confirmDraftSave />
        {withLanguage && <LanguageField defaultValue={locale} label={fr ? "Langue" : "Language"} />}
        <div className="discussion-reply-actions">
          <button type="button" className="secondary" onClick={close}><X size={14} aria-hidden="true" />{fr ? "Annuler" : "Cancel"}</button>
          <button type="submit"><Send size={14} aria-hidden="true" />{fr ? "Publier la réponse" : "Post reply"}</button>
        </div>
      </fieldset>
    </form>}
  </div>;
}
