"use client";

import { Search, Swords, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProblemChallengeAction,
  type ProblemChallengeActionState
} from "@/lib/actions/problem-challenge-actions";
import {
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH,
  type ProblemChallengeLabels
} from "@/lib/problem-challenges";

type SuggestedProblem = {
  difficulty: number | null;
  domainLabel: string;
  language: string;
  listed: boolean;
  slug: string;
  title: string;
};

type ProblemChallengeDialogProps = {
  buttonClassName?: string;
  iconOnly?: boolean;
  labels: ProblemChallengeLabels;
  recipientName: string;
  recipientUsername: string;
};

const initialState: ProblemChallengeActionState = { error: null, ok: false };

function template(value: string, key: string, replacement: string) {
  return value.replace(`{${key}}`, replacement);
}

function ChallengeSubmitButton({ labels, disabled }: { labels: ProblemChallengeLabels; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={disabled || pending}>
      <Swords size={17} aria-hidden="true" />
      {pending ? labels.sending : labels.send}
    </button>
  );
}

export function ProblemChallengeDialog({
  buttonClassName = "secondary",
  iconOnly = false,
  labels,
  recipientName,
  recipientUsername
}: ProblemChallengeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createProblemChallengeAction.bind(null, recipientUsername),
    initialState
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedProblem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<SuggestedProblem | null>(null);
  const [searching, setSearching] = useState(false);
  const [visibleError, setVisibleError] = useState<ProblemChallengeActionState["error"]>(null);

  useEffect(() => {
    setVisibleError(state.error);
    if (state.ok) {
      formRef.current?.reset();
      setQuery("");
      setSuggestions([]);
      setSelectedProblem(null);
      dialogRef.current?.close();
    }
  }, [state]);

  useEffect(() => {
    const trimmed = query.trim();
    if (selectedProblem || trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/problems/suggest?listed=1&q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = response.ok ? await response.json() as { problems?: SuggestedProblem[] } : {};
        if (!controller.signal.aborted) setSuggestions(data.problems ?? []);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, selectedProblem]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className={iconOnly ? `icon-button ${buttonClassName}`.trim() : `button challenge-button ${buttonClassName}`.trim()}
        title={labels.button}
        aria-label={labels.button}
        onClick={() => {
          setVisibleError(null);
          dialogRef.current?.showModal();
        }}
      >
        <Swords size={iconOnly ? 16 : 17} aria-hidden="true" />
        {!iconOnly && <span>{labels.button}</span>}
      </button>

      <dialog ref={dialogRef} className="problem-challenge-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            <Swords size={27} />
          </div>
          <div>
            <h2>{template(labels.challengeUser, "name", recipientName)}</h2>
          </div>
          <button type="button" className="icon-button secondary" onClick={closeDialog} title={labels.close} aria-label={labels.close}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form ref={formRef} action={formAction} className="problem-challenge-form">
          <input type="hidden" name="problemSlug" value={selectedProblem?.slug ?? ""} />

          <div className="problem-challenge-problem-field">
            <span className="text-sm font-medium">{labels.problem}</span>
            {selectedProblem ? (
              <div className="problem-challenge-selected">
                <div>
                  <strong>{selectedProblem.title}</strong>
                  <span>
                    {selectedProblem.domainLabel}
                    {selectedProblem.difficulty !== null ? ` · ${selectedProblem.difficulty}/100` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button secondary"
                  onClick={() => setSelectedProblem(null)}
                  title={labels.close}
                  aria-label={labels.close}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="problem-challenge-search">
                <Search size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setVisibleError(null);
                    setQuery(event.target.value);
                  }}
                  placeholder={labels.searchPlaceholder}
                  aria-label={labels.searchPlaceholder}
                  autoComplete="off"
                />
                {(searching || suggestions.length > 0 || query.trim().length >= 2) && (
                  <div className="problem-challenge-suggestions">
                    {searching && <p>{labels.searching}</p>}
                    {!searching && suggestions.map((problem) => (
                      <button
                        key={problem.slug}
                        type="button"
                        onClick={() => {
                          setVisibleError(null);
                          setSelectedProblem(problem);
                          setQuery("");
                          setSuggestions([]);
                        }}
                      >
                        <strong>{problem.title}</strong>
                        <span>
                          {problem.domainLabel}
                          {problem.difficulty !== null ? ` · ${problem.difficulty}/100` : ""}
                        </span>
                      </button>
                    ))}
                    {!searching && suggestions.length === 0 && <p>{labels.noResults}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <textarea
            name="message"
            maxLength={PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH}
            placeholder={labels.messagePlaceholder}
            aria-label={labels.messagePlaceholder}
          />

          {visibleError && <p className="form-error" role="alert">{labels.errors[visibleError]}</p>}

          <footer>
            <button type="button" className="secondary" onClick={closeDialog}>{labels.cancel}</button>
            <ChallengeSubmitButton labels={labels} disabled={!selectedProblem} />
          </footer>
        </form>
      </dialog>
    </>
  );
}
