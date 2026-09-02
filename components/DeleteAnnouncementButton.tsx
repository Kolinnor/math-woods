"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteAnnouncementAction } from "@/lib/actions/announcement-actions";

type DeleteAnnouncementButtonProps = {
  announcementId: number;
  labels: {
    delete: string;
    confirmMessage: string;
    yes: string;
    no: string;
  };
};

export function DeleteAnnouncementButton({ announcementId, labels }: DeleteAnnouncementButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="icon-button danger announcement-delete-button"
        aria-label={labels.delete}
        title={labels.delete}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="announcement-delete-confirm" role="alertdialog" aria-label={labels.confirmMessage}>
      <button
        type="button"
        className="announcement-delete-confirm-close"
        aria-label={labels.no}
        title={labels.no}
        onClick={() => setConfirming(false)}
      >
        <X size={14} aria-hidden="true" />
      </button>
      <p>{labels.confirmMessage}</p>
      <div className="announcement-delete-confirm-actions">
        <form action={deleteAnnouncementAction.bind(null, announcementId)}>
          <button type="submit" className="danger">{labels.yes}</button>
        </form>
        <button type="button" onClick={() => setConfirming(false)}>{labels.no}</button>
      </div>
    </div>
  );
}
