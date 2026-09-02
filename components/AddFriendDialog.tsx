"use client";

import { UserPlus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendFriendRequestFormAction } from "@/lib/actions/social-actions";
import { CONTENT_LIMITS } from "@/lib/content-limits";

export type AddFriendDialogLabels = {
  trigger: string;
  title: string;
  messagePlaceholder: string;
  cancel: string;
  send: string;
  sending: string;
};

const initialState = {
  ok: false,
  message: null as string | null
};

function template(value: string, key: string, replacement: string) {
  return value.replace(`{${key}}`, replacement);
}

function SendButton({ labels }: { labels: AddFriendDialogLabels }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? labels.sending : labels.send}
    </button>
  );
}

export function AddFriendDialog({
  username,
  displayName,
  labels
}: {
  username: string;
  displayName: string;
  labels: AddFriendDialogLabels;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(sendFriendRequestFormAction.bind(null, username), initialState);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        {labels.trigger}
      </button>

      <dialog ref={dialogRef} className="problem-challenge-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            <UserPlus size={27} />
          </div>
          <div>
            <h2>{template(labels.title, "name", displayName)}</h2>
          </div>
          <button type="button" className="icon-button secondary" onClick={closeDialog} title={labels.cancel} aria-label={labels.cancel}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form ref={formRef} action={formAction} className="problem-challenge-form">
          <textarea
            name="introMessage"
            maxLength={CONTENT_LIMITS.shortText}
            placeholder={labels.messagePlaceholder}
            aria-label={labels.messagePlaceholder}
          />

          {!state.ok && state.message && (
            <p className="form-error" role="alert">{state.message}</p>
          )}

          <footer>
            <button type="button" className="secondary" onClick={closeDialog}>{labels.cancel}</button>
            <SendButton labels={labels} />
          </footer>
        </form>
      </dialog>
    </>
  );
}
