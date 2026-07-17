"use client";

import { useRef } from "react";

type ContributionRequestDialogProps = {
  action: (formData: FormData) => void;
  buttonClassName?: string;
  buttonLabel: string;
  description: string;
  placeholder: string;
  title: string;
};

export function ContributionRequestDialog({
  action,
  buttonClassName = "",
  buttonLabel,
  description,
  placeholder,
  title
}: ContributionRequestDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={`button contribution-request-button ${buttonClassName}`.trim()}
        onClick={() => dialogRef.current?.showModal()}
      >
        {buttonLabel}
      </button>
      <dialog ref={dialogRef} className="contribution-request-dialog">
        <div className="contribution-request-dialog-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <form method="dialog">
            <button type="submit" className="secondary" aria-label="Close request dialog">
              Close
            </button>
          </form>
        </div>
        <form action={action} className="grid gap-3">
          <textarea name="body" required maxLength={4000} minLength={10} placeholder={placeholder} />
          <button type="submit">Send request</button>
        </form>
      </dialog>
    </>
  );
}
