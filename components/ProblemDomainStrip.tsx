"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SortKey = "family" | "name" | "diff" | "date";
type FamilyKey = "found" | "geom" | "ana" | "prob" | "app" | "other";

type DomainTile = {
  name: string;
  glyph: string;
  family: FamilyKey;
  href: string;
  activeValues: string[];
  diff: number;
  year: number;
};

type ProblemDomainStripProps = {
  selectedDomain?: string;
};

const FAMILIES: Record<FamilyKey, { label: string; color: string; order: number }> = {
  found: { label: "Fondements & algèbre", color: "#3f6b45", order: 0 },
  geom: { label: "Géométrie & topologie", color: "#a87f2e", order: 1 },
  ana: { label: "Analyse", color: "#2f6f6a", order: 2 },
  prob: { label: "Probabilités & discret", color: "#3d5f7a", order: 3 },
  app: { label: "Maths appliquées", color: "#a85f33", order: 4 },
  other: { label: "Autres", color: "#1f1f1f", order: 5 }
};

const DOMAIN_TILES: DomainTile[] = [
  { name: "Logique", glyph: "∴", family: "found", href: "/problems?domain=LOGIC", activeValues: ["LOGIC", "03-XX"], diff: 2, year: 1847 },
  { name: "Catégories", glyph: "→", family: "found", href: "/problems?domain=18-XX", activeValues: ["18-XX"], diff: 4, year: 1945 },
  { name: "Algèbre", glyph: "x", family: "found", href: "/problems?domain=ALGEBRA", activeValues: ["ALGEBRA"], diff: 2, year: 820 },
  { name: "Algèbre linéaire", glyph: "⊕", family: "found", href: "/problems?domain=15-XX", activeValues: ["15-XX"], diff: 2, year: 1850 },
  { name: "Théorie des nombres", glyph: "ℤ", family: "found", href: "/problems?domain=11-XX", activeValues: ["11-XX", "ARITHMETIC"], diff: 3, year: -300 },
  { name: "Représentations", glyph: "ρ", family: "found", href: "/problems?domain=20-XX", activeValues: ["20-XX"], diff: 4, year: 1896 },
  { name: "Géométrie algébrique", glyph: "⊙", family: "geom", href: "/problems?domain=14-XX", activeValues: ["14-XX"], diff: 4, year: 1900 },
  { name: "Géométrie", glyph: "△", family: "geom", href: "/problems?domain=51-XX", activeValues: ["GEOMETRY", "51-XX", "52-XX"], diff: 2, year: -300 },
  { name: "Géométrie différentielle", glyph: "∂", family: "geom", href: "/problems?domain=53-XX", activeValues: ["53-XX", "58-XX"], diff: 4, year: 1827 },
  { name: "Topologie", glyph: "∞", family: "geom", href: "/problems?domain=54-XX", activeValues: ["TOPOLOGY", "54-XX", "57-XX"], diff: 3, year: 1895 },
  { name: "Topologie algébrique", glyph: "π", family: "geom", href: "/problems?domain=55-XX", activeValues: ["55-XX"], diff: 4, year: 1900 },
  { name: "Analyse réelle", glyph: "ℝ", family: "ana", href: "/problems?domain=26-XX", activeValues: ["26-XX"], diff: 3, year: 1700 },
  { name: "Analyse complexe", glyph: "ℂ", family: "ana", href: "/problems?domain=30-XX", activeValues: ["30-XX", "31-XX", "32-XX"], diff: 3, year: 1825 },
  { name: "Analyse fonctionnelle", glyph: "ƒ", family: "ana", href: "/problems?domain=46-XX", activeValues: ["46-XX", "47-XX"], diff: 4, year: 1900 },
  { name: "Équations différentielles", glyph: "∇", family: "ana", href: "/problems?domain=34-XX", activeValues: ["34-XX", "35-XX"], diff: 3, year: 1690 },
  { name: "Probabilités et stats", glyph: "ℙ", family: "prob", href: "/problems?domain=PROBABILITY", activeValues: ["PROBABILITY", "60-XX", "62-XX"], diff: 2, year: 1654 },
  { name: "Combinatoire", glyph: "∑", family: "prob", href: "/problems?domain=05-XX", activeValues: ["05-XX", "COMBINATORICS"], diff: 2, year: 1666 },
  { name: "Graphes et discret", glyph: "◇", family: "prob", href: "/problems?domain=COMBINATORICS", activeValues: ["COMBINATORICS", "68-XX"], diff: 2, year: 1736 },
  { name: "Calcul scientifique", glyph: "≈", family: "app", href: "/problems?domain=65-XX", activeValues: ["65-XX"], diff: 3, year: 1947 },
  { name: "Physique mathematique", glyph: "Ψ", family: "app", href: "/problems?domain=81-XX", activeValues: ["70-XX", "74-XX", "76-XX", "78-XX", "80-XX", "81-XX", "82-XX", "83-XX"], diff: 3, year: 1687 },
  { name: "Autres", glyph: "⋯", family: "other", href: "/problems?domain=OTHER", activeValues: ["OTHER"], diff: 1, year: 9999 }
];

const SORT_LABELS: Record<SortKey, string> = {
  family: "famille",
  name: "A-Z",
  diff: "difficulté",
  date: "date"
};

function normalized(value: string | undefined) {
  return (value ?? "").toUpperCase();
}

export function ProblemDomainStrip({ selectedDomain }: ProblemDomainStripProps) {
  const [sort, setSort] = useState<SortKey>("family");
  const [open, setOpen] = useState(false);
  const activeDomain = normalized(selectedDomain);
  const domains = useMemo(() => {
    return [...DOMAIN_TILES].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "fr");
      if (sort === "diff") return a.diff - b.diff || a.name.localeCompare(b.name, "fr");
      if (sort === "date") return a.year - b.year || a.name.localeCompare(b.name, "fr");
      return FAMILIES[a.family].order - FAMILIES[b.family].order || a.name.localeCompare(b.name, "fr");
    });
  }, [sort]);

  function choose(nextSort: SortKey) {
    setSort(nextSort);
    setOpen(false);
  }

  return (
    <section className="problem-domain-strip" aria-labelledby="problem-domain-strip-title">
      <div className="problem-domain-strip-header">
        <h2 id="problem-domain-strip-title">Browse by domain</h2>
        <div className="problem-domain-strip-actions">
          <Link href="/problems">all 21 domains</Link>
          <div className="problem-domain-sort">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              by {SORT_LABELS[sort]} <span aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="problem-domain-sort-menu">
                <button type="button" onClick={() => choose("family")}>
                  Famille
                </button>
                <button type="button" onClick={() => choose("name")}>
                  Alphabétique
                </button>
                <button type="button" onClick={() => choose("diff")}>
                  Difficulté
                </button>
                <button type="button" onClick={() => choose("date")}>
                  Date historique
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="problem-domain-tile-grid">
        {domains.map((domain) => {
          const active = domain.activeValues.map(normalized).includes(activeDomain);
          return (
            <Link key={domain.name} href={domain.href as never} className={active ? "problem-domain-tile active" : "problem-domain-tile"}>
              <span className="problem-domain-glyph" style={{ backgroundColor: FAMILIES[domain.family].color }}>
                {domain.glyph}
              </span>
              <span>{domain.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
