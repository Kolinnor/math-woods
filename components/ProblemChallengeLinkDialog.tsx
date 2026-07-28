"use client";

import { Check, Copy, Link2, Swords, X } from "lucide-react";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProblemChallengeInviteAction,
  type ProblemChallengeInviteActionState
} from "@/lib/actions/problem-challenge-invite-actions";
import type { Dictionary } from "@/lib/i18n/types";
import { PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH } from "@/lib/problem-challenges";

type ProblemChallengeLinkDialogProps = {
  buttonClassName?: string;
  hideTrigger?: boolean;
  labels: ProblemChallengeLinkDialogLabels;
  problem: {
    difficulty: number | null;
    domainLabel: string;
    slug: string;
    title: string;
  };
};

export type ProblemChallengeLinkDialogHandle = {
  open: () => void;
};

export type ProblemChallengeLinkDialogLabels = Pick<
  Dictionary["social"]["challengeLink"],
  | "button"
  | "cancel"
  | "close"
  | "copied"
  | "copy"
  | "createAnother"
  | "description"
  | "done"
  | "errors"
  | "expiryNotice"
  | "generate"
  | "generating"
  | "linkLabel"
  | "messagePlaceholder"
  | "problem"
  | "ready"
  | "title"
>;

const initialState: ProblemChallengeInviteActionState = {
  error: null,
  linkPath: null
};

function GenerateLinkButton({ labels }: { labels: ProblemChallengeLinkDialogLabels }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      <Link2 size={17} aria-hidden="true" />
      {pending ? labels.generating : labels.generate}
    </button>
  );
}

export const ProblemChallengeLinkDialog = forwardRef<
  ProblemChallengeLinkDialogHandle,
  ProblemChallengeLinkDialogProps
>(function ProblemChallengeLinkDialog({
  buttonClassName = "secondary",
  hideTrigger = false,
  labels,
  problem
}, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createProblemChallengeInviteAction.bind(null, problem.slug),
    initialState
  );
  const [linkPath, setLinkPath] = useState<string | null>(null);
  const [absoluteLink, setAbsoluteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useImperativeHandle(ref, () => ({
    open() {
      dialogRef.current?.showModal();
    }
  }), []);

  useEffect(() => {
    if (state.linkPath) setLinkPath(state.linkPath);
  }, [state.linkPath]);

  useEffect(() => {
    setAbsoluteLink(linkPath ? new URL(linkPath, window.location.origin).href : "");
    setCopied(false);
  }, [linkPath]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function copyLink() {
    if (!absoluteLink) return;
    await navigator.clipboard.writeText(absoluteLink);
    setCopied(true);
  }

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className={`button challenge-button ${buttonClassName}`.trim()}
          title={labels.button}
          aria-label={labels.button}
          onClick={() => dialogRef.current?.showModal()}
        >
          <Link2 size={17} aria-hidden="true" />
          <span>{labels.button}</span>
        </button>
      )}

      <dialog ref={dialogRef} className="problem-challenge-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            <Swords size={27} />
          </div>
          <h2>{labels.title}</h2>
          <button
            type="button"
            className="icon-button secondary"
            onClick={closeDialog}
            title={labels.close}
            aria-label={labels.close}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {linkPath ? (
          <div className="problem-challenge-link-result">
            <p>{labels.ready}</p>
            <div className="problem-challenge-link-copy">
              <input value={absoluteLink} readOnly aria-label={labels.linkLabel} />
              <button type="button" onClick={() => void copyLink()}>
                {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
            <p className="muted text-sm">{labels.expiryNotice}</p>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  formRef.current?.reset();
                  setLinkPath(null);
                }}
              >
                {labels.createAnother}
              </button>
              <button type="button" onClick={closeDialog}>{labels.done}</button>
            </footer>
          </div>
        ) : (
          <form ref={formRef} action={formAction} className="problem-challenge-form">
            <p className="muted text-sm">{labels.description}</p>
            <div className="problem-challenge-problem-field">
              <span className="text-sm font-medium">{labels.problem}</span>
              <div className="problem-challenge-selected">
                <div>
                  <strong>{problem.title}</strong>
                  <span>
                    {problem.domainLabel}
                    {problem.difficulty !== null ? ` · ${problem.difficulty}/100` : ""}
                  </span>
                </div>
              </div>
            </div>
            <textarea
              name="message"
              maxLength={PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH}
              placeholder={labels.messagePlaceholder}
              aria-label={labels.messagePlaceholder}
            />
            <p className="muted text-sm">{labels.expiryNotice}</p>
            {state.error && <p className="form-error" role="alert">{labels.errors[state.error]}</p>}
            <footer>
              <button type="button" className="secondary" onClick={closeDialog}>{labels.cancel}</button>
              <GenerateLinkButton labels={labels} />
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
});
