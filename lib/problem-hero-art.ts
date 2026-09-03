import { parentProblemDomainForCode } from "./domains.ts";

const IMAGE_BASE =
  "https://s3.pub2.infomaniak.cloud/object/v1/AUTH_7cc517879b0040959f7d12abb1f0e72d/mathwoods-images/site-art";

export type ProblemHeroArt = {
  src: string;
  alt: string;
  painting: string;
};

export const PROBLEM_DOMAIN_HERO_ART: Record<string, ProblemHeroArt> = {
  logic: {
    src: `${IMAGE_BASE}/logic.webp`,
    alt: "Ivan Shishkin, The Edge of the Forest",
    painting: "The Edge of the Forest"
  },
  "category-theory": {
    src: `${IMAGE_BASE}/category-theory.webp`,
    alt: "Ivan Shishkin, Forest Distant Views",
    painting: "Forest Distant Views"
  },
  algebra: {
    src: `${IMAGE_BASE}/algebra.webp`,
    alt: "Ivan Shishkin, Oak Grove",
    painting: "Oak Grove"
  },
  "linear-algebra": {
    src: `${IMAGE_BASE}/linear-algebra.webp`,
    alt: "Ivan Shishkin, The Forest Clearing",
    painting: "The Forest Clearing"
  },
  geometry: {
    src: `${IMAGE_BASE}/geometry.webp`,
    alt: "Ivan Shishkin, Oaks in Old Peterhof",
    painting: "Oaks in Old Peterhof"
  },
  "differential-geometry": {
    src: `${IMAGE_BASE}/differential-geometry.webp`,
    alt: "Ivan Shishkin, Mast-Tree Grove",
    painting: "Mast-Tree Grove"
  },
  "general-topology": {
    src: `${IMAGE_BASE}/general-topology.webp`,
    alt: "Ivan Shishkin, Forest",
    painting: "Forest"
  },
  "algebraic-topology": {
    src: `${IMAGE_BASE}/algebraic-topology.webp`,
    alt: "Ivan Shishkin, Forest Lodge",
    painting: "Forest Lodge"
  },
  "real-analysis": {
    src: `${IMAGE_BASE}/real-analysis.webp`,
    alt: "Ivan Shishkin, Pine Forest",
    painting: "Pine Forest"
  },
  "complex-analysis": {
    src: `${IMAGE_BASE}/complex-analysis.webp`,
    alt: "Ivan Shishkin, Pine on Sand",
    painting: "Pine on Sand"
  },
  "functional-analysis": {
    src: `${IMAGE_BASE}/functional-analysis.webp`,
    alt: "Ivan Shishkin, Branches. A Study",
    painting: "Branches. A Study"
  },
  "several-variable-functions": {
    src: `${IMAGE_BASE}/several-variable-functions.webp`,
    alt: "Ivan Shishkin, Mixed Forest",
    painting: "Mixed Forest"
  },
  "differential-equations": {
    src: `${IMAGE_BASE}/differential-equations.webp`,
    alt: "Ivan Shishkin, Birches after Storm",
    painting: "Birches after Storm"
  },
  "probability-statistics": {
    src: `${IMAGE_BASE}/probability-statistics.webp`,
    alt: "Ivan Shishkin, At the Edge of the Pine Forest",
    painting: "At the Edge of the Pine Forest"
  },
  computation: {
    src: `${IMAGE_BASE}/computation.webp`,
    alt: "Ivan Shishkin, Autumn",
    painting: "Autumn"
  },
  "graphs-discrete-math": {
    src: `${IMAGE_BASE}/graphs-discrete-math.webp`,
    alt: "Ivan Shishkin, Wind-Fallen Trees",
    painting: "Wind-Fallen Trees"
  },
  "history-of-mathematics": {
    src: `${IMAGE_BASE}/history-of-mathematics.webp`,
    alt: "Ivan Shishkin, Winter",
    painting: "Winter"
  },
  other: {
    src: `${IMAGE_BASE}/other.webp`,
    alt: "Ivan Shishkin, Forest Landscape with Herons",
    painting: "Forest Landscape with Herons"
  },
  misc: {
    src: `${IMAGE_BASE}/misc.webp`,
    alt: "Ivan Shishkin, Rye",
    painting: "Rye"
  },
  enigma: {
    src: `${IMAGE_BASE}/enigma.webp`,
    alt: "Ivan Shishkin, In the Wild North",
    painting: "In the Wild North"
  }
};

export function heroArtForProblemDomain(domain: string | null | undefined): ProblemHeroArt {
  const domainKey = parentProblemDomainForCode(domain)?.value ?? "other";
  return PROBLEM_DOMAIN_HERO_ART[domainKey] ?? PROBLEM_DOMAIN_HERO_ART.other;
}
