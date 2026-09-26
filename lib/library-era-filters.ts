import type { Prisma } from "@prisma/client";
import type { LibraryEraView } from "./library-display";

/** Outer eras also cover dates before/after the displayed timeline. */
export function libraryEraBounds(eras: LibraryEraView[], era: LibraryEraView) {
  return {
    from: era.slug === eras[0]?.slug ? null : era.startYear,
    to: era.slug === eras.at(-1)?.slug ? null : era.endYear
  };
}

export function overlapsLibraryEra(eras: LibraryEraView[], era: LibraryEraView, from: number, to: number) {
  const bounds = libraryEraBounds(eras, era);
  return (bounds.to === null || from <= bounds.to) && (bounds.from === null || to >= bounds.from);
}

export function milestoneEndYear(item: { sortYear: number; endYear: number | null; milestoneType: string }) {
  return item.milestoneType === "PERIOD" ? item.endYear ?? item.sortYear : item.sortYear;
}

/** Same interval intersection as the counters, applied before database pagination. */
export function historyEraWhere(eras: LibraryEraView[], era: LibraryEraView): Prisma.HistoryMilestoneWhereInput {
  const { from, to } = libraryEraBounds(eras, era);
  return { AND: [
    ...(to === null ? [] : [{ sortYear: { lte: to } }]),
    ...(from === null ? [] : [{ OR: [
      { sortYear: { gte: from } },
      { milestoneType: "PERIOD" as const, endYear: { gte: from } }
    ] }])
  ] };
}
