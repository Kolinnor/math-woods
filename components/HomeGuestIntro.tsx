"use client";

import { Code2, CircleHelp, Puzzle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type MathLevelOption = {
  value: string;
  label: string;
  range: string;
  description: string;
};

type RecommendedProblem = {
  slug: string;
  title: string;
  difficulty: number | null;
};

type HomeGuestIntroProps = {
  levels: MathLevelOption[];
  recommendations: Record<string, RecommendedProblem[]>;
};

const introCards = [
  {
    icon: Puzzle,
    text: "Problems are written and curated by the community."
  },
  {
    icon: CircleHelp,
    text: "Each problem connects to an evolving database of mathematical concepts."
  },
  {
    icon: Code2,
    text: "The site is free and open source. Feel free to contribute!"
  }
];

export function HomeGuestIntro({ levels, recommendations }: HomeGuestIntroProps) {
  const [open, setOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(levels[1]?.value ?? levels[0]?.value ?? "");
  const selected = levels.find((level) => level.value === selectedLevel) ?? levels[0];
  const problems = selected ? recommendations[selected.value] ?? [] : [];

  return (
    <>
      <section className="home-guest-intro">
        <h1>Math Woods is a quiet place for problem solving and studying mathematics</h1>
        <div className="home-guest-grid">
          {introCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.text} className="home-guest-card">
                <Icon aria-hidden="true" size={38} strokeWidth={1.8} />
                <p>{card.text}</p>
              </div>
            );
          })}
        </div>
        <div className="home-guest-actions">
          <button type="button" className="button" onClick={() => setOpen(true)}>
            Start solving problems
          </button>
          <Link href="/contributing" className="button secondary">
            How can I contribute?
          </Link>
        </div>
      </section>

      {open && (
        <div className="home-level-modal" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="home-level-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-level-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="home-level-close" aria-label="Close" onClick={() => setOpen(false)}>
              <X aria-hidden="true" size={16} />
            </button>
            <h2 id="home-level-title">What is your level?</h2>
            <div className="home-level-options" aria-label="Mathematics level">
              {levels.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  className={level.value === selectedLevel ? "home-level-option active" : "home-level-option"}
                  aria-pressed={level.value === selectedLevel}
                  onClick={() => setSelectedLevel(level.value)}
                >
                  <strong>{level.label}</strong>
                  <span>{level.range}</span>
                  <small>{level.description}</small>
                </button>
              ))}
            </div>
            <div className="home-level-results">
              {problems.length > 0 ? (
                problems.map((problem) => (
                  <Link key={problem.slug} href={`/problems/${problem.slug}`} onClick={() => setOpen(false)}>
                    <strong>{problem.title}</strong>
                    <span>{problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty not set"}</span>
                  </Link>
                ))
              ) : (
                <Link href="/problems" onClick={() => setOpen(false)}>
                  <strong>Browse all problems</strong>
                  <span>No curated problems are available for this level yet.</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
