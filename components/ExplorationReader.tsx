"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, ExternalLink, Flag, Pencil, RotateCcw } from "lucide-react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownInline } from "@/components/MarkdownInline";
import {
  saveExplorationBlockProgressAction,
  submitExplorationResponseAction
} from "@/lib/actions/exploration-actions";
import { asExplorationState, type ExplorationState } from "@/lib/exploration-engine";
import { canAutomaticallyAdvance, explorationPathAfter } from "@/lib/exploration-block-graph";

export type ExplorationReaderBlock = {
  id: number;
  pageKey: string;
  key: string;
  kind: string;
  title: string | null;
  bodyHtml: string | null;
  explanationHtml: string | null;
  required: boolean;
  points: number;
  isStart: boolean;
  isEnd: boolean;
  continueToBlockId: number | null;
  autoContinue: boolean;
  problem: { slug: string; titleHtml: string; difficulty: number | null } | null;
  concept: { slug: string; title: string } | null;
  options: Array<{ id: number; label: string; toBlockId: number | null }>;
  outcomes: Array<{ id: number; label: string; toBlockId: number | null }>;
};

type InitialAnswer = { blockKey: string; response: unknown; isCorrect: boolean | null };
type ResponseResult = {
  isCorrect: boolean | null;
  feedbackHtml: string | null;
  feedbackItems: Array<{
    optionId: number;
    label: string;
    expectedSelected: boolean;
    feedbackHtml: string | null;
  }>;
  nextBlockId: number | null;
};
type StoredProgress = { blockId?: number; path?: number[]; state?: ExplorationState; visited?: string[] };

function storageKey(playlistId: number) {
  return `math-woods:exploration-blocks:${playlistId}`;
}

function stableKey(block: ExplorationReaderBlock) {
  return `${block.pageKey}:${block.key}`;
}

function validPath(blocks: ExplorationReaderBlock[], requested: number[], fallbackId: number) {
  const ids = new Set(blocks.map((block) => block.id));
  const path = requested.filter((id) => Number.isInteger(id) && ids.has(id)).slice(-2000);
  return path.length ? path : [fallbackId];
}

export function ExplorationReader({
  playlistId,
  slug,
  blocks,
  initialBlockId,
  initialPathBlockIds,
  initialState,
  initialVisitedBlockKeys,
  initialAnswers,
  signedIn,
  canEdit = false
}: {
  playlistId: number;
  slug: string;
  blocks: ExplorationReaderBlock[];
  initialBlockId: number;
  initialPathBlockIds: number[];
  initialState: ExplorationState;
  initialVisitedBlockKeys: string[];
  initialAnswers: InitialAnswer[];
  signedIn: boolean;
  canEdit?: boolean;
}) {
  const [state, setState] = useState(() => asExplorationState(initialState));
  const [path, setPath] = useState(() => validPath(blocks, initialPathBlockIds, initialBlockId));
  const [visited, setVisited] = useState(() => new Set(initialVisitedBlockKeys));
  const [responses, setResponses] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.blockKey, answer.response as string | string[]]))
  );
  const [results, setResults] = useState<Record<string, ResponseResult>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.blockKey, {
      isCorrect: answer.isCorrect,
      feedbackHtml: null,
      feedbackItems: [],
      nextBlockId: null
    }]))
  );
  const [guestProgressLoaded, setGuestProgressLoaded] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const currentBlock = blockById.get(path.at(-1) ?? initialBlockId) ?? blocks[0];

  function pathKeys(blockIds: number[]) {
    return blockIds.flatMap((id) => blockById.get(id)?.key ?? []);
  }

  function scrollToLatest(blockId: number) {
    window.setTimeout(() => {
      const matches = document.querySelectorAll<HTMLElement>(`[data-exploration-block-id="${blockId}"]`);
      matches.item(matches.length - 1)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function persist(block: ExplorationReaderBlock, nextState: ExplorationState, completed = false, nextPath = path) {
    if (!signedIn) return;
    startTransition(() => {
      void saveExplorationBlockProgressAction(
        playlistId,
        block.key,
        nextState,
        completed,
        pathKeys(nextPath)
      ).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Progress could not be saved.");
      });
    });
  }

  function revealAfter(pathIndex: number, blockId: number, nextState = state, saveProgress = true) {
    const target = blockById.get(blockId);
    if (!target) return;
    const progressingState = nextState.explorationCompleted === true
      ? { ...nextState, explorationCompleted: false }
      : nextState;
    const nextPath = explorationPathAfter(path, pathIndex, target.id);
    setState(progressingState);
    setPath(nextPath);
    setVisited((items) => new Set([...items, target.key]));
    window.history.replaceState(null, "", `/explorations/${slug}/start?block=${target.key}`);
    if (saveProgress) persist(target, progressingState, false, nextPath);
    scrollToLatest(target.id);
  }

  function truncateAfter(pathIndex: number) {
    const nextPath = path.slice(0, pathIndex + 1);
    const target = blockById.get(nextPath.at(-1) ?? 0);
    setPath(nextPath);
    if (target) window.history.replaceState(null, "", `/explorations/${slug}/start?block=${target.key}`);
  }

  useEffect(() => {
    if (signedIn) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(playlistId)) ?? "null") as StoredProgress | null;
      if (!saved) return;
      if (saved.state) setState(asExplorationState(saved.state));
      const restoredPath = validPath(blocks, saved.path ?? (saved.blockId ? [saved.blockId] : []), initialBlockId);
      setPath(restoredPath);
      if (saved.visited) setVisited(new Set(saved.visited));
    } catch {
      localStorage.removeItem(storageKey(playlistId));
    } finally {
      setGuestProgressLoaded(true);
    }
  }, [blocks, initialBlockId, playlistId, signedIn]);

  useEffect(() => {
    if (signedIn || !guestProgressLoaded) return;
    localStorage.setItem(storageKey(playlistId), JSON.stringify({
      blockId: path.at(-1),
      path,
      state,
      visited: [...visited]
    } satisfies StoredProgress));
  }, [guestProgressLoaded, path, playlistId, signedIn, state, visited]);

  useEffect(() => {
    if (!currentBlock || isPending || !currentBlock.autoContinue || !currentBlock.continueToBlockId) return;
    if (currentBlock.kind === "CHOICE" || currentBlock.kind === "QUIZ") return;
    if (!canAutomaticallyAdvance(path, currentBlock.continueToBlockId)) {
      setError("Automatic progression stopped to avoid a loop.");
      return;
    }
    const timer = window.setTimeout(() => {
      revealAfter(path.length - 1, currentBlock.continueToBlockId!);
    }, 120);
    return () => window.clearTimeout(timer);
  // The path itself is the progression trigger; revealAfter intentionally uses its latest snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock?.id, currentBlock?.autoContinue, currentBlock?.continueToBlockId, currentBlock?.kind, isPending, path]);

  function goBack() {
    if (path.length <= 1) return;
    const nextPath = path.slice(0, -1);
    const previous = blockById.get(nextPath.at(-1)!);
    if (!previous) return;
    const nextState = state.explorationCompleted === true
      ? { ...state, explorationCompleted: false }
      : state;
    setState(nextState);
    setPath(nextPath);
    window.history.replaceState(null, "", `/explorations/${slug}/start?block=${previous.key}`);
    persist(previous, nextState, false, nextPath);
    scrollToLatest(previous.id);
  }

  function restart() {
    if (!window.confirm("Restart this exploration? Your current progress and answers will be cleared.")) return;
    const first = blocks.find((block) => block.isStart) ?? blocks[0];
    if (!first) return;
    const emptyState: ExplorationState = {};
    const nextPath = [first.id];
    setState(emptyState);
    setResponses({});
    setResults({});
    setPath(nextPath);
    setVisited(new Set([first.key]));
    localStorage.removeItem(storageKey(playlistId));
    window.history.replaceState(null, "", `/explorations/${slug}/start?block=${first.key}`);
    persist(first, emptyState, false, nextPath);
    scrollToLatest(first.id);
  }

  function setResponse(key: string, value: string | string[]) {
    setResponses((items) => ({ ...items, [key]: value }));
    setResults((items) => {
      if (!(key in items)) return items;
      const next = { ...items };
      delete next[key];
      return next;
    });
  }

  function submitResponse(block: ExplorationReaderBlock, response: string | string[], pathIndex: number) {
    if ((typeof response === "string" && !response.trim()) || (Array.isArray(response) && response.length === 0)) return;
    setError(null);
    startTransition(async () => {
      try {
        const key = stableKey(block);
        const result = await submitExplorationResponseAction(
          playlistId,
          block.pageKey,
          block.key,
          response,
          true,
          state,
          pathKeys(path.slice(0, pathIndex + 1))
        );
        const nextState = asExplorationState(result.state);
        setState(nextState);
        setResponses((items) => ({ ...items, [key]: response }));
        setResults((items) => ({ ...items, [key]: {
          isCorrect: result.isCorrect,
          feedbackHtml: result.feedbackHtml,
          feedbackItems: result.feedbackItems,
          nextBlockId: result.nextBlockId
        } }));
        if (result.nextBlockId && (block.kind === "CHOICE" || (block.autoContinue && result.isCorrect === true))) {
          window.setTimeout(() => revealAfter(pathIndex, result.nextBlockId!, nextState, false), 0);
        } else {
          truncateAfter(pathIndex);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The response could not be checked.");
      }
    });
  }

  if (!currentBlock) return <p className="muted">This exploration has no blocks yet.</p>;

  function renderBlock(block: ExplorationReaderBlock, pathIndex: number) {
    const key = stableKey(block);
    const response = responses[key] ?? (block.kind === "QUIZ" ? [] : "");
    const result = results[key];
    if (block.kind === "PROBLEM" && block.problem) return (
      <section className="exploration-reference-block exploration-problem-block"><div><p className="eyebrow">Problem</p><h2><MarkdownInline html={block.problem.titleHtml} /></h2>{block.problem.difficulty !== null && <span className="muted">Difficulty {block.problem.difficulty}/100</span>}</div>{block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}<Link href={`/problems/${block.problem.slug}`} className="button secondary">Open problem <ExternalLink size={16} /></Link></section>
    );
    if (block.kind === "CONCEPT" && block.concept) return (
      <section className="exploration-reference-block exploration-concept-block"><div><p className="eyebrow">Concept</p><h2>{block.concept.title}</h2></div>{block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}<Link href={`/concepts/${block.concept.slug}`} className="button secondary">Open concept <BookOpen size={16} /></Link></section>
    );
    if (block.kind === "CHOICE") return (
      <section className="exploration-interaction-block">{block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}<div className="exploration-choice-grid">{block.options.map((option) => <button key={option.id} type="button" className={responses[key] === String(option.id) ? "secondary is-selected" : "secondary"} disabled={isPending} onClick={() => submitResponse(block, String(option.id), pathIndex)}>{option.label}<ArrowRight size={16} /></button>)}</div></section>
    );
    if (block.kind === "QUIZ") {
      const selectedIds = Array.isArray(response) ? response : [];
      return (
        <section className="exploration-interaction-block">
          <div className="exploration-interaction-heading"><CircleHelp size={20} /><div><p className="eyebrow">Quiz{block.points ? ` - ${block.points} points` : ""}</p><h2>{block.title || "Check your understanding"}</h2></div></div>
          {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
          <p className="exploration-quiz-instruction">Select every answer that is correct.</p>
          {block.options.length > 0 ? (
            <div className="exploration-quiz-options">
              {block.options.map((option) => {
                const selected = selectedIds.includes(String(option.id));
                return (
                  <label key={option.id} className="exploration-quiz-option">
                    <input
                      className="exploration-quiz-option-input"
                      type="checkbox"
                      name={`quiz-${block.id}-${pathIndex}`}
                      checked={selected}
                      onChange={() => setResponse(
                        key,
                        selected
                          ? selectedIds.filter((id) => id !== String(option.id))
                          : [...selectedIds, String(option.id)]
                      )}
                    />
                    <span className="exploration-quiz-option-label">{option.label}</span>
                  </label>
                );
              })}
            </div>
          ) : <p className="muted">This quiz has no answers yet.</p>}
          <button className="exploration-quiz-submit" type="button" disabled={isPending || selectedIds.length === 0 || block.options.length === 0} onClick={() => submitResponse(block, selectedIds, pathIndex)}>Check answers</button>
          {result && (
            <div className={`exploration-feedback ${result.isCorrect === true ? "is-correct" : "is-incorrect"}`}>
              <strong>{result.isCorrect === true ? "Correct" : "Some answers need another look"}</strong>
              {result.isCorrect === true && result.feedbackHtml && <MarkdownBlock html={result.feedbackHtml} />}
              {result.isCorrect === false && result.feedbackItems.length > 0 && (
                <div className="exploration-quiz-failures">
                  {result.feedbackItems.map((item) => (
                    <section key={item.optionId}>
                      <strong>{item.label}</strong>
                      <p>{item.expectedSelected ? "This answer should have been selected." : "This answer should not have been selected."}</p>
                      {item.feedbackHtml && <MarkdownBlock html={item.feedbackHtml} />}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      );
    }
    return <section className="exploration-prose-block">{block.title && <h2>{block.title}</h2>}{block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}</section>;
  }

  const currentKey = stableKey(currentBlock);
  const currentResult = results[currentKey];
  const hasRoutedChoice = currentBlock.options.some((option) => option.toBlockId !== null);
  const hasRoutedOutcome = currentBlock.outcomes.some((outcome) => outcome.toBlockId !== null);
  const terminal = currentBlock.isEnd || (!currentBlock.continueToBlockId && !hasRoutedChoice && !hasRoutedOutcome);
  const interactiveBlock = currentBlock.kind === "QUIZ" || currentBlock.kind === "CHOICE";
  const canContinue = currentBlock.kind === "QUIZ"
    ? currentResult?.isCorrect === true
    : !interactiveBlock || !currentBlock.required || Boolean(currentResult);
  const nextBlockId = currentResult?.nextBlockId ?? currentBlock.continueToBlockId;

  return (
    <main className="exploration-block-reader">
      {canEdit && (
        <header className="exploration-block-reader-header">
          <Link href={`/explorations/${slug}/edit?view=block&block=${currentBlock.id}`} className="button secondary"><Pencil size={16} /> Edit</Link>
        </header>
      )}
      <div className="exploration-reader-sequence">
        {path.map((blockId, pathIndex) => {
          const block = blockById.get(blockId);
          if (!block) return null;
          return (
            <div
              className={pathIndex === path.length - 1 ? "exploration-reader-step is-current" : "exploration-reader-step"}
              data-exploration-block-id={block.id}
              key={`${block.id}:${pathIndex}`}
            >
              {renderBlock(block, pathIndex)}
            </div>
          );
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {terminal && state.explorationCompleted === true && <section className="exploration-completion-summary"><Flag size={22} /><div><h2>Exploration complete</h2><p>You followed a path through {path.length} blocks.</p></div></section>}
      <footer className="exploration-reader-controls">
        <button type="button" className="secondary" disabled={path.length <= 1 || isPending} onClick={goBack}><ArrowLeft size={17} /> Back</button>
        <button type="button" className="secondary" disabled={isPending} onClick={restart}><RotateCcw size={17} /> Restart</button>
        {terminal
          ? <button type="button" disabled={!canContinue || isPending} onClick={() => { const nextState = { ...state, explorationCompleted: true }; setState(nextState); persist(currentBlock, nextState, true, path); }}><Flag size={17} /> Complete exploration</button>
          : currentBlock.kind !== "CHOICE" && nextBlockId && !currentBlock.autoContinue
            ? <button type="button" disabled={!canContinue || isPending} onClick={() => revealAfter(path.length - 1, nextBlockId)}>Continue <ArrowRight size={17} /></button>
            : null}
      </footer>
    </main>
  );
}
