import { findDomainOption } from "./domains.ts";

const IMAGE_BASE =
  "https://s3.pub2.infomaniak.cloud/object/v1/AUTH_7cc517879b0040959f7d12abb1f0e72d/mathwoods-images/site-art-wide";

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
  "number-theory": {
    src: `${IMAGE_BASE}/number-theory.webp`,
    alt: "Ivan Shishkin, Birch Forest",
    painting: "Birch Forest"
  },
  "representation-theory": {
    src: `${IMAGE_BASE}/representation-theory.webp`,
    alt: "Ivan Shishkin, Pine Forest",
    painting: "Pine Forest"
  },
  "algebraic-geometry": {
    src: `${IMAGE_BASE}/algebraic-geometry.webp`,
    alt: "Ivan Shishkin, The Dark Wood",
    painting: "The Dark Wood"
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
  combinatorics: {
    src: `${IMAGE_BASE}/combinatorics.webp`,
    alt: "Ivan Shishkin, Mixed Forest",
    painting: "Mixed Forest"
  },
  "graphs-discrete-math": {
    src: `${IMAGE_BASE}/graphs-discrete-math.webp`,
    alt: "Ivan Shishkin, Wind-Fallen Trees",
    painting: "Wind-Fallen Trees"
  },
  "scientific-computing": {
    src: `${IMAGE_BASE}/scientific-computing.webp`,
    alt: "Ivan Shishkin, Autumn",
    painting: "Autumn"
  },
  "mathematical-physics": {
    src: `${IMAGE_BASE}/mathematical-physics.webp`,
    alt: "Ivan Shishkin, Winter",
    painting: "Winter"
  },
  other: {
    src: `${IMAGE_BASE}/other.webp`,
    alt: "Ivan Shishkin, Forest Landscape with Herons",
    painting: "Forest Landscape with Herons"
  }
};

export function heroArtForProblemDomain(domain: string | null | undefined): ProblemHeroArt {
  const domainKey = findDomainOption(domain)?.value ?? "other";
  return PROBLEM_DOMAIN_HERO_ART[domainKey] ?? PROBLEM_DOMAIN_HERO_ART.other;
}
