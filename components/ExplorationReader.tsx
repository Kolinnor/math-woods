"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  ExternalLink,
  Flag,
  Pencil,
  RotateCcw
} from "lucide-react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownInline } from "@/components/MarkdownInline";
import {
  saveExplorationProgressAction,
  submitExplorationResponseAction
} from "@/lib/actions/exploration-actions";
import {
  asExplorationState,
  conditionMatches,
  type ExplorationState
} from "@/lib/exploration-engine";

type ReaderOption = {
  id: number;
  label: string;
  value: string | null;
  feedbackHtml: string | null;
  toPageId: number | null;
};

type ReaderBlock = {
  id: number;
  key: string;
  kind: string;
  title: string | null;
  bodyHtml: string | null;
  explanationHtml: string | null;
  position: number;
  quizType: string | null;
  visibilityRule: unknown;
  required: boolean;
  points: number;
  problem: { slug: string; titleHtml: string; difficulty: number | null } | null;
  concept: { slug: string; title: string } | null;
  options: ReaderOption[];
};

type ReaderPage = {
  id: number;
  key: string;
  slug: string;
  title: string;
  summary: string | null;
  position: number;
  isStart: boolean;
  isEnd: boolean;
  visibilityRule: unknown;
  blocks: ReaderBlock[];
};

type InitialAnswer = {
  blockKey: string;
  response: unknown;
  isCorrect: boolean | null;
};

type ResponseResult = {
  isCorrect: boolean | null;
  feedbackHtml: string | null;
  nextPageId: number | null;
};

type StoredProgress = {
  pageId?: number;
  state?: ExplorationState;
  visited?: number[];
};

function storageKey(playlistId: number) {
  return `math-woods:exploration:${playlistId}`;
}

function blockLabel(kind: string) {
  return kind.toLocaleLowerCase().replaceAll("_", " ");
}

export function ExplorationReader({
  playlistId,
  editionId,
  slug,
  pages,
  initialPageId,
  initialState,
  initialVisited,
  initialAnswers,
  signedIn,
  previewDraft = false,
  canEdit = false
}: {
  playlistId: number;
  editionId: number | null;
  slug: string;
  pages: ReaderPage[];
  initialPageId: number;
  initialState: ExplorationState;
  initialVisited: number[];
  initialAnswers: InitialAnswer[];
  signedIn: boolean;
  previewDraft?: boolean;
  canEdit?: boolean;
}) {
  const [state, setState] = useState<ExplorationState>(() => asExplorationState(initialState));
  const [currentPageId, setCurrentPageId] = useState(initialPageId);
  const [visited, setVisited] = useState(() => new Set(initialVisited.length ? initialVisited : [initialPageId]));
  const [history, setHistory] = useState<number[]>([]);
  const [responses, setResponses] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.blockKey, answer.response as string | string[]]))
  );
  const [results, setResults] = useState<Record<string, ResponseResult>>(() =>
    Object.fromEntries(
      initialAnswers.map((answer) => [answer.blockKey, { isCorrect: answer.isCorrect, feedbackHtml: null, nextPageId: null }])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (signedIn) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(playlistId)) ?? "null") as StoredProgress | null;
      if (!saved) return;
      if (saved.state) setState(asExplorationState(saved.state));
      if (saved.pageId && pages.some((page) => page.id === saved.pageId)) setCurrentPageId(saved.pageId);
      if (Array.isArray(saved.visited)) setVisited(new Set(saved.visited));
    } catch {
      localStorage.removeItem(storageKey(playlistId));
    }
  }, [pages, playlistId, signedIn]);

  useEffect(() => {
    if (signedIn) return;
    localStorage.setItem(
      storageKey(playlistId),
      JSON.stringify({ pageId: currentPageId, state, visited: [...visited] } satisfies StoredProgress)
    );
  }, [currentPageId, playlistId, signedIn, state, visited]);

  const visiblePages = useMemo(
    () => pages.filter((page) => conditionMatches(page.visibilityRule, state)).sort((a, b) => a.position - b.position),
    [pages, state]
  );
  const currentPage = visiblePages.find((page) => page.id === currentPageId) ?? visiblePages[0] ?? pages[0];
  const currentIndex = visiblePages.findIndex((page) => page.id === currentPage?.id);
  const visibleBlocks = currentPage?.blocks.filter((block) => conditionMatches(block.visibilityRule, state)) ?? [];
  const requiredBlocks = visibleBlocks.filter((block) => block.required && ["QUIZ", "CHOICE"].includes(block.kind));
  const requiredComplete = requiredBlocks.every((block) => results[`${currentPage.key}:${block.key}`]);
  const nextPage = currentIndex >= 0 ? visiblePages[currentIndex + 1] ?? null : null;
  const configuredEndPage = pages.find((page) => page.isEnd) ?? pages.at(-1) ?? null;
  const isEndPage = currentPage?.id === configuredEndPage?.id;
  const progress = visiblePages.length ? Math.round((visited.size / visiblePages.length) * 100) : 0;
  const numberedKinds = new Set(["DEFINITION", "THEOREM", "LEMMA", "PROPOSITION", "COROLLARY", "EXAMPLE", "COUNTEREXAMPLE"]);
  const statementNumbers = new Map<string, string>();
  let statementIndex = 0;
  for (const block of visibleBlocks) {
    if (numberedKinds.has(block.kind)) {
      statementIndex += 1;
      statementNumbers.set(block.key, `${currentPage.position}.${statementIndex}`);
    }
  }

  function persist(pageId: number, nextState: ExplorationState, completed = false) {
    if (!signedIn || previewDraft) return;
    startTransition(() => {
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) return;
      void saveExplorationProgressAction(playlistId, editionId, pageId, page.key, nextState, completed).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Progress could not be saved.");
      });
    });
  }

  function goTo(pageId: number, addHistory = true) {
    const target = visiblePages.find((page) => page.id === pageId);
    if (!target || !currentPage) return;
    if (addHistory) setHistory((items) => [...items, currentPage.id]);
    setCurrentPageId(target.id);
    setVisited((items) => new Set([...items, target.id]));
    window.history.replaceState(
      null,
      "",
      `/explorations/${slug}/start?page=${target.slug}${previewDraft ? "&preview=draft" : ""}`
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    persist(target.id, state);
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    goTo(previous, false);
  }

  function restart() {
    const first = visiblePages.find((page) => page.isStart) ?? visiblePages[0];
    if (!first) return;
    const emptyState: ExplorationState = {};
    setState(emptyState);
    setResponses({});
    setResults({});
    setHistory([]);
    setVisited(new Set([first.id]));
    setCurrentPageId(first.id);
    localStorage.removeItem(storageKey(playlistId));
    persist(first.id, emptyState);
  }

  function setResponse(blockKey: string, value: string | string[]) {
    setResponses((items) => ({ ...items, [blockKey]: value }));
  }

  function submitResponse(block: ReaderBlock, response: string | string[]) {
    if ((typeof response === "string" && !response.trim()) || (Array.isArray(response) && response.length === 0)) return;
    setError(null);
    startTransition(async () => {
      try {
        const stableBlockKey = `${currentPage.key}:${block.key}`;
        const result = await submitExplorationResponseAction(
          playlistId,
          editionId,
          currentPage.key,
          block.key,
          response,
          !previewDraft
        );
        const nextState = { ...state, ...asExplorationState(result.state) };
        setState(nextState);
        setResults((items) => ({
          ...items,
          [stableBlockKey]: {
            isCorrect: result.isCorrect,
            feedbackHtml: result.feedbackHtml,
            nextPageId: result.nextPageId
          }
        }));
        if (block.kind === "CHOICE" && result.nextPageId) {
          setTimeout(() => goTo(result.nextPageId!), 0);
        } else {
          persist(currentPage.id, nextState);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The response could not be checked.");
      }
    });
  }

  if (!currentPage) return <p className="muted">This exploration has no readable pages yet.</p>;

  return (
    <div className="exploration-reader-shell">
      <aside className="exploration-reader-outline" aria-label="Exploration pages">
        <div className="exploration-progress-summary">
          <div>
            <span>Progress</span>
            <strong>{Math.min(100, progress)}%</strong>
          </div>
          <div className="exploration-progress-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        </div>
        <nav>
          {visiblePages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={page.id === currentPage.id ? "is-current" : undefined}
              onClick={() => goTo(page.id)}
            >
              <span>{page.position}</span>
              <span>{page.title}</span>
              {visited.has(page.id) && <Check size={14} aria-label="Visited" />}
            </button>
          ))}
        </nav>
      </aside>

      <main className="exploration-reader-page">
        <header className="exploration-reader-page-header">
          <div className="exploration-reader-page-title-row">
            <div>
              <p className="eyebrow">Page {currentIndex + 1} of {visiblePages.length}</p>
              <h1>{currentPage.title}</h1>
            </div>
            {canEdit && (
              <Link href={`/explorations/${slug}/edit?page=${currentPage.id}`} className="button secondary">
                <Pencil size={16} /> Edit
              </Link>
            )}
          </div>
          {currentPage.summary && <p>{currentPage.summary}</p>}
        </header>

        <div className="exploration-reader-blocks">
          {visibleBlocks.map((block) => {
            const stableBlockKey = `${currentPage.key}:${block.key}`;
            const result = results[stableBlockKey];
            const response = responses[stableBlockKey] ?? (block.quizType === "MULTIPLE_CHOICE" ? [] : "");

            if (block.kind === "DIVIDER") return <hr key={block.id} className="exploration-divider" />;
            if (block.kind === "HEADING") {
              return <h2 key={block.id} className="exploration-section-heading">{block.title}</h2>;
            }
            if (block.kind === "PROBLEM" && block.problem) {
              return (
                <section key={block.id} className="exploration-reference-block exploration-problem-block">
                  <div>
                    <p className="eyebrow">Problem</p>
                    <h2><MarkdownInline html={block.problem.titleHtml} /></h2>
                    {block.problem.difficulty !== null && <span className="muted">Difficulty {block.problem.difficulty}/100</span>}
                  </div>
                  {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
                  <Link href={`/problems/${block.problem.slug}`} className="button secondary">
                    Open problem <ExternalLink size={16} />
                  </Link>
                </section>
              );
            }
            if (block.kind === "CONCEPT" && block.concept) {
              return (
                <section key={block.id} className="exploration-reference-block exploration-concept-block">
                  <div>
                    <p className="eyebrow">Concept</p>
                    <h2>{block.concept.title}</h2>
                  </div>
                  {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
                  <Link href={`/concepts/${block.concept.slug}`} className="button secondary">
                    Open concept <BookOpen size={16} />
                  </Link>
                </section>
              );
            }
            if (block.kind === "CHOICE") {
              return (
                <section key={block.id} className="exploration-interaction-block">
                  {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
                  <div className="exploration-choice-grid">
                    {block.options.map((option) => (
                      <button key={option.id} type="button" className="secondary" disabled={isPending} onClick={() => submitResponse(block, String(option.id))}>
                        {option.label}<ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              );
            }
            if (block.kind === "QUIZ") {
              const multiple = block.quizType === "MULTIPLE_CHOICE";
              const textEntry = block.quizType === "SHORT_TEXT" || block.quizType === "NUMBER";
              return (
                <section key={block.id} className="exploration-interaction-block">
                  <div className="exploration-interaction-heading">
                    <CircleHelp size={20} />
                    <div>
                      <p className="eyebrow">Quiz{block.points ? ` · ${block.points} points` : ""}</p>
                      <h2>{block.title || "Check your understanding"}</h2>
                    </div>
                  </div>
                  {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
                  {textEntry ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Your answer</span>
                      <input
                        type={block.quizType === "NUMBER" ? "text" : "text"}
                        inputMode={block.quizType === "NUMBER" ? "decimal" : undefined}
                        value={typeof response === "string" ? response : ""}
                        onChange={(event) => setResponse(stableBlockKey, event.target.value)}
                      />
                    </label>
                  ) : (
                    <div className="exploration-quiz-options">
                      {block.options.map((option) => {
                        const selected = multiple
                          ? Array.isArray(response) && response.includes(String(option.id))
                          : response === String(option.id);
                        return (
                          <label key={option.id}>
                            <input
                              type={multiple ? "checkbox" : "radio"}
                              name={`quiz-${block.id}`}
                              checked={selected}
                              onChange={() => {
                                if (multiple) {
                                  const current = Array.isArray(response) ? response : [];
                                  setResponse(
                                    stableBlockKey,
                                    selected ? current.filter((id) => id !== String(option.id)) : [...current, String(option.id)]
                                  );
                                } else {
                                  setResponse(stableBlockKey, String(option.id));
                                }
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" disabled={isPending} onClick={() => submitResponse(block, response)}>
                    Check answer
                  </button>
                  {result && (
                    <div className={`exploration-feedback ${result.isCorrect === true ? "is-correct" : result.isCorrect === false ? "is-incorrect" : ""}`}>
                      <strong>{result.isCorrect === true ? "Correct" : result.isCorrect === false ? "Not quite" : "Response saved"}</strong>
                      {result.feedbackHtml && <MarkdownBlock html={result.feedbackHtml} />}
                      {result.nextPageId && (
                        <button type="button" className="secondary" onClick={() => goTo(result.nextPageId!)}>
                          Continue this path <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            }

            const framed = !["MARKDOWN", "IMAGE"].includes(block.kind);
            return (
              <section id={`block-${block.key}`} key={block.id} className={framed ? `exploration-math-block kind-${block.kind.toLocaleLowerCase()}` : "exploration-prose-block"}>
                {framed && <p className="eyebrow">{blockLabel(block.kind)}{statementNumbers.has(block.key) ? ` ${statementNumbers.get(block.key)}` : ""}</p>}
                {framed && block.title && <h2>{block.title}</h2>}
                {block.bodyHtml && <MarkdownBlock html={block.bodyHtml} />}
              </section>
            );
          })}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {!requiredComplete && <p className="muted text-sm">Complete the required interactions before continuing.</p>}
        {isEndPage && state.explorationCompleted === true && (
          <section className="exploration-completion-summary">
            <Flag size={22} />
            <div><h2>Exploration complete</h2><p>You visited {visited.size} pages. You can revisit any branch or restart with different choices.</p></div>
          </section>
        )}

        <footer className="exploration-reader-controls">
          <button type="button" className="secondary" disabled={history.length === 0} onClick={goBack} title="Previous visited page">
            <ArrowLeft size={17} /> Back
          </button>
          <button type="button" className="secondary" onClick={restart} title="Restart exploration">
            <RotateCcw size={17} /> Restart
          </button>
          {isEndPage ? (
            <button
              type="button"
              disabled={!requiredComplete}
              onClick={() => {
                const nextState = { ...state, explorationCompleted: true };
                setState(nextState);
                persist(currentPage.id, nextState, true);
              }}
            >
              <Flag size={17} /> Complete exploration
            </button>
          ) : nextPage ? (
            <button type="button" disabled={!requiredComplete} onClick={() => goTo(nextPage.id)}>
              Continue <ArrowRight size={17} />
            </button>
          ) : null}
        </footer>
      </main>
    </div>
  );
}
