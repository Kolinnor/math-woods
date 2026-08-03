"use client";

import { Link2, Share2, Swords, UserRound, X } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import {
  ProblemChallengeDialog,
  type ProblemChallengeDialogHandle,
  type ProblemChallengeProblem
} from "@/components/ProblemChallengeDialog";
import {
  ProblemChallengeLinkDialog,
  type ProblemChallengeLinkDialogHandle,
  type ProblemChallengeLinkDialogLabels
} from "@/components/ProblemChallengeLinkDialog";
import type { ProblemChallengeLabels, ProblemDeliveryIntent } from "@/lib/problem-challenges";

type ProblemChallengeLauncherProps = {
  className?: string;
  challengeLabels: ProblemChallengeLabels;
  linkLabels: ProblemChallengeLinkDialogLabels;
  problem: ProblemChallengeProblem;
};

export function ProblemChallengeLauncher({
  className,
  challengeLabels,
  linkLabels,
  problem
}: ProblemChallengeLauncherProps) {
  const chooserRef = useRef<HTMLDialogElement>(null);
  const userDialogRef = useRef<ProblemChallengeDialogHandle>(null);
  const linkDialogRef = useRef<ProblemChallengeLinkDialogHandle>(null);
  const [intent, setIntent] = useState<ProblemDeliveryIntent>("share");

  function openDelivery(
    dialogRef: RefObject<ProblemChallengeDialogHandle | ProblemChallengeLinkDialogHandle | null>
  ) {
    chooserRef.current?.close();
    window.setTimeout(() => dialogRef.current?.open(), 0);
  }

  return (
    <>
      <button
        type="button"
        className={className ? `challenge-button ${className}` : "button challenge-button w-full"}
        onClick={() => chooserRef.current?.showModal()}
      >
        <Share2 size={16} aria-hidden="true" />
        <span>{challengeLabels.button}</span>
      </button>

      <dialog ref={chooserRef} className="problem-challenge-dialog problem-challenge-method-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            {intent === "share" ? <Share2 size={27} /> : <Swords size={27} />}
          </div>
          <h2>{challengeLabels.chooserTitle}</h2>
          <button
            type="button"
            className="icon-button secondary"
            onClick={() => chooserRef.current?.close()}
            title={challengeLabels.close}
            aria-label={challengeLabels.close}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="problem-delivery-intent" role="group" aria-label={challengeLabels.chooserTitle}>
          <button
            type="button"
            className={intent === "share" ? "active" : ""}
            aria-pressed={intent === "share"}
            onClick={() => setIntent("share")}
          >
            <Share2 size={18} aria-hidden="true" />
            {challengeLabels.shareMode}
          </button>
          <button
            type="button"
            className={intent === "challenge" ? "active" : ""}
            aria-pressed={intent === "challenge"}
            onClick={() => setIntent("challenge")}
          >
            <Swords size={18} aria-hidden="true" />
            {challengeLabels.challengeMode}
          </button>
        </div>
        {intent === "challenge" ? (
          <p className="problem-delivery-description">{challengeLabels.challengeDescription}</p>
        ) : null}
        <div className="problem-challenge-methods">
          <button type="button" onClick={() => openDelivery(userDialogRef)}>
            <UserRound size={21} aria-hidden="true" />
            <span>{intent === "share" ? challengeLabels.shareProblem : challengeLabels.challengeProblem}</span>
          </button>
          <button type="button" className="secondary" onClick={() => openDelivery(linkDialogRef)}>
            <Link2 size={21} aria-hidden="true" />
            <span>{intent === "share" ? linkLabels.shareGenerate : linkLabels.button}</span>
          </button>
        </div>
      </dialog>

      <ProblemChallengeDialog
        key={`user-${intent}`}
        ref={userDialogRef}
        hideTrigger
        initialProblem={problem}
        intent={intent}
        labels={challengeLabels}
      />
      <ProblemChallengeLinkDialog
        key={`link-${intent}`}
        ref={linkDialogRef}
        hideTrigger
        intent={intent}
        labels={linkLabels}
        problem={problem}
      />
    </>
  );
}
