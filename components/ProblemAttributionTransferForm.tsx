"use client";

import { ArrowRight, Search, UserRoundCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { UserAvatar } from "@/components/UserAvatar";
import { transferProblemAttributionAction } from "@/lib/actions/problem-actions";

type AttributionUser = {
  avatarBackground: string | null;
  avatarUrl: string | null;
  name: string;
  profileSlug: string;
};

type AttributionLabels = {
  title: string;
  help: string;
  currentAuthor: string;
  newAuthor: string;
  searchPlaceholder: string;
  searching: string;
  noUsersFound: string;
  reason: string;
  reasonPlaceholder: string;
  transfer: string;
  transferring: string;
  confirm: string;
};

function TransferButton({ disabled, labels }: { disabled: boolean; labels: AttributionLabels }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="secondary" disabled={disabled || pending}>
      <UserRoundCog size={17} aria-hidden="true" />
      {pending ? labels.transferring : labels.transfer}
    </button>
  );
}

export function ProblemAttributionTransferForm({
  currentAuthor,
  labels,
  problemId
}: {
  currentAuthor: AttributionUser;
  labels: AttributionLabels;
  problemId: number;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AttributionUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AttributionUser | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (selectedUser || trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/users/suggest?q=${encodeURIComponent(trimmed)}&includeSelf=1`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = response.ok ? await response.json() as { users?: AttributionUser[] } : {};
        if (!controller.signal.aborted) {
          setSuggestions((data.users ?? []).filter((user) => user.profileSlug !== currentAuthor.profileSlug));
        }
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
  }, [currentAuthor.profileSlug, query, selectedUser]);

  return (
    <details className="problem-attribution-transfer panel mt-6">
      <summary>
        <UserRoundCog size={18} aria-hidden="true" />
        {labels.title}
      </summary>
      <form
        action={transferProblemAttributionAction.bind(null, problemId)}
        className="grid gap-4 p-5 pt-2"
        onSubmit={(event) => {
          const confirmation = labels.confirm.replace("{name}", selectedUser?.name ?? "");
          if (!selectedUser || !window.confirm(confirmation)) event.preventDefault();
        }}
      >
        <p className="muted text-sm">{labels.help}</p>
        <input type="hidden" name="targetProfileSlug" value={selectedUser?.profileSlug ?? ""} />

        <div className="problem-attribution-users">
          <div>
            <span className="text-sm font-medium">{labels.currentAuthor}</span>
            <AttributionUserCard user={currentAuthor} />
          </div>
          <ArrowRight size={20} aria-hidden="true" />
          <div>
            <span className="text-sm font-medium">{labels.newAuthor}</span>
            {selectedUser ? (
              <div className="problem-challenge-selected">
                <AttributionUserCard user={selectedUser} />
                <button
                  type="button"
                  className="icon-button secondary"
                  onClick={() => setSelectedUser(null)}
                  aria-label={labels.newAuthor}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="problem-challenge-search">
                <Search size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  aria-label={labels.searchPlaceholder}
                  autoComplete="off"
                />
                {(searching || suggestions.length > 0 || query.trim().length >= 2) && (
                  <div className="problem-challenge-suggestions">
                    {searching && <p>{labels.searching}</p>}
                    {!searching && suggestions.map((user) => (
                      <button
                        key={user.profileSlug}
                        type="button"
                        className="problem-challenge-user-suggestion"
                        onClick={() => {
                          setSelectedUser(user);
                          setQuery("");
                          setSuggestions([]);
                        }}
                      >
                        <UserAvatar
                          user={{ ...user, username: user.profileSlug, displayName: user.name }}
                          size="sm"
                        />
                        <span><strong>{user.name}</strong><small>@{user.profileSlug}</small></span>
                      </button>
                    ))}
                    {!searching && suggestions.length === 0 && <p>{labels.noUsersFound}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">{labels.reason}</span>
          <textarea className="compact-textarea" name="reason" placeholder={labels.reasonPlaceholder} />
        </label>
        <div><TransferButton disabled={!selectedUser} labels={labels} /></div>
      </form>
    </details>
  );
}

function AttributionUserCard({ user }: { user: AttributionUser }) {
  return (
    <div className="problem-attribution-user-card">
      <UserAvatar
        user={{ ...user, username: user.profileSlug, displayName: user.name }}
        size="sm"
      />
      <span><strong>{user.name}</strong><small>@{user.profileSlug}</small></span>
    </div>
  );
}
