"use client";

import { Settings } from "lucide-react";

export function ExplorationSettingsButton({ dialogId }: { dialogId: string }) {
  return (
    <button
      aria-controls={dialogId}
      aria-haspopup="dialog"
      className="secondary"
      onClick={() => (document.getElementById(dialogId) as HTMLDialogElement | null)?.showModal()}
      type="button"
    >
      <Settings size={16} /> Exploration settings
    </button>
  );
}
