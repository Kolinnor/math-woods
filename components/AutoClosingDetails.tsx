"use client";

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent
} from "react";

type AutoClosingDetailsProps = {
  children: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
};

export function AutoClosingDetails({ children, className, onOpenChange }: AutoClosingDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  function closeDetails() {
    const details = detailsRef.current;
    if (details?.open) details.open = false;
  }

  function handleClick(event: ReactMouseEvent<HTMLDetailsElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-close-details]")) {
      closeDetails();
    }
  }

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    onOpenChange?.(event.currentTarget.open);
  }

  useEffect(() => {
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
    <details ref={detailsRef} className={className} onClick={handleClick} onToggle={handleToggle}>
      {children}
    </details>
  );
}
