"use client";

import { Trash2 } from "lucide-react";

type DeleteConceptButtonProps = {
  title: string;
};

export function DeleteConceptButton({ title }: DeleteConceptButtonProps) {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete "${title}"?\n\nThis permanently removes the concept page. Incoming concept links will become missing links.`
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <Trash2 aria-hidden="true" size={16} />
      Delete concept
    </button>
  );
}
