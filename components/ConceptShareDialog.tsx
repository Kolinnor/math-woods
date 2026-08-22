"use client";

import { Search, Send, X } from "lucide-react";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MarkdownInline } from "@/components/MarkdownInline";
import { UserAvatar } from "@/components/UserAvatar";
import {
  createConceptShareAction,
  type ConceptShareActionState
} from "@/lib/actions/concept-share-actions";
import { CONCEPT_SHARE_MESSAGE_MAX_LENGTH } from "@/lib/concept-shares";
import type { Dictionary } from "@/lib/i18n/types";

export type ConceptShareConcept = {
  domainLabel: string;
  slug: string;
  title: string;
  titleHtml: string;
};

type SuggestedUser = {
  avatarBackground: string | null;
  avatarUrl: string | null;
  name: string;
  profileSlug: string;
};

type ConceptShareDialogProps = {
  concept: ConceptShareConcept;
  labels: Dictionary["social"]["conceptShare"];
};

export type ConceptShareDialogHandle = { open: () => void };

const initialState: ConceptShareActionState = { error: null, ok: false };

function ShareSubmitButton({
  disabled,
  labels
}: {
  disabled: boolean;
  labels: Dictionary["social"]["conceptShare"];
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending}>
      <Send size={17} aria-hidden="true" />
      {pending ? labels.sending : labels.send}
    </button>
  );
}

export const ConceptShareDialog = forwardRef<ConceptShareDialogHandle, ConceptShareDialogProps>(
function ConceptShareDialog({ concept, labels }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createConceptShareAction.bind(null, concept.slug),
    initialState
  );
  const [userQuery, setUserQuery] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<SuggestedUser[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<SuggestedUser | null>(null);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [visibleError, setVisibleError] = useState<ConceptShareActionState["error"]>(null);

  useImperativeHandle(ref, () => ({
    open() {
      setVisibleError(null);
      dialogRef.current?.showModal();
    }
  }), []);

  useEffect(() => {
    setVisibleError(state.error);
    if (!state.ok) return;
    formRef.current?.reset();
    setUserQuery("");
    setUserSuggestions([]);
    setSelectedRecipient(null);
    dialogRef.current?.close();
  }, [state]);

  useEffect(() => {
    const trimmed = userQuery.trim();
    if (selectedRecipient || trimmed.length < 2) {
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
  }, [selectedRecipient, userQuery]);

  return (
    <dialog ref={dialogRef} className="problem-challenge-dialog">
      <header className="problem-challenge-header">
        <div className="problem-challenge-mark" aria-hidden="true"><Send size={27} /></div>
        <h2>{selectedRecipient
          ? labels.shareUser.replace("{name}", selectedRecipient.name)
          : labels.shareSomeone}</h2>
        <button
          type="button"
          className="icon-button secondary"
          onClick={() => dialogRef.current?.close()}
          title={labels.close}
          aria-label={labels.close}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <form ref={formRef} action={formAction} className="problem-challenge-form">
        <input type="hidden" name="recipientProfileSlug" value={selectedRecipient?.profileSlug ?? ""} />

        <div className="problem-challenge-recipient-field">
          <span className="text-sm font-medium">{labels.recipient}</span>
          {selectedRecipient ? (
            <div className="problem-challenge-selected">
              <div className="problem-challenge-selected-person">
                <UserAvatar
                  user={{
                    avatarBackground: selectedRecipient.avatarBackground,
                    avatarUrl: selectedRecipient.avatarUrl,
                    username: selectedRecipient.profileSlug,
                    displayName: selectedRecipient.name
                  }}
                  size="sm"
                />
                <div>
                  <strong>{selectedRecipient.name}</strong>
                  <span>@{selectedRecipient.profileSlug}</span>
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
                      key={suggestedUser.profileSlug}
                      type="button"
                      className="problem-challenge-user-suggestion"
                      onClick={() => {
                        setVisibleError(null);
                        setSelectedRecipient(suggestedUser);
                        setUserQuery("");
                        setUserSuggestions([]);
                      }}
                    >
                      <UserAvatar
                        user={{
                          avatarBackground: suggestedUser.avatarBackground,
                          avatarUrl: suggestedUser.avatarUrl,
                          username: suggestedUser.profileSlug,
                          displayName: suggestedUser.name
                        }}
                        size="sm"
                      />
                      <span><strong>{suggestedUser.name}</strong><small>@{suggestedUser.profileSlug}</small></span>
                    </button>
                  ))}
                  {!searchingUsers && userSuggestions.length === 0 && <p>{labels.noUsersFound}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="problem-challenge-problem-field">
          <span className="text-sm font-medium">{labels.concept}</span>
          <div className="problem-challenge-selected">
            <div>
              <strong><MarkdownInline html={concept.titleHtml} /></strong>
              <span>{concept.domainLabel}</span>
            </div>
          </div>
        </div>

        <textarea
          name="message"
          maxLength={CONCEPT_SHARE_MESSAGE_MAX_LENGTH}
          placeholder={labels.messagePlaceholder}
          aria-label={labels.messagePlaceholder}
        />

        {visibleError && <p className="form-error" role="alert">{labels.errors[visibleError]}</p>}

        <footer>
          <button type="button" className="secondary" onClick={() => dialogRef.current?.close()}>{labels.cancel}</button>
          <ShareSubmitButton disabled={!selectedRecipient} labels={labels} />
        </footer>
      </form>
    </dialog>
  );
});
