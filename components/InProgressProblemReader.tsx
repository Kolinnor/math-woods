"use client";

import { Check, ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DifficultyBandHelp } from "@/components/Difficulty";
import { ParticleBurstZone } from "@/components/ParticleBurstZone";
import { ProblemLikePromptDialog } from "@/components/ProblemLikePromptDialog";
import { displayTypography } from "@/lib/display-typography";
import type { InProgressProblemItem, InProgressProblemPage } from "@/lib/in-progress-problems";
import { problemDifficultyTone } from "@/lib/problem-difficulty";
import { PROBLEM_STATE_CHANGED_EVENT } from "@/lib/problem-state-events";

type Operation = "solve" | "unsolve" | "attempt" | "unattempt" | "favorite";

/** What the user did to a problem from this panel since the page was loaded. */
type Mark = "solved" | "removed";

type Labels = {
  open: string;
  previous: string;
  next: string;
  empty: string;
  like: string;
  unlike: string;
  markSolved: string;
  unmarkSolved: string;
  verifyToSolve: string;
  remove: string;
  restore: string;
  loadingMore: string;
  updateFailed: string;
  likePromptQuestion: string;
  likePromptMessage: string;
  likePromptClose: string;
};

/** Mirrors IN_PROGRESS_PAGE_SIZE without pulling the server module into the client bundle. */
const PAGE_SIZE = 10;

async function persist(problemId: number, operation: Operation) {
  const response = await fetch(`/api/problems/${problemId}/browser-state`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation })
  });
  if (!response.ok) throw new Error("Problem state update failed.");
  return (await response.json().catch(() => ({}))) as { likePrompt?: boolean };
}

/**
 * The user's problems in progress, laid out like the recommendation reader. The list
 * loads further pages as it scrolls; the panel offers like, solved and remove toggles.
 * A problem marked solved or removed stays listed, with its button pressed, until the
 * page is reloaded, so the action can be reverted by pressing the button again.
 * Solving goes through the same endpoint as the problem list, so an unliked solve
 * counts towards the "Did you enjoy this problem?" invitation.
 */
export function InProgressProblemReader({
  initialPage,
  labels,
  onTotalChange
}: {
  initialPage: InProgressProblemPage;
  labels: Labels;
  onTotalChange?: (total: number) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialPage.items);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [total, setTotal] = useState(initialPage.total);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  // Position of the next page on the server, which shrinks when a problem leaves the list.
  const [serverOffset, setServerOffset] = useState(initialPage.items.length);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(initialPage.items[0]?.translationGroupId ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likePromptItem, setLikePromptItem] = useState<InProgressProblemItem | null>(null);
  const [overflows, setOverflows] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.translationGroupId === selectedGroup));
  const selected = items[selectedIndex] ?? null;
  const selectedMark = selected ? marks[selected.translationGroupId] : undefined;

  useEffect(() => {
    onTotalChange?.(total);
  }, [onTotalChange, total]);

  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  /**
   * Merges a fresh first page from the server. Problems solved or removed elsewhere
   * drop out, but those marked from this panel stay in place until a real reload.
   */
  const applyFreshPage = useCallback((page: InProgressProblemPage) => {
    setItems((current) => {
      const fresh = new Map(page.items.map((item) => [item.translationGroupId, item]));
      const kept: InProgressProblemItem[] = [];
      for (const item of current) {
        const freshItem = fresh.get(item.translationGroupId);
        if (freshItem) {
          kept.push(freshItem);
          fresh.delete(item.translationGroupId);
        } else if (marksRef.current[item.translationGroupId]) {
          kept.push(item);
        }
      }
      // Problems started elsewhere in the meantime are the most recent ones.
      return [...fresh.values(), ...kept];
    });
    setServerOffset(page.items.length);
    setHasMore(page.hasMore);
    setTotal(page.total);
  }, []);

  // A newer server render (e.g. after a revalidation) replaces the client copy.
  useEffect(() => {
    applyFreshPage(initialPage);
  }, [applyFreshPage, initialPage]);

  // Problems solved or removed elsewhere (problem page, list below, another tab) must
  // disappear even when the browser or the router restores a cached copy of this page.
  const refresh = useCallback(async () => {
    if (pendingRef.current) return;
    const limit = Math.min(50, Math.max(PAGE_SIZE, itemCountRef.current));
    try {
      const response = await fetch(`/api/problems/in-progress?offset=0&limit=${limit}`, { cache: "no-store" });
      if (!response.ok || pendingRef.current) return;
      applyFreshPage((await response.json()) as InProgressProblemPage);
    } catch {
      // Keep the current list; the next refresh or reload will catch up.
    }
  }, [applyFreshPage]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    const onStateChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener(PROBLEM_STATE_CHANGED_EVENT, onStateChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(PROBLEM_STATE_CHANGED_EVENT, onStateChanged);
    };
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/problems/in-progress?offset=${serverOffset}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load problems in progress.");
      const page = (await response.json()) as InProgressProblemPage;
      setItems((current) => {
        const known = new Set(current.map((item) => item.translationGroupId));
        return [...current, ...page.items.filter((item) => !known.has(item.translationGroupId))];
      });
      setServerOffset((offset) => offset + page.items.length);
      setHasMore(page.hasMore && page.items.length > 0);
      setTotal(page.total);
    } catch {
      setHasMore(false);
      setError(labels.updateFailed);
    } finally {
      setLoading(false);
    }
  }, [hasMore, labels.updateFailed, loading, serverOffset]);

  // Infinite scroll: fetch the next page once the end of the list comes into view.
  useEffect(() => {
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "120px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, items.length, loadMore]);

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
    return () => observer.disconnect();
  }, [selected?.id]);

  function select(index: number) {
    const item = items[index];
    if (!item) return;
    setSelectedGroup(item.translationGroupId);
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-in-progress-item]")
      [index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function cycle(direction: number) {
    if (!items.length) return;
    select((selectedIndex + direction + items.length) % items.length);
  }

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(labels.updateFailed);
    } finally {
      setPending(false);
    }
  }

  function setMark(groupId: string, mark: Mark | undefined) {
    setMarks((current) => {
      const next = { ...current };
      if (mark) next[groupId] = mark;
      else delete next[groupId];
      return next;
    });
  }

  /**
   * Applies a mark change optimistically. Whether the problem is still in progress on
   * the server drives the counter and the offset of the next page to load.
   */
  async function changeMark(item: InProgressProblemItem, next: Mark | undefined, operation: Operation) {
    const groupId = item.translationGroupId;
    const previous = marksRef.current[groupId];
    const delta = (previous ? 1 : 0) - (next ? 1 : 0); // +1 back in progress, -1 out of it
    const apply = (mark: Mark | undefined, change: number) => {
      setMark(groupId, mark);
      setTotal((count) => Math.max(0, count + change));
      setServerOffset((offset) => Math.max(0, offset + change));
    };
    apply(next, delta);
    try {
      return await persist(item.id, operation);
    } catch (failure) {
      apply(previous, -delta);
      throw failure;
    }
  }

  function toggleSolved(item: InProgressProblemItem) {
    const solved = marks[item.translationGroupId] === "solved";
    void run(async () => {
      // "unsolve" puts the problem back in progress.
      const result = await changeMark(item, solved ? undefined : "solved", solved ? "unsolve" : "solve");
      if (!solved && result.likePrompt && !item.favorite) setLikePromptItem(item);
    });
  }

  function toggleRemoved(item: InProgressProblemItem) {
    const removed = marks[item.translationGroupId] === "removed";
    void run(async () => {
      await changeMark(item, removed ? undefined : "removed", removed ? "attempt" : "unattempt");
    });
  }

  function setFavorite(groupId: string, favorite: boolean) {
    setItems((current) =>
      current.map((entry) => (entry.translationGroupId === groupId ? { ...entry, favorite } : entry))
    );
  }

  function toggleLike(item: InProgressProblemItem) {
    const wasFavorite = item.favorite;
    void run(async () => {
      setFavorite(item.translationGroupId, !wasFavorite);
      try {
        await persist(item.id, "favorite");
      } catch (failure) {
        setFavorite(item.translationGroupId, wasFavorite);
        throw failure;
      }
    });
  }

  function likeFromPrompt(item: InProgressProblemItem) {
    setFavorite(item.translationGroupId, true);
    void persist(item.id, "favorite").catch(() => {
      setFavorite(item.translationGroupId, false);
      setError(labels.updateFailed);
    });
  }

  const openHref = selected ? `/problems/${selected.slug}` : null;

  return (
    <section className="recommendation-reader in-progress-reader">
      <div className="recommendation-reader-list in-progress-reader-list" ref={listRef}>
        {items.map((item, index) => {
          const mark = marks[item.translationGroupId];
          return (
            <button
              key={item.translationGroupId}
              type="button"
              data-in-progress-item
              className={[item === selected ? "selected" : "", mark ? `is-${mark}` : ""].filter(Boolean).join(" ") || undefined}
              onClick={() => select(index)}
            >
              <span style={{ color: problemDifficultyTone(item.difficulty) }}>{item.difficulty ?? "--"}</span>
              <span>
                <strong dangerouslySetInnerHTML={{ __html: displayTypography(item.titleHtml) }} />
              </span>
            </button>
          );
        })}
        {hasMore && (
          <div ref={sentinelRef} className="in-progress-reader-sentinel" aria-live="polite">
            {loading ? labels.loadingMore : ""}
          </div>
        )}
      </div>
      <div className="recommendation-reader-panel">
        {selected ? (
          <>
            <header>
              <div>
                <p>
                  {selected.domain}
                  {selected.difficulty !== null && <> · <DifficultyBandHelp value={selected.difficulty} /></>}
                </p>
                <h3 dangerouslySetInnerHTML={{ __html: displayTypography(selected.titleHtml) }} />
              </div>
              {items.length > 1 && (
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
                router.push(openHref as never);
              }}
              onKeyDown={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                if (event.key === "Enter") router.push(openHref as never);
              }}
            >
              <div className="prose-math" dangerouslySetInnerHTML={{ __html: displayTypography(selected.bodyHtml) }} />
              {overflows && <span className="recommendation-statement-fade" aria-hidden="true" />}
            </div>
          </>
        ) : (
          <p className="in-progress-reader-empty">{loading ? "" : labels.empty}</p>
        )}
        {error && <p className="recommendation-reader-error" role="alert">{error}</p>}
        <footer>
          {openHref && (
            <Link href={openHref as never} className="mw-primary-button">
              {labels.open}
            </Link>
          )}
        </footer>
        {selected && (
          <div className="in-progress-reader-actions">
            {!selected.isOwnProblem && (
              <ParticleBurstZone kind="heart" active={!selected.favorite}>
                <button
                  type="button"
                  className={`in-progress-action is-like${selected.favorite ? " is-active" : ""}`}
                  title={selected.favorite ? labels.unlike : labels.like}
                  aria-label={selected.favorite ? labels.unlike : labels.like}
                  aria-pressed={selected.favorite}
                  disabled={pending}
                  onClick={() => toggleLike(selected)}
                >
                  <Heart size={17} fill={selected.favorite ? "currentColor" : "none"} />
                </button>
              </ParticleBurstZone>
            )}
            {!selected.isConjecture && (selected.requiresVerification && selectedMark !== "solved" ? (
              <Link
                href={`/problems/${selected.slug}#problem-verification` as never}
                className="in-progress-action is-solve"
                title={labels.verifyToSolve}
                aria-label={labels.verifyToSolve}
              >
                <Check size={17} strokeWidth={3} />
              </Link>
            ) : (
              <ParticleBurstZone kind="confetti" active={selectedMark !== "solved"}>
                <button
                  type="button"
                  className={`in-progress-action is-solve${selectedMark === "solved" ? " is-active" : ""}`}
                  title={selectedMark === "solved" ? labels.unmarkSolved : labels.markSolved}
                  aria-label={selectedMark === "solved" ? labels.unmarkSolved : labels.markSolved}
                  aria-pressed={selectedMark === "solved"}
                  disabled={pending}
                  onClick={() => toggleSolved(selected)}
                >
                  <Check size={17} strokeWidth={3} />
                </button>
              </ParticleBurstZone>
            ))}
            {/* A solved problem is no longer in progress, so there is nothing left to remove. */}
            {selectedMark !== "solved" && (
              <button
                type="button"
                className={`in-progress-action is-remove${selectedMark === "removed" ? " is-active" : ""}`}
                title={selectedMark === "removed" ? labels.restore : labels.remove}
                aria-label={selectedMark === "removed" ? labels.restore : labels.remove}
                aria-pressed={selectedMark === "removed"}
                disabled={pending}
                onClick={() => toggleRemoved(selected)}
              >
                <X size={17} strokeWidth={2.6} />
              </button>
            )}
          </div>
        )}
      </div>
      {likePromptItem && (
        <ProblemLikePromptDialog
          labels={{
            question: labels.likePromptQuestion,
            message: labels.likePromptMessage,
            like: labels.like,
            close: labels.likePromptClose
          }}
          onClose={() => setLikePromptItem(null)}
          onLike={() => likeFromPrompt(likePromptItem)}
        />
      )}
    </section>
  );
}
