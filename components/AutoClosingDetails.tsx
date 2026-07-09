"use client";

import { useEffect, useRef, type ReactNode } from "react";

type AutoClosingDetailsProps = {
  children: ReactNode;
  className?: string;
};

export function AutoClosingDetails({ children, className }: AutoClosingDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function closeDetails() {
      const details = detailsRef.current;
      if (details?.open) details.open = false;
    }

    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open) return;
      const target = event.target;
      if (target instanceof Node && details.contains(target)) return;
      closeDetails();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeDetails();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      {children}
    </details>
  );
}
