"use client";

import { Link2, Swords, UserRound, X } from "lucide-react";
import { useRef, type RefObject } from "react";
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
import type { ProblemChallengeLabels } from "@/lib/problem-challenges";

type ProblemChallengeLauncherProps = {
  challengeLabels: ProblemChallengeLabels;
  linkLabels: ProblemChallengeLinkDialogLabels;
  problem: ProblemChallengeProblem;
};

export function ProblemChallengeLauncher({
  challengeLabels,
  linkLabels,
  problem
}: ProblemChallengeLauncherProps) {
  const chooserRef = useRef<HTMLDialogElement>(null);
  const userDialogRef = useRef<ProblemChallengeDialogHandle>(null);
  const linkDialogRef = useRef<ProblemChallengeLinkDialogHandle>(null);

  function openChallenge(
    dialogRef: RefObject<ProblemChallengeDialogHandle | ProblemChallengeLinkDialogHandle | null>
  ) {
    chooserRef.current?.close();
    window.setTimeout(() => dialogRef.current?.open(), 0);
  }

  return (
    <>
      <button
        type="button"
        className="button challenge-button w-full"
        onClick={() => chooserRef.current?.showModal()}
      >
        <Swords size={17} aria-hidden="true" />
        <span>{challengeLabels.button}</span>
      </button>

      <dialog ref={chooserRef} className="problem-challenge-dialog problem-challenge-method-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            <Swords size={27} />
          </div>
          <h2>{challengeLabels.challengeSomeone}</h2>
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

        <div className="problem-challenge-methods">
          <button type="button" onClick={() => openChallenge(userDialogRef)}>
            <UserRound size={21} aria-hidden="true" />
            <span>{challengeLabels.challengeProblem}</span>
          </button>
          <button type="button" className="secondary" onClick={() => openChallenge(linkDialogRef)}>
            <Link2 size={21} aria-hidden="true" />
            <span>{linkLabels.button}</span>
          </button>
        </div>
      </dialog>

      <ProblemChallengeDialog
        ref={userDialogRef}
        hideTrigger
        initialProblem={problem}
        labels={challengeLabels}
      />
      <ProblemChallengeLinkDialog
        ref={linkDialogRef}
        hideTrigger
        labels={linkLabels}
        problem={problem}
      />
    </>
  );
}
