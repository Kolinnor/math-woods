"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The scrollable row of library sections; on narrow screens the current section is scrolled into view. */
export function LibraryNavTrack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = ref.current;
    const active = track?.querySelector<HTMLElement>("[aria-current='page']");
    if (!track || !active || track.scrollWidth <= track.clientWidth) return;
    // Horizontal only: never move the page itself.
    track.scrollLeft = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
  }, []);
  return <div ref={ref} className="library-nav-sections">{children}</div>;
}
