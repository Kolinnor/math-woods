"use client";

import { useFormStatus } from "react-dom";
import { deleteDirectChatAction } from "@/lib/actions/social-actions";

function SubmitButton({ labels }: { labels: { delete: string; deleting: string } }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary" disabled={pending}>
      {pending ? labels.deleting : labels.delete}
    </button>
  );
}

export function DeleteConversationButton({
  otherUsername,
  labels
}: {
  otherUsername: string;
  labels: { delete: string; deleting: string; confirm: string };
}) {
  return (
    <form
      action={deleteDirectChatAction.bind(null, otherUsername)}
      onSubmit={(event) => {
        if (!window.confirm(labels.confirm)) event.preventDefault();
      }}
    >
      <SubmitButton labels={labels} />
    </form>
  );
}
