"use client";

import { Trophy } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ContestAchievementBadgeProps = {
  wins: number;
  tooltip: string;
};

export function ContestAchievementBadge({ wins, tooltip }: ContestAchievementBadgeProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const cancelHide = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  const hide = () => { cancelHide(); setOpen(false); setPosition(null); };
  const show = () => { cancelHide(); setOpen(true); };
  const hideSoon = () => { cancelHide(); hideTimer.current = setTimeout(hide, 150); };

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const anchor = triggerRef.current.getBoundingClientRect();
      const box = tooltipRef.current.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(anchor.left, document.documentElement.clientWidth - box.width - 12)),
        top: anchor.bottom + box.height + 6 <= window.innerHeight - 12
          ? anchor.bottom + 6 : Math.max(12, anchor.top - box.height - 6)
      });
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !tooltipRef.current?.contains(event.target)) reposition();
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, tooltip]);

  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setPosition(null); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  if (wins <= 0) return null;
  return (
    <>
      <span ref={triggerRef}
        className={`avatar-achievement-badge avatar-achievement-badge-winner${wins > 1 ? " avatar-achievement-badge-multiple" : ""}`}
        role="img" aria-label={tooltip} tabIndex={0}
        onPointerEnter={event => { if (event.pointerType !== "touch") show(); }} onPointerLeave={hideSoon}
        onFocus={show} onBlur={hideSoon}
        onKeyDown={event => {
          const box = tooltipRef.current;
          if (!box) return;
          const delta = { ArrowDown: 40, ArrowUp: -40, PageDown: box.clientHeight, PageUp: -box.clientHeight }[event.key];
          if (delta !== undefined) { event.preventDefault(); box.scrollBy(0, delta); }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault(); box.scrollTo(0, event.key === "Home" ? 0 : box.scrollHeight);
          }
        }}
      >
        <Trophy size={10} strokeWidth={2.4} aria-hidden="true" />
        {wins > 1 && <span className="avatar-achievement-count" aria-hidden="true">{wins > 99 ? "99+" : wins}</span>}
      </span>
      {open && createPortal(
        <span ref={tooltipRef} className="avatar-achievement-tooltip" role="tooltip"
          style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
          onPointerEnter={cancelHide} onPointerLeave={hideSoon} onClick={event => event.stopPropagation()}
        >{tooltip}</span>, document.body
      )}
    </>
  );
}
