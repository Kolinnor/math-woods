"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendFriendRequestByUsernameFormAction } from "@/lib/actions/social-actions";

const initialState = {
  ok: false,
  message: null as string | null
};

type AddFriendFormLabels = {
  addFriend: string;
  sending: string;
  usernamePlaceholder: string;
};

function AddFriendSubmitButton({ labels }: { labels: AddFriendFormLabels }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? labels.sending : labels.addFriend}
    </button>
  );
}

export function AddFriendForm({ labels }: { labels: AddFriendFormLabels }) {
  const [state, formAction] = useActionState(sendFriendRequestByUsernameFormAction, initialState);

  return (
    <form action={formAction} className="friend-add-form">
      <input name="username" placeholder={labels.usernamePlaceholder} required />
      <AddFriendSubmitButton labels={labels} />
      {state.message && (
        <p className={state.ok ? "friend-form-message friend-form-success" : "friend-form-message friend-form-error"} role="status" aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
