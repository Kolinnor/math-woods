"use client";

import { Trash2 } from "lucide-react";

type DeleteTipButtonProps = {
  title: string;
};

export function DeleteTipButton({ title }: DeleteTipButtonProps) {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(event) => {
        const confirmed = window.confirm(`Delete "${title}"?\n\nThis removes the tip and its selected practice problems.`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <Trash2 aria-hidden="true" size={16} />
      Delete tip
    </button>
  );
}
