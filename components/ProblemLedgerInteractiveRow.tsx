"use client";

import Link from "next/link";
import { Check, Heart, House, Target } from "lucide-react";
import { useState, type ReactNode } from "react";

type BrowserOperation = "solve" | "unsolve" | "attempt" | "unattempt" | "favorite";

type Labels = {
  addFavorite: string;
  attempted: string;
  favoriteProblem: string;
  favorites: string;
  markSolved: string;
  removeFavorite: string;
  startAttempting: string;
  unmarkSolved: string;
  updateFailed: string;
  yourProblem: string;
};

export function ProblemLedgerInteractiveRow({
  author,
  children,
  className,
  favoriteCount: initialFavoriteCount,
  initialAttempted,
  initialFavorite,
  initialSolved,
  isConjecture,
  isOwnProblem,
  labels,
  problemId,
  problemSlug,
  requiresVerification,
  signedIn
}: {
  author: ReactNode;
  children: ReactNode;
  className: string;
  favoriteCount: number;
  initialAttempted: boolean;
  initialFavorite: boolean;
  initialSolved: boolean;
  isConjecture: boolean;
  isOwnProblem: boolean;
  labels: Labels;
  problemId: number;
  problemSlug: string;
  requiresVerification: boolean;
  signedIn: boolean;
}) {
  const [solved, setSolved] = useState(initialSolved);
  const [attempted, setAttempted] = useState(initialAttempted);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);
  const [pending, setPending] = useState<BrowserOperation | null>(null);
  const [failed, setFailed] = useState(false);

  async function persist(operation: BrowserOperation, optimistic: () => void, rollback: () => void) {
    if (pending) return;
    setFailed(false);
    setPending(operation);
    optimistic();
    try {
      const response = await fetch(`/api/problems/${problemId}/browser-state`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation })
      });
      if (!response.ok) throw new Error("Problem state update failed.");
    } catch {
      rollback();
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  const stateClass = solved ? " problem-solved" : attempted ? " problem-opened" : "";
  const favoriteClass = !isOwnProblem && favorite ? " problem-favorite" : "";
  const rowTitle = isOwnProblem ? labels.yourProblem : favorite ? labels.favoriteProblem : undefined;
  const solveLabel = solved ? labels.unmarkSolved : labels.markSolved;
  const attemptLabel = attempted ? labels.attempted : labels.startAttempting;
  const signInHref = `/login?returnTo=${encodeURIComponent(`/problems/${problemSlug}`)}`;

  return (
    <div
      className={`${className}${stateClass}${favoriteClass}${failed ? " problem-ledger-action-failed" : ""}`}
      title={failed ? labels.updateFailed : rowTitle}
    >
      <div className="problem-ledger-progress-action">
        {!isConjecture && (!signedIn ? (
          <Link href={signInHref as never} className="problem-ledger-check" title={labels.markSolved} aria-label={labels.markSolved}>
            <Check size={14} strokeWidth={3} />
          </Link>
        ) : !solved && requiresVerification ? (
          <Link
            href={`/problems/${problemSlug}#problem-verification`}
            className="problem-ledger-check"
            title={labels.markSolved}
            aria-label={labels.markSolved}
          >
            <Check size={14} strokeWidth={3} />
          </Link>
        ) : (
          <button
            type="button"
            className={`problem-ledger-check${solved ? " is-solved" : ""}`}
            title={solveLabel}
            aria-label={solveLabel}
            aria-pressed={solved}
            disabled={pending !== null}
            onClick={() => {
              const wasSolved = solved;
              const wasAttempted = attempted;
              void persist(
                solved ? "unsolve" : "solve",
                () => {
                  setSolved(!wasSolved);
                  if (wasSolved) setAttempted(true);
                },
                () => {
                  setSolved(wasSolved);
                  setAttempted(wasAttempted);
                }
              );
            }}
          >
            <Check size={14} strokeWidth={3} />
          </button>
        ))}
      </div>

      {children}

      <div className="problem-ledger-side">
        {author}
        {!solved && signedIn && attempted && (
          <button
            type="button"
            className="problem-ledger-attempt is-active"
            title={attemptLabel}
            aria-label={attemptLabel}
            aria-pressed="true"
            disabled={pending !== null}
            onClick={() => {
              const wasAttempted = attempted;
              void persist(
                attempted ? "unattempt" : "attempt",
                () => setAttempted(!wasAttempted),
                () => setAttempted(wasAttempted)
              );
            }}
          >
            <Target size={16} strokeWidth={2.5} />
          </button>
        )}

        {isOwnProblem && (
          <span className="problem-favorite-count problem-own-count" title={labels.yourProblem}>
            <House size={15} />
          </span>
        )}

        {isOwnProblem ? (
          <span className="problem-favorite-count" title={labels.favorites}>
            <Heart size={15} />
            {favoriteCount}
          </span>
        ) : !signedIn ? (
          <Link href={signInHref as never} className="problem-favorite-count" title={labels.addFavorite} aria-label={labels.addFavorite}>
            <Heart size={15} />
            {favoriteCount}
          </Link>
        ) : (
          <button
            type="button"
            className={favorite ? "problem-favorite-count problem-favorite-count-own" : "problem-favorite-count"}
            title={favorite ? labels.removeFavorite : labels.addFavorite}
            aria-label={favorite ? labels.removeFavorite : labels.addFavorite}
            aria-pressed={favorite}
            disabled={pending !== null}
            onClick={() => {
              const wasFavorite = favorite;
              const previousCount = favoriteCount;
              void persist(
                "favorite",
                () => {
                  setFavorite(!wasFavorite);
                  setFavoriteCount(Math.max(0, previousCount + (wasFavorite ? -1 : 1)));
                },
                () => {
                  setFavorite(wasFavorite);
                  setFavoriteCount(previousCount);
                }
              );
            }}
          >
            <Heart size={15} fill={favorite ? "currentColor" : "none"} />
            {favoriteCount}
          </button>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {failed ? labels.updateFailed : ""}
      </span>
    </div>
  );
}
