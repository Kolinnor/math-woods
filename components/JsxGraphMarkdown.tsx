"use client";

import { useEffect, useRef } from "react";
import { decodeJsxGraphConfig, type JsxGraphConfig } from "@/lib/jsxgraph";

type BoardLike = {
  create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
  resizeContainer: (width: number, height: number) => unknown;
  select: (id: string, onlyByIdOrName?: boolean) => unknown;
  update: () => unknown;
};

type AnimatableElement = {
  startAnimation: (direction: number, steps: number, delay?: number, rounds?: number) => unknown;
  stopAnimation: () => unknown;
};

type MountedBoard = {
  board: BoardLike;
  dispose: () => void;
};

type PendingMount = {
  cancelled: boolean;
  timeoutId: number;
};

let boardCounter = 0;
const GRAPH_LOAD_TIMEOUT_MS = 12_000;

function isAnimatable(value: unknown): value is AnimatableElement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnimatableElement>;
  return typeof candidate.startAnimation === "function" && typeof candidate.stopAnimation === "function";
}

function graphHeight(config: JsxGraphConfig, width: number) {
  if (width <= 0) return config.height;
  return Math.min(config.height, Math.max(220, Math.round(width * 0.78)));
}

function showGraphError(holder: HTMLElement, message: string) {
  holder.className = "jsxgraph-error";
  holder.removeAttribute("data-jsxgraph");
  holder.removeAttribute("data-jsxgraph-state");
  holder.removeAttribute("aria-busy");
  holder.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = "Graph could not be rendered.";
  const detail = document.createElement("span");
  detail.textContent = message;
  holder.append(title, detail);
}

function animationControl(board: BoardLike, config: JsxGraphConfig, holder: HTMLElement) {
  const animation = config.animation;
  if (!animation) return () => undefined;

  const target = board.select(animation.target, true);
  if (!isAnimatable(target)) throw new Error("The animated JSXGraph element is unavailable.");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = animation.autoplay && !reducedMotion;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "jsxgraph-animation-toggle";

  const updateButton = () => {
    button.textContent = running ? "Pause" : "Play";
    button.setAttribute("aria-label", running ? "Pause graph animation" : "Play graph animation");
    button.title = running ? "Pause animation" : "Play animation";
  };
  const start = () => {
    target.startAnimation(animation.direction, animation.steps, animation.delay, animation.rounds);
  };
  const stop = () => target.stopAnimation();

  updateButton();
  button.addEventListener("click", () => {
    running = !running;
    if (running) start();
    else stop();
    updateButton();
  });
  holder.appendChild(button);
  if (running) start();

  return () => {
    stop();
    button.remove();
  };
}

async function mountBoard(
  holder: HTMLElement,
  config: JsxGraphConfig,
  isCancelled: () => boolean
): Promise<MountedBoard | null> {
  // JSXGraph's package exports omit the browser bundle and its matching declaration path.
  // @ts-expect-error The runtime API is typed by the root jsxgraph package.
  const module = await import("../node_modules/jsxgraph/distrib/jsxgraphcore.mjs");
  if (isCancelled()) return null;
  const JXG = module.default ?? module;
  const boardElement = document.createElement("div");
  const boardId = `math-woods-jsxgraph-${++boardCounter}`;
  const initialHeight = graphHeight(config, holder.clientWidth);

  boardElement.id = boardId;
  boardElement.className = "jxgbox jsxgraph-board";
  boardElement.style.height = `${initialHeight}px`;
  boardElement.setAttribute("aria-label", "Interactive mathematical graph canvas");
  holder.replaceChildren(boardElement);
  holder.setAttribute("aria-busy", "true");

  let board: BoardLike | null = null;
  try {
    board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: config.boundingBox,
      axis: config.axis,
      grid: config.grid,
      keepaspectratio: config.keepAspectRatio,
      showCopyright: false,
      showNavigation: false,
      pan: { enabled: true, needShift: false },
      zoom: { enabled: false }
    }) as unknown as BoardLike;

    for (const element of config.elements) {
      board.create(element.type, element.parents, {
        ...element.attributes,
        ...(element.id ? { id: element.id } : {})
      });
    }
    board.update();
    holder.setAttribute("aria-busy", "false");

    const disposeAnimation = animationControl(board, config, holder);
    let resizeFrame = 0;
    let boardDisposed = false;
    const resizeObserver = new ResizeObserver((entries) => {
      if (boardDisposed || isCancelled()) return;
      const width = Math.round(entries[0]?.contentRect.width ?? holder.clientWidth);
      if (width <= 0) return;
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        if (boardDisposed || isCancelled()) return;
        board?.resizeContainer(width, graphHeight(config, width));
      });
    });
    resizeObserver.observe(holder);

    return {
      board,
      dispose: () => {
        if (boardDisposed) return;
        boardDisposed = true;
        disposeAnimation();
        resizeObserver.disconnect();
        window.cancelAnimationFrame(resizeFrame);
        JXG.JSXGraph.freeBoard(board as never);
      }
    };
  } catch (error) {
    if (board) {
      JXG.JSXGraph.freeBoard(board as never);
    }
    throw error;
  }
}

function loadingTimedOut(holder: HTMLElement) {
  showGraphError(holder, "The interactive graph took too long to load. Reload the page to try again.");
}

export function JsxGraphMarkdown({ html }: { html: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let scanFrame = 0;
    const mounted = new Map<HTMLElement, MountedBoard>();
    const pending = new Map<HTMLElement, PendingMount>();

    const mountHolder = async (holder: HTMLElement) => {
      if (disposed || mounted.has(holder) || pending.has(holder) || holder.dataset.jsxgraphState) return;

      const parsed = decodeJsxGraphConfig(holder.dataset.jsxgraph ?? "");
      if (!parsed.ok) {
        showGraphError(holder, parsed.error);
        return;
      }

      holder.dataset.jsxgraphState = "loading";
      holder.setAttribute("aria-busy", "true");
      const mount: PendingMount = {
        cancelled: false,
        timeoutId: window.setTimeout(() => {
          mount.cancelled = true;
          pending.delete(holder);
          if (!disposed && root.contains(holder)) loadingTimedOut(holder);
        }, GRAPH_LOAD_TIMEOUT_MS)
      };
      pending.set(holder, mount);

      try {
        const graph = await mountBoard(
          holder,
          parsed.config,
          () => disposed || mount.cancelled || !root.contains(holder)
        );
        if (!graph) return;
        if (disposed || mount.cancelled || !root.contains(holder)) {
          graph.dispose();
          return;
        }

        holder.dataset.jsxgraphState = "ready";
        mounted.set(holder, graph);
      } catch (error) {
        if (!disposed && !mount.cancelled && root.contains(holder)) {
          showGraphError(holder, error instanceof Error ? error.message : "Unknown JSXGraph error.");
        }
      } finally {
        window.clearTimeout(mount.timeoutId);
        if (pending.get(holder) === mount) pending.delete(holder);
      }
    };

    const scan = () => {
      scanFrame = 0;
      if (disposed) return;

      for (const [holder, graph] of mounted) {
        if (root.contains(holder)) continue;
        graph.dispose();
        mounted.delete(holder);
      }
      for (const [holder, mount] of pending) {
        if (root.contains(holder)) continue;
        mount.cancelled = true;
        window.clearTimeout(mount.timeoutId);
        pending.delete(holder);
      }

      const placeholders = root.querySelectorAll<HTMLElement>(
        ".jsxgraph-embed[data-jsxgraph]:not([data-jsxgraph-state])"
      );
      for (const holder of placeholders) void mountHolder(holder);
    };

    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(scanFrame);
      scanFrame = window.requestAnimationFrame(scan);
    });
    observer.observe(root, { childList: true, subtree: true });
    scan();

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(scanFrame);
      for (const mount of pending.values()) {
        mount.cancelled = true;
        window.clearTimeout(mount.timeoutId);
      }
      pending.clear();
      for (const graph of mounted.values()) graph.dispose();
      mounted.clear();
    };
  }, [html]);

  return <div ref={rootRef} className="prose-math max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
