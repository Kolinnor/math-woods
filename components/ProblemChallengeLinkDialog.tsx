"use client";

import { Check, Copy, Link2, Share2, Swords, X } from "lucide-react";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProblemChallengeInviteAction,
  type ProblemChallengeInviteActionState
} from "@/lib/actions/problem-challenge-invite-actions";
import type { Dictionary } from "@/lib/i18n/types";
import {
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH,
  type ProblemDeliveryIntent
} from "@/lib/problem-challenges";

type ProblemChallengeLinkDialogProps = {
  buttonClassName?: string;
  hideTrigger?: boolean;
  intent?: ProblemDeliveryIntent;
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
  | "shareCopied"
  | "shareCopy"
  | "shareDescription"
  | "shareGenerate"
  | "shareLinkLabel"
  | "shareNative"
  | "shareProblem"
  | "shareReady"
  | "shareText"
  | "shareTitle"
  | "title"
>;

const initialState: ProblemChallengeInviteActionState = {
  error: null,
  linkPath: null
};

function GenerateLinkButton({
  intent,
  labels
}: {
  intent: ProblemDeliveryIntent;
  labels: ProblemChallengeLinkDialogLabels;
}) {
  const { pending } = useFormStatus();
  const Icon = intent === "share" ? Share2 : Link2;

  return (
    <button type="submit" disabled={pending}>
      <Icon size={17} aria-hidden="true" />
      {intent === "share" ? labels.shareGenerate : pending ? labels.generating : labels.generate}
    </button>
  );
}

export const ProblemChallengeLinkDialog = forwardRef<
  ProblemChallengeLinkDialogHandle,
  ProblemChallengeLinkDialogProps
>(function ProblemChallengeLinkDialog({
  buttonClassName = "secondary",
  hideTrigger = false,
  intent = "challenge",
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
  const isShare = intent === "share";

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

  useEffect(() => {
    formRef.current?.reset();
    setLinkPath(null);
    setAbsoluteLink("");
    setCopied(false);
  }, [intent]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function copyLink() {
    if (!absoluteLink) return;
    await navigator.clipboard.writeText(absoluteLink);
    setCopied(true);
  }

  async function shareLink() {
    if (!absoluteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: problem.title,
          text: labels.shareText.replace("{title}", problem.title),
          url: absoluteLink
        });
      } catch {
        // Closing the native share sheet is not an application error.
      }
      return;
    }
    await copyLink();
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
          {isShare ? <Share2 size={17} aria-hidden="true" /> : <Link2 size={17} aria-hidden="true" />}
          <span>{labels.button}</span>
        </button>
      )}

      <dialog ref={dialogRef} className="problem-challenge-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            {isShare ? <Share2 size={27} /> : <Swords size={27} />}
          </div>
          <h2>{isShare ? labels.shareTitle : labels.title}</h2>
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
            <p>{isShare ? labels.shareReady : labels.ready}</p>
            <div className="problem-challenge-link-copy">
              <input value={absoluteLink} readOnly aria-label={isShare ? labels.shareLinkLabel : labels.linkLabel} />
              <button type="button" onClick={() => void copyLink()}>
                {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                {copied
                  ? isShare ? labels.shareCopied : labels.copied
                  : isShare ? labels.shareCopy : labels.copy}
              </button>
            </div>
            {!isShare && <p className="muted text-sm">{labels.expiryNotice}</p>}
            <footer>
              {isShare ? (
                <button type="button" className="secondary" onClick={() => void shareLink()}>
                  <Share2 size={17} aria-hidden="true" />
                  {labels.shareNative}
                </button>
              ) : (
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
              )}
              <button type="button" onClick={closeDialog}>{labels.done}</button>
            </footer>
          </div>
        ) : (
          <form
            ref={formRef}
            action={isShare ? undefined : formAction}
            className="problem-challenge-form"
            onSubmit={isShare ? (event) => {
              event.preventDefault();
              setLinkPath(`/problems/${problem.slug}`);
            } : undefined}
          >
            <p className="muted text-sm">{isShare ? labels.shareDescription : labels.description}</p>
            <div className="problem-challenge-problem-field">
              <span className="text-sm font-medium">{isShare ? labels.shareProblem : labels.problem}</span>
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
            {!isShare && (
              <>
                <textarea
                  name="message"
                  maxLength={PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH}
                  placeholder={labels.messagePlaceholder}
                  aria-label={labels.messagePlaceholder}
                />
                <p className="muted text-sm">{labels.expiryNotice}</p>
                {state.error && <p className="form-error" role="alert">{labels.errors[state.error]}</p>}
              </>
            )}
            <footer>
              <button type="button" className="secondary" onClick={closeDialog}>{labels.cancel}</button>
              <GenerateLinkButton intent={intent} labels={labels} />
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
});
