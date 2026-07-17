"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  message,
  className,
  title
}: {
  children: ReactNode;
  message: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
