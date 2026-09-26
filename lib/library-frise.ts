import { cache } from "react";
import { prisma } from "@/lib/db";
import { milestoneTypeLabel } from "@/lib/library";
import { libraryEraOfPeriod, type LibraryEraView } from "@/lib/library-display";
import { localizedTranslation } from "@/lib/library-queries";
import { mathematicianPeriod } from "@/lib/mathematician-browser";
import { overlapsLibraryEra } from "@/lib/library-era-filters";

// The timeline shows a selection, not a census: in each era, the entries chosen by the editors
// ("sur la frise") come first, then the richest entries. The others stay one click away.

export type FriseMilestone = { slug: string; sortYear: number; endYear: number | null; period: boolean; title: string; dateLabel: string; typeLabel: string };
export type FrisePerson = { slug: string; name: string; short: string; from: number; to: number; lifespan: string };
type Scored<T> = T & { score: number };
export type FriseTotals = Record<string, { people: number; milestones: number }>;

/** The name shown on the timeline: the family name ("Euler"), or the whole name when it has no clear one. */
export function friseName(displayName: string, sortName = "") {
  if (sortName.includes(",")) return sortName.split(",")[0].trim();
  const words = displayName.split(/\s+/);
  if (words.length < 2 || /\b(?:de|du|des|van|von|ibn|ben|al|le|la)\b|\bd['’]/i.test(displayName)) return words[0];
  return words[words.length - 1];
}

const EDITOR_CHOICE = 1000;

/** Every published person and milestone of the library, with a score. One query of each per request. */
export const libraryFriseCandidates = cache(async (locale: "fr" | "en") => {
  const currentYear = new Date().getFullYear();
  const [people, milestones] = await Promise.all([
    prisma.mathematician.findMany({
      where: { status: "PUBLISHED" },
      select: {
        slug: true, name: true, lifespan: true, periodStartYear: true, periodEndYear: true, portraitUrl: true, featuredOnTimeline: true,
        translations: { select: { language: true, displayName: true, sortName: true, teaser: true, _count: { select: { relatedItems: true } } } },
        _count: { select: { milestoneLinks: true, conceptLinks: true, problemLinks: true, works: true } }
      }
    }),
    prisma.historyMilestone.findMany({
      where: { status: "PUBLISHED" },
      select: {
        slug: true, sortYear: true, endYear: true, milestoneType: true, featuredOnTimeline: true, imageUrl: true,
        translations: { select: { language: true, title: true, yearLabel: true } },
        _count: { select: { mathematicians: true, referenceLinks: true, conceptLinks: true } }
      }
    })
  ]);

  const scoredPeople: Scored<FrisePerson>[] = people.flatMap(person => {
    const period = mathematicianPeriod(person, currentYear);
    if (!period) return [];
    const translation = localizedTranslation(person.translations, locale);
    const name = translation?.displayName ?? person.name;
    const related = person.translations.reduce((sum, item) => sum + item._count.relatedItems, 0);
    const links = person._count.conceptLinks + person._count.problemLinks + person._count.works;
    const score = (person.featuredOnTimeline ? EDITOR_CHOICE : 0)
      + (person.portraitUrl ? 4 : 0)
      + (person.translations.some(item => item.teaser.trim()) ? 2 : 0)
      + Math.min(person._count.milestoneLinks, 5) * 3
      + Math.min(related + links, 12)
      + person.translations.length;
    return [{ slug: person.slug, name, short: friseName(name, translation?.sortName), from: period.from, to: period.to, lifespan: person.lifespan, score }];
  });

  const scoredMilestones: Scored<FriseMilestone>[] = milestones.map(item => {
    const translation = localizedTranslation(item.translations, locale);
    const score = (item.featuredOnTimeline ? EDITOR_CHOICE : 0)
      + (item.imageUrl ? 2 : 0)
      + Math.min(item._count.mathematicians, 5) * 2
      + Math.min(item._count.referenceLinks + item._count.conceptLinks, 6)
      + item.translations.length;
    return {
      slug: item.slug, sortYear: item.sortYear, endYear: item.endYear, period: item.milestoneType === "PERIOD" && item.endYear != null,
      title: translation?.title ?? item.slug, dateLabel: translation?.yearLabel ?? String(item.sortYear), typeLabel: milestoneTypeLabel(item.milestoneType, locale), score
    };
  });
  return { people: scoredPeople, milestones: scoredMilestones };
});

const byScore = <T extends { score: number }>(start: (item: T) => number) => (a: T, b: T) => b.score - a.score || start(a) - start(b);

function best<T extends { score: number }>(items: T[], count: number, start: (item: T) => number) {
  return [...items].sort(byScore(start)).slice(0, count);
}

/** The overview of the home page: the same number of entries in every era, and the size of each era. */
export function selectFriseOverview(candidates: Awaited<ReturnType<typeof libraryFriseCandidates>>, eras: LibraryEraView[], limits = { people: 8, events: 6, periods: 3 }) {
  const totals: FriseTotals = Object.fromEntries(eras.map(era => [era.slug, { people: 0, milestones: 0 }]));
  const people = new Map<string, Scored<FrisePerson>[]>(), events = new Map<string, Scored<FriseMilestone>[]>(), periods = new Map<string, Scored<FriseMilestone>[]>();
  const add = <T>(map: Map<string, T[]>, slug: string, item: T) => {
    const list = map.get(slug);
    if (list) list.push(item);
    else map.set(slug, [item]);
  };
  for (const person of candidates.people) {
    const era = libraryEraOfPeriod(eras, person.from, person.to);
    if (!era) continue;
    for (const matched of eras) if (overlapsLibraryEra(eras, matched, person.from, person.to)) totals[matched.slug].people += 1;
    add(people, era.slug, person);
  }
  for (const item of candidates.milestones) {
    const era = libraryEraOfPeriod(eras, item.sortYear, item.period ? item.endYear : item.sortYear);
    if (!era) continue;
    for (const matched of eras) if (overlapsLibraryEra(eras, matched, item.sortYear, item.period ? item.endYear ?? item.sortYear : item.sortYear)) totals[matched.slug].milestones += 1;
    add(item.period ? periods : events, era.slug, item);
  }
  return {
    totals,
    people: eras.flatMap(era => best(people.get(era.slug) ?? [], limits.people, person => person.from)),
    milestones: eras.flatMap(era => [
      ...best(periods.get(era.slug) ?? [], limits.periods, item => item.sortYear),
      ...best(events.get(era.slug) ?? [], limits.events, item => item.sortYear)
    ])
  };
}

/** One era seen up close: everything that overlaps it, up to generous limits. */
export function selectFriseEra(candidates: Awaited<ReturnType<typeof libraryFriseCandidates>>, era: LibraryEraView, eras: LibraryEraView[], limits = { people: 40, events: 30, periods: 6 }) {
  const overlaps = (from: number, to: number) => overlapsLibraryEra(eras, era, from, to);
  const people = candidates.people.filter(person => overlaps(person.from, person.to));
  const periods = candidates.milestones.filter(item => item.period && overlaps(item.sortYear, item.endYear ?? item.sortYear));
  const events = candidates.milestones.filter(item => !item.period && overlaps(item.sortYear, item.sortYear));
  return {
    totals: { people: people.length, milestones: periods.length + events.length },
    people: best(people, limits.people, person => person.from),
    milestones: [...best(periods, limits.periods, item => item.sortYear), ...best(events, limits.events, item => item.sortYear)]
  };
}
