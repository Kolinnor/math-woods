"use client";

import { ChevronLeft, ChevronRight, EllipsisVertical, EyeOff, Flag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  dismissProblemRecommendationAction,
  setDismissedRecommendationReasonAction,
  undoProblemRecommendationDismissalAction
} from "@/lib/actions/problem-recommendation-actions";
import { problemDifficultyTone } from "@/lib/problem-difficulty";

export type RecommendedProblemItem = {
  id: number;
  slug: string;
  title: string;
  titleHtml: string;
  bodyHtml: string;
  domain: string;
  difficulty: number | null;
  isExercise: boolean;
};

export function RecommendedProblemReader({
  items,
  labels
}: {
  items: RecommendedProblemItem[];
  labels: {
    open: string;
    previous: string;
    next: string;
    menu: string;
    notInterested: string;
    report: string;
    hidden: string;
    undo: string;
    tellUsWhy: string;
    whyTitle: string;
    tooHard: string;
    tooEasy: string;
    alreadyKnown: string;
    notInterestedInDomain: string;
    fewerLikeThis: string;
    thanks: string;
    updateFailed: string;
  };
}) {
  const router = useRouter();
  const [visibleItems, setVisibleItems] = useState(items);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissed, setDismissed] = useState<{ item: RecommendedProblemItem; index: number } | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonSaved, setReasonSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const statementRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = visibleItems[selectedIndex];

  useEffect(() => {
    const element = statementRef.current;
    if (!element) return;
    const check = () => {
      if (element.isConnected) setOverflows(element.scrollHeight > element.clientHeight + 2);
    };
    check();
    void document.fonts?.ready.then(check);
    const observer = new ResizeObserver(check);
    observer.observe(element);
    const images = [...element.querySelectorAll("img")];
    images.forEach((image) => image.addEventListener("load", check));
    return () => {
      observer.disconnect();
      images.forEach((image) => image.removeEventListener("load", check));
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (!selected && !dismissed) return null;

  function cycle(direction: number) {
    setSelectedIndex((current) => (current + direction + visibleItems.length) % visibleItems.length);
    setMenuOpen(false);
  }

  function restoreDismissed(entry: { item: RecommendedProblemItem; index: number }) {
    setVisibleItems((current) => {
      if (current.some((item) => item.id === entry.item.id)) return current;
      const restored = [...current];
      restored.splice(Math.min(entry.index, restored.length), 0, entry.item);
      return restored;
    });
    setSelectedIndex(Math.min(entry.index, visibleItems.length));
  }

  function dismissSelected() {
    if (!selected) return;
    const entry = { item: selected, index: selectedIndex };
    setVisibleItems((current) => current.filter((item) => item.id !== selected.id));
    setSelectedIndex((current) => Math.min(current, Math.max(0, visibleItems.length - 2)));
    setDismissed(entry);
    setMenuOpen(false);
    setReasonOpen(false);
    setReasonSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await dismissProblemRecommendationAction(selected.id);
      } catch {
        restoreDismissed(entry);
        setDismissed(null);
        setError(labels.updateFailed);
      }
    });
  }

  function undoDismissal() {
    if (!dismissed) return;
    const entry = dismissed;
    restoreDismissed(entry);
    setDismissed(null);
    setReasonOpen(false);
    setReasonSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await undoProblemRecommendationDismissalAction(entry.item.id);
      } catch {
        setVisibleItems((current) => current.filter((item) => item.id !== entry.item.id));
        setSelectedIndex(Math.min(entry.index, Math.max(0, visibleItems.length - 1)));
        setDismissed(entry);
        setError(labels.updateFailed);
      }
    });
  }

  function saveReason(
    reason: "TOO_HARD" | "TOO_EASY" | "LESS_LIKE_THIS" | "ALREADY_KNOWN" | "NOT_INTERESTED_IN_DOMAIN"
  ) {
    if (!dismissed) return;
    setError(null);
    startTransition(async () => {
      try {
        await setDismissedRecommendationReasonAction(dismissed.item.id, reason);
        setReasonSaved(true);
        setReasonOpen(false);
      } catch {
        setError(labels.updateFailed);
      }
    });
  }

  return (
    <section className="recommendation-reader">
      <div className="recommendation-reader-list">
        {visibleItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === selectedIndex ? "selected" : undefined}
            onClick={() => setSelectedIndex(index)}
          >
            <span style={{ color: problemDifficultyTone(item.difficulty) }}>
              {item.difficulty ?? "--"}
            </span>
            <span>
              <strong dangerouslySetInnerHTML={{ __html: item.titleHtml }} />
            </span>
          </button>
        ))}
      </div>
      <div className="recommendation-reader-panel">
        {selected ? (
          <>
            <header>
              <div>
                <p>{selected.domain}</p>
                <h3 dangerouslySetInnerHTML={{ __html: selected.titleHtml }} />
              </div>
              {visibleItems.length > 1 && (
                <div className="recommendation-reader-arrows">
                  <button type="button" onClick={() => cycle(-1)} aria-label={labels.previous}>
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" onClick={() => cycle(1)} aria-label={labels.next}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </header>
            <div
              className="recommendation-statement"
              ref={statementRef}
              role="link"
              tabIndex={0}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                router.push(`/problems/${selected.slug}?recommended=1`);
              }}
              onKeyDown={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                if (event.key === "Enter") router.push(`/problems/${selected.slug}?recommended=1`);
              }}
            >
              <div className="prose-math" dangerouslySetInnerHTML={{ __html: selected.bodyHtml }} />
              {overflows && <span className="recommendation-statement-fade" aria-hidden="true" />}
            </div>
          </>
        ) : (
          <div className="recommendation-reader-empty" aria-hidden="true" />
        )}
        {dismissed && (
          <div className="recommendation-dismissal-feedback" role="status">
            <div className="recommendation-dismissal-summary">
              <span>{reasonSaved ? labels.thanks : labels.hidden}</span>
              <button type="button" onClick={undoDismissal} disabled={isPending}>{labels.undo}</button>
              {!reasonSaved && (
                <button type="button" onClick={() => setReasonOpen((open) => !open)} aria-expanded={reasonOpen}>
                  {labels.tellUsWhy}
                </button>
              )}
            </div>
            {reasonOpen && (
              <div className="recommendation-dismissal-reasons">
                <strong>{labels.whyTitle}</strong>
                <button type="button" onClick={() => saveReason("ALREADY_KNOWN")} disabled={isPending}>{labels.alreadyKnown}</button>
                <button type="button" onClick={() => saveReason("NOT_INTERESTED_IN_DOMAIN")} disabled={isPending}>{labels.notInterestedInDomain}</button>
                <button type="button" onClick={() => saveReason("TOO_HARD")} disabled={isPending}>{labels.tooHard}</button>
                <button type="button" onClick={() => saveReason("TOO_EASY")} disabled={isPending}>{labels.tooEasy}</button>
                <button type="button" onClick={() => saveReason("LESS_LIKE_THIS")} disabled={isPending}>{labels.fewerLikeThis}</button>
              </div>
            )}
          </div>
        )}
        {error && <p className="recommendation-reader-error" role="alert">{error}</p>}
        <footer>
          {selected && (
            <Link href={`/problems/${selected.slug}?recommended=1`} className="mw-primary-button">
              {labels.open}
            </Link>
          )}
        </footer>
        {selected && (
          <div className="recommendation-reader-more" ref={menuRef}>
            <button
              type="button"
              className="recommendation-reader-more-trigger"
              aria-label={labels.menu}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={isPending}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <EllipsisVertical size={20} />
            </button>
            {menuOpen && (
              <div className="recommendation-reader-menu" role="menu">
                <button type="button" role="menuitem" onClick={dismissSelected}>
                  <EyeOff size={16} aria-hidden="true" />
                  {labels.notInterested}
                </button>
                <Link href={`/problems/${selected.slug}#report`} role="menuitem">
                  <Flag size={16} aria-hidden="true" />
                  {labels.report}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
