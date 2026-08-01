"use client";

import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Difficulty } from "@/components/Difficulty";
import { toggleProblemFavoriteAction } from "@/lib/actions/problem-actions";
import { problemDifficultyTone } from "@/lib/problem-difficulty";

export type RecommendedProblemItem = {
  id: number;
  slug: string;
  title: string;
  titleHtml: string;
  bodyHtml: string;
  domain: string;
  difficulty: number | null;
};

export function RecommendedProblemReader({
  favoriteLabel,
  items,
  openLabel,
  overflowLabel
}: {
  favoriteLabel: string;
  items: RecommendedProblemItem[];
  openLabel: string;
  overflowLabel: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const statementRef = useRef<HTMLDivElement>(null);
  const selected = items[selectedIndex];

  useEffect(() => {
    const element = statementRef.current;
    if (!element) return;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 2);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    const images = [...element.querySelectorAll("img")];
    images.forEach((image) => image.addEventListener("load", check));
    return () => {
      observer.disconnect();
      images.forEach((image) => image.removeEventListener("load", check));
    };
  }, [selectedIndex]);

  if (!selected) return null;

  function cycle(direction: number) {
    setSelectedIndex((current) => (current + direction + items.length) % items.length);
  }

  return (
    <section className="recommendation-reader">
      <div className="recommendation-reader-list">
        {items.map((item, index) => (
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
              <small>{item.domain}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="recommendation-reader-panel">
        <header>
          <div>
            <p>{selected.domain}</p>
            <h3 dangerouslySetInnerHTML={{ __html: selected.titleHtml }} />
          </div>
          <div className="recommendation-reader-arrows">
            <button type="button" onClick={() => cycle(-1)} aria-label="Previous recommendation">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => cycle(1)} aria-label="Next recommendation">
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="recommendation-statement" ref={statementRef}>
          <div className="prose-math" dangerouslySetInnerHTML={{ __html: selected.bodyHtml }} />
          {overflows && (
            <div className="recommendation-statement-fade">
              <Link href={`/problems/${selected.slug}`}>{overflowLabel}</Link>
            </div>
          )}
        </div>
        <footer>
          <Link href={`/problems/${selected.slug}`} className="mw-primary-button">
            {openLabel}
          </Link>
          <form action={toggleProblemFavoriteAction.bind(null, selected.id, selected.slug)}>
            <button type="submit" className="button secondary">
              <Heart size={16} />
              {favoriteLabel}
            </button>
          </form>
          <Difficulty value={selected.difficulty} compact />
        </footer>
      </div>
    </section>
  );
}
