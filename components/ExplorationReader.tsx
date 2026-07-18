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

export type ExplorationReaderBlock = {
  id: number;
  pageKey: string;
  key: string;
  kind: string;
  title: string | null;
  bodyHtml: string | null;
  explanationHtml: string | null;
  quizType: string | null;
  required: boolean;
  points: number;
  isStart: boolean;
  isEnd: boolean;
  continueToBlockId: number | null;
  problem: { slug: string; titleHtml: string; difficulty: number | null } | null;
  concept: { slug: string; title: string } | null;
  options: Array<{ id: number; label: string; toBlockId: number | null }>;
  outcomes: Array<{ id: number; label: string; toBlockId: number | null }>;
};

type InitialAnswer = { blockKey: string; response: unknown; isCorrect: boolean | null };
type ResponseResult = { isCorrect: boolean | null; feedbackHtml: string | null; nextBlockId: number | null };
type StoredProgress = { blockId?: number; state?: ExplorationState; visited?: string[] };

function storageKey(playlistId: number) {
  return `math-woods:exploration-blocks:${playlistId}`;
}

function stableKey(block: ExplorationReaderBlock) {
  return `${block.pageKey}:${block.key}`;
}

export function ExplorationReader({
  playlistId,
  slug,
  blocks,
  initialBlockId,
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
  initialState: ExplorationState;
  initialVisitedBlockKeys: string[];
  initialAnswers: InitialAnswer[];
  signedIn: boolean;
  canEdit?: boolean;
}) {
  const [state, setState] = useState(() => asExplorationState(initialState));
  const [currentBlockId, setCurrentBlockId] = useState(initialBlockId);
  const [visited, setVisited] = useState(() => new Set(initialVisitedBlockKeys));
  const [history, setHistory] = useState<number[]>([]);
  const [responses, setResponses] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.blockKey, answer.response as string | string[]]))
  );
  const [results, setResults] = useState<Record<string, ResponseResult>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.blockKey, { isCorrect: answer.isCorrect, feedbackHtml: null, nextBlockId: null }]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentBlock = blocks.find((block) => block.id === currentBlockId) ?? blocks[0];

  useEffect(() => {
    if (signedIn) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(playlistId)) ?? "null") as StoredProgress | null;
      if (!saved) return;
      if (saved.state) setState(asExplorationState(saved.state));
      if (saved.blockId && blocks.some((block) => block.id === saved.blockId)) setCurrentBlockId(saved.blockId);
      if (saved.visited) setVisited(new Set(saved.visited));
    } catch {
      localStorage.removeItem(storageKey(playlistId));
    }
  }, [blocks, playlistId, signedIn]);

  useEffect(() => {
    if (signedIn) return;
    localStorage.setItem(storageKey(playlistId), JSON.stringify({ blockId: currentBlockId, state, visited: [...visited] } satisfies StoredProgress));
  }, [currentBlockId, playlistId, signedIn, state, visited]);

  function persist(block: ExplorationReaderBlock, nextState: ExplorationState, completed = false) {
    if (!signedIn) return;
    startTransition(() => {
      void saveExplorationBlockProgressAction(playlistId, block.key, nextState, completed).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Progress could not be saved.");
      });
    });
  }

  function goTo(blockId: number, addHistory = true, nextState = state) {
    const target = blocks.find((block) => block.id === blockId);
    if (!target || !currentBlock) return;
    if (addHistory) setHistory((items) => [...items, currentBlock.id]);
    setCurrentBlockId(target.id);
    setVisited((items) => new Set([...items, target.key]));
    window.history.replaceState(null, "", `/explorations/${slug}/start?block=${target.key}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    persist(target, nextState);
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    goTo(previous, false);
  }

  function restart() {
    const first = blocks.find((block) => block.isStart) ?? blocks[0];
    if (!first) return;
    const emptyState: ExplorationState = {};
    setState(emptyState);
    setResponses({});
    setResults({});
    setHistory([]);
    setVisited(new Set([first.key]));
    setCurrentBlockId(first.id);
    localStorage.removeItem(storageKey(playlistId));
    persist(first, emptyState);
  }

  function setResponse(key: string, value: string | string[]) {
    setResponses((items) => ({ ...items, [key]: value }));
  }

  function submitResponse(block: ExplorationReaderBlock, response: string | string[]) {
    if ((typeof response === "string" && !response.trim()) || (Array.isArray(response) && response.length === 0)) return;
    setError(null);
    startTransition(async () => {
      try {
        const key = stableKey(block);
        const result = await submitExplorationResponseAction(playlistId, block.pageKey, block.key, response, true, state);
        const nextState = asExplorationState(result.state);
        setState(nextState);
        setResponses((items) => ({ ...items, [key]: response }));
        setResults((items) => ({ ...items, [key]: { isCorrect: result.isCorrect, feedbackHtml: result.feedbackHtml, nextBlockId: result.nextBlockId } }));
        if (block.kind === "CHOICE" && result.nextBlockId) window.setTimeout(() => goTo(result.nextBlockId!, true, nextState), 0);
        else persist(block, nextState);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The response could not be checked.");
      }
    });
  }

  if (!currentBlock) return <p className="muted">This exploration has no blocks yet.</p>;

  const key = stableKey(currentBlock);
  const response = responses[key] ?? (currentBlock.quizType === "MULTIPLE_CHOICE" ? [] : "");
  const result = results[key];
  const hasRoutedChoice = currentBlock.options.some((option) => option.toBlockId !== null);
  const hasRoutedOutcome = currentBlock.outcomes.some((outcome) => outcome.toBlockId !== null);
  const terminal = currentBlock.isEnd || (!currentBlock.continueToBlockId && !hasRoutedChoice && !hasRoutedOutcome);
  const canContinue = !currentBlock.required || Boolean(result);

  function renderBlock() {
    if (currentBlock.kind === "PROBLEM" && currentBlock.problem) return (
      <section className="exploration-reference-block exploration-problem-block"><div><p className="eyebrow">Problem</p><h2><MarkdownInline html={currentBlock.problem.titleHtml} /></h2>{currentBlock.problem.difficulty !== null && <span className="muted">Difficulty {currentBlock.problem.difficulty}/100</span>}</div>{currentBlock.bodyHtml && <MarkdownBlock html={currentBlock.bodyHtml} />}<Link href={`/problems/${currentBlock.problem.slug}`} className="button secondary">Open problem <ExternalLink size={16} /></Link></section>
    );
    if (currentBlock.kind === "CONCEPT" && currentBlock.concept) return (
      <section className="exploration-reference-block exploration-concept-block"><div><p className="eyebrow">Concept</p><h2>{currentBlock.concept.title}</h2></div>{currentBlock.bodyHtml && <MarkdownBlock html={currentBlock.bodyHtml} />}<Link href={`/concepts/${currentBlock.concept.slug}`} className="button secondary">Open concept <BookOpen size={16} /></Link></section>
    );
    if (currentBlock.kind === "CHOICE") return (
      <section className="exploration-interaction-block">{currentBlock.bodyHtml && <MarkdownBlock html={currentBlock.bodyHtml} />}<div className="exploration-choice-grid">{currentBlock.options.map((option) => <button key={option.id} type="button" className={responses[key] === String(option.id) ? "secondary is-selected" : "secondary"} disabled={isPending} onClick={() => submitResponse(currentBlock, String(option.id))}>{option.label}<ArrowRight size={16} /></button>)}</div></section>
    );
    if (currentBlock.kind === "QUIZ") {
      const multiple = currentBlock.quizType === "MULTIPLE_CHOICE";
      const textEntry = currentBlock.quizType === "SHORT_TEXT" || currentBlock.quizType === "NUMBER";
      return (
        <section className="exploration-interaction-block">
          <div className="exploration-interaction-heading"><CircleHelp size={20} /><div><p className="eyebrow">Quiz{currentBlock.points ? ` · ${currentBlock.points} points` : ""}</p><h2>{currentBlock.title || "Check your understanding"}</h2></div></div>
          {currentBlock.bodyHtml && <MarkdownBlock html={currentBlock.bodyHtml} />}
          {textEntry ? <label className="grid gap-2"><span>Your answer</span><input inputMode={currentBlock.quizType === "NUMBER" ? "decimal" : undefined} value={typeof response === "string" ? response : ""} onChange={(event) => setResponse(key, event.target.value)} /></label> : <div className="exploration-quiz-options">{currentBlock.options.map((option) => { const selected = multiple ? Array.isArray(response) && response.includes(String(option.id)) : response === String(option.id); return <label key={option.id}><input type={multiple ? "checkbox" : "radio"} name={`quiz-${currentBlock.id}`} checked={selected} onChange={() => { if (multiple) { const values = Array.isArray(response) ? response : []; setResponse(key, selected ? values.filter((id) => id !== String(option.id)) : [...values, String(option.id)]); } else setResponse(key, String(option.id)); }} /><span>{option.label}</span></label>; })}</div>}
          <button type="button" disabled={isPending} onClick={() => submitResponse(currentBlock, response)}>Check answer</button>
          {result && <div className={`exploration-feedback ${result.isCorrect === true ? "is-correct" : result.isCorrect === false ? "is-incorrect" : ""}`}><strong>{result.isCorrect === true ? "Correct" : result.isCorrect === false ? "Not quite" : "Response saved"}</strong>{result.feedbackHtml && <MarkdownBlock html={result.feedbackHtml} />}</div>}
        </section>
      );
    }
    return <section className="exploration-prose-block">{currentBlock.title && <h2>{currentBlock.title}</h2>}{currentBlock.bodyHtml && <MarkdownBlock html={currentBlock.bodyHtml} />}</section>;
  }

  return (
    <main className="exploration-block-reader">
      <header className="exploration-block-reader-header">
        <p>{visited.size} block{visited.size === 1 ? "" : "s"} visited</p>
        {canEdit && <Link href={`/explorations/${slug}/edit?view=block&block=${currentBlock.id}`} className="button secondary"><Pencil size={16} /> Edit</Link>}
      </header>
      {renderBlock()}
      {error && <p className="form-error" role="alert">{error}</p>}
      {terminal && state.explorationCompleted === true && <section className="exploration-completion-summary"><Flag size={22} /><div><h2>Exploration complete</h2><p>You followed a path through {visited.size} blocks.</p></div></section>}
      <footer className="exploration-reader-controls">
        <button type="button" className="secondary" disabled={history.length === 0} onClick={goBack}><ArrowLeft size={17} /> Back</button>
        <button type="button" className="secondary" onClick={restart}><RotateCcw size={17} /> Restart</button>
        {terminal ? <button type="button" disabled={!canContinue} onClick={() => { const nextState = { ...state, explorationCompleted: true }; setState(nextState); persist(currentBlock, nextState, true); }}><Flag size={17} /> Complete exploration</button> : currentBlock.kind !== "CHOICE" && (result?.nextBlockId || currentBlock.continueToBlockId) ? <button type="button" disabled={!canContinue} onClick={() => goTo(result?.nextBlockId ?? currentBlock.continueToBlockId!)}>Continue <ArrowRight size={17} /></button> : null}
      </footer>
    </main>
  );
}
