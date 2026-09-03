"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { voteConceptUsefulnessAction } from "@/lib/actions/concept-actions";

const SCALE = [1, 2, 3, 4, 5] as const;

type Labels = {
  question: string;
  notUseful: string;
  veryUseful: string;
  confirm: string;
  thanks: string;
  revote: string;
  revoteConfirmTitle: string;
  revoteConfirmYes: string;
  revoteConfirmNo: string;
  averageLabel: string;
  voteSingular: string;
  votePlural: string;
  signInPrompt: string;
  updateFailed: string;
};

export function ConceptUsefulnessGauge({
  conceptId,
  signedIn,
  signInHref,
  initialUserValue,
  initialAverage,
  initialCount,
  labels
}: {
  conceptId: number;
  signedIn: boolean;
  signInHref: string;
  initialUserValue: number | null;
  initialAverage: number | null;
  initialCount: number;
  labels: Labels;
}) {
  const [submittedValue, setSubmittedValue] = useState(initialUserValue);
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [isRevoting, setIsRevoting] = useState(false);
  const [revoteConfirmOpen, setRevoteConfirmOpen] = useState(false);
  const [average, setAverage] = useState(initialAverage);
  const [count, setCount] = useState(initialCount);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSelecting = submittedValue === null || isRevoting;

  function confirmVote() {
    if (pendingValue === null) return;
    const value = pendingValue;
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await voteConceptUsefulnessAction(conceptId, value);
        setSubmittedValue(result.value);
        setAverage(result.average);
        setCount(result.count);
        setPendingValue(null);
        setIsRevoting(false);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <section className="concept-usefulness" aria-label={labels.question}>
      <p className="concept-usefulness-question">{labels.question}</p>
      <div className="concept-usefulness-scale">
        <div className="concept-usefulness-numbers">
          {SCALE.map((value) => {
            const isChosen = isSelecting ? pendingValue === value : submittedValue === value;
            if (!signedIn) {
              return (
                <Link
                  key={value}
                  href={signInHref as never}
                  className="concept-usefulness-option"
                  title={labels.signInPrompt}
                >
                  {value}
                </Link>
              );
            }
            return (
              <button
                key={value}
                type="button"
                className={`concept-usefulness-option${isChosen ? " is-chosen" : ""}`}
                disabled={!isSelecting || isPending}
                aria-pressed={isChosen}
                onClick={() => setPendingValue(value)}
              >
                {value}
              </button>
            );
          })}
        </div>
        <div className="concept-usefulness-bar" />
        <div className="concept-usefulness-captions">
          <span>{labels.notUseful}</span>
          <span>{labels.veryUseful}</span>
        </div>
      </div>

      <div className="concept-usefulness-footer">
        {count > 0 && average !== null && (
          <p className="concept-usefulness-average">
            {labels.averageLabel} {Math.round(average * 10) / 10}/5 ({count} {count > 1 ? labels.votePlural : labels.voteSingular})
          </p>
        )}

        {signedIn && isSelecting && pendingValue !== null && (
          <button type="button" className="secondary" disabled={isPending} onClick={confirmVote}>
            {labels.confirm}
          </button>
        )}

        {signedIn && !isSelecting && (
          <div className="concept-usefulness-voted">
            <span>{labels.thanks}</span>
            <button
              type="button"
              className="concept-usefulness-revote-trigger"
              onClick={() => setRevoteConfirmOpen(true)}
            >
              {labels.revote}
            </button>
          </div>
        )}

        {failed && (
          <p className="concept-usefulness-error" role="status">
            {labels.updateFailed}
          </p>
        )}
      </div>

      {revoteConfirmOpen && (
        <div className="concept-usefulness-revote-confirm" role="alertdialog">
          <p>{labels.revoteConfirmTitle}</p>
          <div className="concept-usefulness-revote-confirm-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setRevoteConfirmOpen(false);
                setIsRevoting(true);
              }}
            >
              {labels.revoteConfirmYes}
            </button>
            <button type="button" onClick={() => setRevoteConfirmOpen(false)}>
              {labels.revoteConfirmNo}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
