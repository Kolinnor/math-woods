import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_LIBRARY_ERAS, libraryEraRange, resolveLibraryEras } from "@/lib/library-display";

/** The eras of the library, ordered by start year (the defaults while none are stored). */
export const getLibraryEras = cache(async () => {
  const rows = await prisma.libraryEra.findMany({ orderBy: { startYear: "asc" } });
  return resolveLibraryEras(rows.length ? rows : DEFAULT_LIBRARY_ERAS, new Date().getFullYear());
});

/** Presets of the mathematician period filter, one per era. */
export function libraryEraPresets(eras: Awaited<ReturnType<typeof getLibraryEras>>, minimumYear: number) {
  return eras.map((era, index) => {
    const last = index === eras.length - 1;
    return {
      value: era.slug, from: index === 0 ? Math.min(era.startYear, minimumYear) : era.startYear, to: era.endYear,
      fr: `${era.name.fr} (${libraryEraRange(era, "fr", last)})`, en: `${era.name.en} (${libraryEraRange(era, "en", last)})`
    };
  });
}
