"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const NAVIGATION_FEEDBACK_TIMEOUT_MS = 12_000;

function navigatesInCurrentTab(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("aria-disabled") === "true" ||
    anchor.dataset.noNavigationFeedback === "true"
  ) {
    return false;
  }

  const target = anchor.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return false;

  try {
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return false;
    if (destination.protocol !== "http:" && destination.protocol !== "https:") return false;

    const current = new URL(window.location.href);
    return destination.pathname !== current.pathname || destination.search !== current.search;
  } catch {
    return false;
  }
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFeedback = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    activeLinkRef.current?.removeAttribute("data-navigation-feedback-active");
    activeLinkRef.current = null;
    delete document.documentElement.dataset.navigationPending;
    document.querySelector("main.site-main")?.removeAttribute("aria-busy");
  }, []);

  const startFeedback = useCallback((anchor: HTMLAnchorElement) => {
    stopFeedback();
    activeLinkRef.current = anchor;
    anchor.dataset.navigationFeedbackActive = "true";
    document.documentElement.dataset.navigationPending = "true";
    document.querySelector("main.site-main")?.setAttribute("aria-busy", "true");
    timeoutRef.current = setTimeout(stopFeedback, NAVIGATION_FEEDBACK_TIMEOUT_MS);
  }, [stopFeedback]);

  useEffect(() => {
    stopFeedback();
  }, [pathname, searchParams, stopFeedback]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !navigatesInCurrentTab(anchor, event)) return;
      startFeedback(anchor);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", stopFeedback);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", stopFeedback);
      stopFeedback();
    };
  }, [startFeedback, stopFeedback]);

  return <span className="navigation-progress" aria-hidden="true" />;
}
