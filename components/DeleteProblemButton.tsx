"use client";

import { Trash2 } from "lucide-react";

type DeleteProblemButtonProps = {
  title: string;
};

export function DeleteProblemButton({ title }: DeleteProblemButtonProps) {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete "${title}"?\n\nThe problem will be archived and removed from public lists.`
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <Trash2 aria-hidden="true" size={16} />
      Delete problem
    </button>
  );
}
