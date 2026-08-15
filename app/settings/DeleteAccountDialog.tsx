"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

type DeleteAccountDialogProps = {
  accountName: string;
  action: (formData: FormData) => void | Promise<void>;
  labels: {
    cancel: string;
    close: string;
    confirm: string;
    description: string;
    title: string;
  };
};

export function DeleteAccountDialog({ accountName, action, labels }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const matchesAccountName = confirmation === accountName;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setConfirmation("");
  }

  return (
    <>
      <button type="button" className="danger" onClick={() => setOpen(true)}>
        {labels.title}
      </button>

      {open && (
        <div className="account-delete-modal" role="presentation" onMouseDown={closeDialog}>
          <div
            className="account-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="account-delete-close" aria-label={labels.close} onClick={closeDialog}>
              <X aria-hidden="true" size={16} />
            </button>
            <h2 id="account-delete-title">{labels.title}</h2>
            <p>{labels.description}</p>
            <form action={action} className="account-delete-form">
              <label className="grid gap-2 text-sm">
                <span>
                  {labels.confirm}
                </span>
                <input
                  name="accountName"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <div className="account-delete-actions">
                <button type="button" className="secondary" onClick={closeDialog}>
                  {labels.cancel}
                </button>
                <button type="submit" className="danger" disabled={!matchesAccountName}>
                  {labels.title}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
