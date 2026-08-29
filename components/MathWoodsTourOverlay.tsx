"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MATH_WOODS_TOUR_LOCALE_PARAM,
  MATH_WOODS_TOUR_PARAM,
  MATH_WOODS_TOUR_STEP_PARAM,
  mathWoodsTourCopy,
  parseMathWoodsTourLocale,
  parseMathWoodsTourStep,
  type MathWoodsTourLocale,
  type MathWoodsTourTarget
} from "@/lib/math-woods-tour";

function visibleTarget(target: MathWoodsTourTarget) {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour-target="${target}"]`)].find((element) => {
    const closedDetails = element.closest("details:not([open])");
    if (closedDetails && element.closest("summary") === null) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

function tourHref(path: string, step: number, locale: MathWoodsTourLocale) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(MATH_WOODS_TOUR_PARAM, "1");
  url.searchParams.set(MATH_WOODS_TOUR_STEP_PARAM, String(step));
  url.searchParams.set(MATH_WOODS_TOUR_LOCALE_PARAM, locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

function withoutTourParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete(MATH_WOODS_TOUR_PARAM);
  url.searchParams.delete(MATH_WOODS_TOUR_STEP_PARAM);
  url.searchParams.delete(MATH_WOODS_TOUR_LOCALE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function MathWoodsTourOverlay({ initialLocale }: { initialLocale: MathWoodsTourLocale }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLocale = searchParams.get(MATH_WOODS_TOUR_LOCALE_PARAM);
  const locale = requestedLocale ? parseMathWoodsTourLocale(requestedLocale) : initialLocale;
  const text = mathWoodsTourCopy[locale];
  const requestedStep = parseMathWoodsTourStep(searchParams.get(MATH_WOODS_TOUR_STEP_PARAM), text.steps.length);
  const [stepIndex, setStepIndex] = useState(requestedStep);
  const [targetMissing, setTargetMissing] = useState(false);
  const [spotlight, setSpotlight] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const active = searchParams.get(MATH_WOODS_TOUR_PARAM) === "1" && pathname !== "/about/tutorial";
  const step = text.steps[stepIndex];

  useEffect(() => setStepIndex(requestedStep), [requestedStep]);

  const replaceStep = useCallback((nextStep: number) => {
    const boundedStep = Math.min(Math.max(nextStep, 0), text.steps.length - 1);
    setStepIndex(boundedStep);
    const url = new URL(window.location.href);
    url.searchParams.set(MATH_WOODS_TOUR_STEP_PARAM, String(boundedStep));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [text.steps.length]);

  const close = useCallback(() => {
    router.push(withoutTourParams() as never);
  }, [router]);

  const navigate = useCallback((path: string, nextStep: number) => {
    router.push(tourHref(path, nextStep, locale) as never, { scroll: true });
  }, [locale, router]);

  useEffect(() => {
    if (!active) return;
    document.body.classList.add("math-woods-tour-running");
    return () => document.body.classList.remove("math-woods-tour-running");
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")];
      if (!focusable.length) return;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
      } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, close]);

  useEffect(() => {
    if (!active) return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [active, stepIndex]);

  useEffect(() => {
    if (!active || !step.target) {
      setTargetMissing(false);
      return;
    }

    let target: HTMLElement | null = null;
    let parents: HTMLElement[] = [];
    let missingTimer = 0;
    let resizeTimer = 0;
    let scrollTimer = 0;

    const cleanupTarget = () => {
      target?.classList.remove("math-tour-live-target", "math-tour-live-target-interactive");
      parents.forEach((parent) => parent.classList.remove("math-tour-live-parent-active"));
      parents = [];
    };

    const updateSpotlight = () => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const margin = 9;
      setSpotlight({
        top: Math.max(0, rect.top - margin),
        right: Math.min(window.innerWidth, rect.right + margin),
        bottom: Math.min(window.innerHeight, rect.bottom + margin),
        left: Math.max(0, rect.left - margin)
      });
    };

    const activateTarget = () => {
      cleanupTarget();
      target = visibleTarget(step.target!);
      if (!target) return false;
      setTargetMissing(false);
      target.classList.add("math-tour-live-target");
      updateSpotlight();
      if (step.action === "open-problems" || step.action === "open-problem") {
        target.classList.add("math-tour-live-target-interactive");
      }
      parents = [
        target.closest<HTMLElement>(".site-header"),
        target.closest<HTMLElement>(".floating-friends-menu"),
        target.closest<HTMLElement>(".nav-menu")
      ].filter((parent): parent is HTMLElement => Boolean(parent));
      parents.forEach((parent) => parent.classList.add("math-tour-live-parent-active"));
      scrollTimer = window.setTimeout(() => {
        target?.scrollIntoView({
          behavior: "smooth",
          block: step.target?.startsWith("nav-") || step.target === "menu" ? "nearest" : "center"
        });
      }, 100);
      return true;
    };

    if (!activateTarget()) {
      missingTimer = window.setTimeout(() => setTargetMissing(true), 1200);
    }
    const observer = new MutationObserver(() => {
      if (target?.isConnected || !activateTarget()) return;
      window.clearTimeout(missingTimer);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!activateTarget()) setTargetMissing(true);
      }, 120);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", updateSpotlight, true);

    const handleTargetClick = (event: Event) => {
      if (!target || !target.contains(event.target as Node)) return;
      if (step.action !== "open-problems" && step.action !== "open-problem") return;
      event.preventDefault();
      event.stopPropagation();
      if (step.action === "open-problems") {
        navigate("/problems?sort=favorited", stepIndex + 1);
        return;
      }
      const anchor = target.closest<HTMLAnchorElement>("a") ?? target.querySelector<HTMLAnchorElement>("a");
      if (!anchor) return;
      const targetUrl = new URL(anchor.href, window.location.origin);
      const path = `${targetUrl.pathname}${targetUrl.search}`;
      navigate(path, stepIndex + 1);
    };
    document.addEventListener("click", handleTargetClick, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", updateSpotlight, true);
      document.removeEventListener("click", handleTargetClick, true);
      window.clearTimeout(missingTimer);
      window.clearTimeout(resizeTimer);
      window.clearTimeout(scrollTimer);
      cleanupTarget();
      setSpotlight(null);
    };
  }, [active, navigate, step.action, step.target, stepIndex]);

  function previous() {
    if (stepIndex === 0) {
      router.push("/about/tutorial");
      return;
    }
    const previousStep = stepIndex - 1;
    if (stepIndex === 10) {
      navigate("/", previousStep);
      return;
    }
    if (stepIndex === 12) {
      navigate("/problems", previousStep);
      return;
    }
    replaceStep(previousStep);
  }

  function next() {
    replaceStep(stepIndex + 1);
  }

  function performStepAction() {
    if (step.action === "open-problems") {
      navigate("/problems?sort=favorited", stepIndex + 1);
      return;
    }
    if (step.action !== "open-problem" || !step.target) return;
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    const anchor = target?.closest<HTMLAnchorElement>("a") ?? target?.querySelector<HTMLAnchorElement>("a");
    if (!anchor) return;
    const targetUrl = new URL(anchor.href, window.location.origin);
    const path = `${targetUrl.pathname}${targetUrl.search}`;
    navigate(path, stepIndex + 1);
  }

  if (!active) return null;

  return (
    <div className="math-woods-tour-live" aria-live="polite">
      {spotlight ? (
        <>
          <div className="math-tour-shade" style={{ inset: `0 0 auto 0`, height: spotlight.top }} aria-hidden="true" />
          <div className="math-tour-shade" style={{ inset: `${spotlight.bottom}px 0 0 0` }} aria-hidden="true" />
          <div
            className="math-tour-shade"
            style={{ inset: `${spotlight.top}px auto auto 0`, width: spotlight.left, height: spotlight.bottom - spotlight.top }}
            aria-hidden="true"
          />
          <div
            className="math-tour-shade"
            style={{ inset: `${spotlight.top}px 0 auto ${spotlight.right}px`, height: spotlight.bottom - spotlight.top }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="math-tour-shade" aria-hidden="true" />
      )}
      <div
        ref={dialogRef}
        className="math-tour-callout"
        data-placement={step.placement ?? "bottom"}
        role="dialog"
        aria-modal="true"
        aria-label={text.step(stepIndex + 1, text.steps.length)}
        tabIndex={-1}
      >
        <div className="math-tour-callout-header">
          <span>{text.step(stepIndex + 1, text.steps.length)}</span>
          <button type="button" className="math-tour-live-close" onClick={close} aria-label={text.close} title={text.close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p>{step.text}</p>
        {step.details && (
          <ul className="math-tour-callout-details">
            {step.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
        {targetMissing && <p className="math-tour-target-missing">{text.unavailable}</p>}
        <div className="math-tour-callout-actions">
          <button type="button" onClick={previous} className="math-tour-back">
            <ArrowLeft size={16} aria-hidden="true" />{text.previous}
          </button>
          {step.action === "open-problems" || step.action === "open-problem" ? (
            <button type="button" onClick={performStepAction} className="mw-primary-button">
              {text.next}<ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : step.action === "finish" ? (
            <button type="button" onClick={() => router.push("/")} className="mw-primary-button">
              <Check size={16} aria-hidden="true" />{text.finish}
            </button>
          ) : (
            <button type="button" onClick={next} className="mw-primary-button">
              {text.next}<ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
