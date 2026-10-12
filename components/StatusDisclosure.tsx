"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Keep status explanations and their actions out of the reading flow. */
export function StatusDisclosure({ badge, label, closeLabel, children }: {
  badge: ReactNode;
  label: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const { width, height } = panel.current.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - height - 12))
      });
    };
    place();
    panel.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="content-status-trigger" aria-label={label}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      {badge}
    </button>
    {open && createPortal(<div ref={panel} id={id} role="region" aria-label={label} tabIndex={-1}
      className="content-status-panel" style={position}>
      <button type="button" className="content-status-close" aria-label={closeLabel}
        onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16} aria-hidden="true" /></button>
      {children}
    </div>, document.body)}
  </>;
}
