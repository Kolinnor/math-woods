"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownInline } from "@/components/MarkdownInline";

type CircuitChoice = {
  id: number;
  label: string;
  note: string | null;
  toNodeId: number;
};

type CircuitNode = {
  id: number;
  kind: "PROBLEM" | "CONCEPT" | "NOTE";
  title: string;
  bodyHtml: string | null;
  position: number;
  isStart: boolean;
  problem: { slug: string; title: string; titleHtml?: string; difficulty: number | null } | null;
  concept: { slug: string; title: string } | null;
  choices: CircuitChoice[];
};

function nodeLabel(node: CircuitNode) {
  if (node.kind === "PROBLEM") return "Problem";
  if (node.kind === "CONCEPT") return "Concept";
  return "Note";
}

export function PlaylistCircuit({ nodes }: { nodes: CircuitNode[] }) {
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.position - b.position), [nodes]);
  const nodesById = useMemo(() => new Map(sortedNodes.map((node) => [node.id, node])), [sortedNodes]);
  const firstNode = sortedNodes.find((node) => node.isStart) ?? sortedNodes[0] ?? null;
  const [currentNodeId, setCurrentNodeId] = useState(firstNode?.id ?? null);
  const [history, setHistory] = useState<number[]>([]);
  const currentNode = currentNodeId ? nodesById.get(currentNodeId) ?? firstNode : firstNode;

  if (!currentNode) {
    return null;
  }

  const goTo = (nodeId: number) => {
    setHistory((items) => [...items, currentNode.id]);
    setCurrentNodeId(nodeId);
  };

  const goBack = () => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (previous) setCurrentNodeId(previous);
      return items.slice(0, -1);
    });
  };

  const reset = () => {
    setCurrentNodeId(firstNode?.id ?? null);
    setHistory([]);
  };

  return (
    <section className="playlist-circuit">
      <div className="playlist-circuit-header">
        <div>
          <p className="eyebrow">Adaptive circuit</p>
          <h2>{currentNode.title}</h2>
        </div>
        <span>{nodeLabel(currentNode)}</span>
      </div>

      <div className="playlist-circuit-body">
        {currentNode.kind === "PROBLEM" && currentNode.problem && (
          <Link href={`/problems/${currentNode.problem.slug}`} className="circuit-target">
            <strong>
              {currentNode.problem.titleHtml ? (
                <MarkdownInline html={currentNode.problem.titleHtml} />
              ) : (
                currentNode.problem.title
              )}
            </strong>
            {currentNode.problem.difficulty && <span>difficulty {currentNode.problem.difficulty}/100</span>}
          </Link>
        )}
        {currentNode.kind === "CONCEPT" && currentNode.concept && (
          <Link href={`/concepts/${currentNode.concept.slug}`} className="circuit-target">
            <strong>{currentNode.concept.title}</strong>
            <span>open concept article</span>
          </Link>
        )}
        {currentNode.bodyHtml && <MarkdownBlock html={currentNode.bodyHtml} />}
      </div>

      <div className="playlist-circuit-choices">
        {currentNode.choices.map((choice) => (
          <button key={choice.id} type="button" className="secondary" onClick={() => goTo(choice.toNodeId)}>
            <span>{choice.label}</span>
            {choice.note && <small>{choice.note}</small>}
          </button>
        ))}
        {currentNode.choices.length === 0 && <p className="muted text-sm">This branch ends here.</p>}
      </div>

      <div className="playlist-circuit-controls">
        <button type="button" className="secondary" disabled={history.length === 0} onClick={goBack}>
          Back
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Restart
        </button>
      </div>
    </section>
  );
}
