"use client";

import { Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { pickRandomDifferent } from "@/lib/random-content";

const LAST_RANDOM_PROBLEM_KEY = "math-woods:last-random-problem";

export function RandomProblemButton({ label, slugs }: { label: string; slugs: string[] }) {
  const router = useRouter();

  function openRandomProblem() {
    const previous = window.sessionStorage.getItem(LAST_RANDOM_PROBLEM_KEY) ?? undefined;
    const slug = pickRandomDifferent(slugs, previous);
    if (!slug) return;

    window.sessionStorage.setItem(LAST_RANDOM_PROBLEM_KEY, slug);
    router.push(`/problems/${slug}`);
  }

  return (
    <button
      type="button"
      className="secondary problem-random-button"
      disabled={slugs.length === 0}
      onClick={openRandomProblem}
    >
      <Shuffle size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
