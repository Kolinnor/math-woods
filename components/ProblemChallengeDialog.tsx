"use client";

import { Search, Send, Swords, X } from "lucide-react";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProblemChallengeAction,
  type ProblemChallengeActionState
} from "@/lib/actions/problem-challenge-actions";
import {
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH,
  type ProblemDeliveryIntent,
  type ProblemChallengeLabels
} from "@/lib/problem-challenges";
import { UserAvatar } from "@/components/UserAvatar";

export type ProblemChallengeProblem = {
  difficulty: number | null;
  domainLabel: string;
  language: string;
  listed: boolean;
  slug: string;
  title: string;
};

type SuggestedUser = {
  avatarBackground: string | null;
  avatarUrl: string | null;
  name: string;
  username: string;
};

type ProblemChallengeDialogProps = {
  buttonLabel?: string;
  buttonClassName?: string;
  hideTrigger?: boolean;
  iconOnly?: boolean;
  initialProblem?: ProblemChallengeProblem;
  intent?: ProblemDeliveryIntent;
  labels: ProblemChallengeLabels;
  recipientName?: string;
  recipientUsername?: string;
};

export type ProblemChallengeDialogHandle = {
  open: () => void;
};

const initialState: ProblemChallengeActionState = { error: null, ok: false };

function template(value: string, key: string, replacement: string) {
  return value.replace(`{${key}}`, replacement);
}

function ChallengeSubmitButton({
  labels,
  disabled,
  intent
}: {
  labels: ProblemChallengeLabels;
  disabled: boolean;
  intent: ProblemDeliveryIntent;
}) {
  const { pending } = useFormStatus();
  const Icon = intent === "share" ? Send : Swords;

  return (
    <button type="submit" disabled={disabled || pending}>
      <Icon size={17} aria-hidden="true" />
      {pending
        ? intent === "share" ? labels.shareSending : labels.sending
        : intent === "share" ? labels.shareSend : labels.send}
    </button>
  );
}

export const ProblemChallengeDialog = forwardRef<ProblemChallengeDialogHandle, ProblemChallengeDialogProps>(
function ProblemChallengeDialog({
  buttonLabel,
  buttonClassName = "secondary",
  hideTrigger = false,
  iconOnly = false,
  initialProblem,
  intent = "challenge",
  labels,
  recipientName,
  recipientUsername
}, ref) {
  const fixedProblem = Boolean(initialProblem);
  const fixedRecipient = Boolean(recipientUsername);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createProblemChallengeAction.bind(null, recipientUsername ?? null, intent),
    initialState
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProblemChallengeProblem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<ProblemChallengeProblem | null>(initialProblem ?? null);
  const [userQuery, setUserQuery] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<SuggestedUser[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<SuggestedUser | null>(
    recipientUsername && recipientName
      ? { avatarBackground: null, avatarUrl: null, name: recipientName, username: recipientUsername }
      : null
  );
  const [searching, setSearching] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [visibleError, setVisibleError] = useState<ProblemChallengeActionState["error"]>(null);
  const activeRecipient = fixedRecipient
    ? {
        avatarBackground: null,
        avatarUrl: null,
        name: recipientName ?? recipientUsername ?? "",
        username: recipientUsername ?? ""
      }
    : selectedRecipient;
  const triggerLabel = buttonLabel ?? (intent === "share" ? labels.shareMode : labels.button);

  useImperativeHandle(ref, () => ({
    open() {
      setVisibleError(null);
      dialogRef.current?.showModal();
    }
  }), []);

  useEffect(() => {
    if (fixedProblem) setSelectedProblem(initialProblem ?? null);
  }, [fixedProblem, initialProblem]);

  useEffect(() => {
    setVisibleError(state.error);
    if (state.ok) {
      formRef.current?.reset();
      setQuery("");
      setSuggestions([]);
      setSelectedProblem(initialProblem ?? null);
      setUserQuery("");
      setUserSuggestions([]);
      if (!fixedRecipient) setSelectedRecipient(null);
      dialogRef.current?.close();
    }
  }, [fixedRecipient, initialProblem, state]);

  useEffect(() => {
    const trimmed = query.trim();
    if (fixedProblem || selectedProblem || trimmed.length < 2) {
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
        const data = response.ok ? await response.json() as { problems?: ProblemChallengeProblem[] } : {};
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
  }, [fixedProblem, query, selectedProblem]);

  useEffect(() => {
    const trimmed = userQuery.trim();
    if (fixedRecipient || selectedRecipient || trimmed.length < 2) {
      setUserSuggestions([]);
      setSearchingUsers(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const response = await fetch(`/api/users/suggest?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = response.ok ? await response.json() as { users?: SuggestedUser[] } : {};
        if (!controller.signal.aborted) setUserSuggestions(data.users ?? []);
      } catch {
        if (!controller.signal.aborted) setUserSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchingUsers(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fixedRecipient, selectedRecipient, userQuery]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className={iconOnly ? `icon-button ${buttonClassName}`.trim() : `button challenge-button ${buttonClassName}`.trim()}
          title={triggerLabel}
          aria-label={triggerLabel}
          onClick={() => {
            setVisibleError(null);
            dialogRef.current?.showModal();
          }}
        >
          {intent === "share"
            ? <Send size={iconOnly ? 16 : 17} aria-hidden="true" />
            : <Swords size={iconOnly ? 16 : 17} aria-hidden="true" />}
          {!iconOnly && <span>{triggerLabel}</span>}
        </button>
      )}

      <dialog ref={dialogRef} className="problem-challenge-dialog">
        <header className="problem-challenge-header">
          <div className="problem-challenge-mark" aria-hidden="true">
            {intent === "share" ? <Send size={27} /> : <Swords size={27} />}
          </div>
          <div>
            <h2>
              {activeRecipient
                ? template(
                    intent === "share" ? labels.shareUser : labels.challengeUser,
                    "name",
                    activeRecipient.name
                  )
                : intent === "share" ? labels.shareSomeone : labels.challengeSomeone}
            </h2>
          </div>
          <button type="button" className="icon-button secondary" onClick={closeDialog} title={labels.close} aria-label={labels.close}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form ref={formRef} action={formAction} className="problem-challenge-form">
          <input type="hidden" name="problemSlug" value={selectedProblem?.slug ?? ""} />
          <input type="hidden" name="recipientUsername" value={activeRecipient?.username ?? ""} />

          {!fixedRecipient && (
            <div className="problem-challenge-recipient-field">
              <span className="text-sm font-medium">{labels.recipient}</span>
              {selectedRecipient ? (
                <div className="problem-challenge-selected">
                  <div className="problem-challenge-selected-person">
                    <UserAvatar
                      user={{ ...selectedRecipient, displayName: selectedRecipient.name }}
                      size="sm"
                    />
                    <div>
                      <strong>{selectedRecipient.name}</strong>
                      <span>@{selectedRecipient.username}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button secondary"
                    onClick={() => {
                      setVisibleError(null);
                      setSelectedRecipient(null);
                    }}
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
                    value={userQuery}
                    onChange={(event) => {
                      setVisibleError(null);
                      setUserQuery(event.target.value);
                    }}
                    placeholder={labels.searchUserPlaceholder}
                    aria-label={labels.searchUserPlaceholder}
                    autoComplete="off"
                  />
                  {(searchingUsers || userSuggestions.length > 0 || userQuery.trim().length >= 2) && (
                    <div className="problem-challenge-suggestions">
                      {searchingUsers && <p>{labels.searching}</p>}
                      {!searchingUsers && userSuggestions.map((suggestedUser) => (
                        <button
                          key={suggestedUser.username}
                          type="button"
                          onClick={() => {
                            setVisibleError(null);
                            setSelectedRecipient(suggestedUser);
                            setUserQuery("");
                            setUserSuggestions([]);
                          }}
                          className="problem-challenge-user-suggestion"
                        >
                          <UserAvatar
                            user={{ ...suggestedUser, displayName: suggestedUser.name }}
                            size="sm"
                          />
                          <span>
                            <strong>{suggestedUser.name}</strong>
                            <small>@{suggestedUser.username}</small>
                          </span>
                        </button>
                      ))}
                      {!searchingUsers && userSuggestions.length === 0 && <p>{labels.noUsersFound}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                {!fixedProblem && (
                  <button
                    type="button"
                    className="icon-button secondary"
                    onClick={() => setSelectedProblem(null)}
                    title={labels.close}
                    aria-label={labels.close}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
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
            <ChallengeSubmitButton
              labels={labels}
              disabled={!selectedProblem || !activeRecipient}
              intent={intent}
            />
          </footer>
        </form>
      </dialog>
    </>
  );
});
