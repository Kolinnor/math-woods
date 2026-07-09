"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendFriendRequestByUsernameFormAction } from "@/lib/actions/social-actions";

const initialState = {
  ok: false,
  message: null as string | null
};

function AddFriendSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Sending..." : "Add friend"}
    </button>
  );
}

export function AddFriendForm() {
  const [state, formAction] = useActionState(sendFriendRequestByUsernameFormAction, initialState);

  return (
    <form action={formAction} className="friend-add-form">
      <input name="username" placeholder="username" required />
      <AddFriendSubmitButton />
      {state.message && (
        <p className={state.ok ? "friend-form-message friend-form-success" : "friend-form-message friend-form-error"} role="status" aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
