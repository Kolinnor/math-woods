"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  openLabel
}: {
  items: RecommendedProblemItem[];
  openLabel: string;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const statementRef = useRef<HTMLDivElement>(null);
  const selected = items[selectedIndex];

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
        <footer>
          <Link href={`/problems/${selected.slug}?recommended=1`} className="mw-primary-button">
            {openLabel}
          </Link>
        </footer>
      </div>
    </section>
  );
}
