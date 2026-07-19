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

let boardCounter = 0;

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

  const board = JXG.JSXGraph.initBoard(boardId, {
    boundingbox: config.boundingBox,
    axis: config.axis,
    grid: config.grid,
    keepaspectratio: config.keepAspectRatio,
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: true, needShift: false },
    zoom: { wheel: true, needShift: false }
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
  const resizeObserver = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect.width ?? holder.clientWidth);
    if (width <= 0) return;
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      board.resizeContainer(width, graphHeight(config, width));
    });
  });
  resizeObserver.observe(holder);

  return {
    board,
    dispose: () => {
      disposeAnimation();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      JXG.JSXGraph.freeBoard(board as never);
    }
  };
}

export function JsxGraphMarkdown({ html }: { html: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    const mounted: MountedBoard[] = [];
    const placeholders = Array.from(root.querySelectorAll<HTMLElement>(".jsxgraph-embed[data-jsxgraph]"));

    void Promise.all(
      placeholders.map(async (holder) => {
        const parsed = decodeJsxGraphConfig(holder.dataset.jsxgraph ?? "");
        if (!parsed.ok) {
          showGraphError(holder, parsed.error);
          return;
        }

        try {
          const graph = await mountBoard(holder, parsed.config, () => disposed);
          if (!graph) return;
          if (disposed) graph.dispose();
          else mounted.push(graph);
        } catch (error) {
          if (!disposed) showGraphError(holder, error instanceof Error ? error.message : "Unknown JSXGraph error.");
        }
      })
    );

    return () => {
      disposed = true;
      for (const graph of mounted) graph.dispose();
    };
  }, [html]);

  return <div ref={rootRef} className="prose-math max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
