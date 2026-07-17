"use client";

import { Trash2 } from "lucide-react";

type DeletePlaylistButtonProps = {
  title: string;
};

export function DeletePlaylistButton({ title }: DeletePlaylistButtonProps) {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete "${title}"?\n\nThis removes the exploration, its circuit, and its ordering. The problems themselves will not be deleted.`
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <Trash2 aria-hidden="true" size={16} />
      Delete exploration
    </button>
  );
}
