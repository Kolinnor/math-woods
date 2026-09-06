import { LibraryStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { mathematicianName, rankMathematicians } from "@/lib/mathematician-names";

export function visibleLibraryEntryWhere(user: PermissionUser | null) {
  if (user) return {
    OR: [
      { status: LibraryStatus.PUBLISHED },
      { createdById: user.id, status: { in: [LibraryStatus.DRAFT, LibraryStatus.PENDING_REVIEW, LibraryStatus.NEEDS_WORK] } }
    ]
  };
  return { status: LibraryStatus.PUBLISHED };
}

export function localizedTranslation<T extends { language: string }>(translations: T[], language: string) {
  return translations.find((item) => item.language === language)
    ?? translations.find((item) => item.language === "en")
    ?? translations.find((item) => item.language === "fr")
    ?? translations[0]
    ?? null;
}

export const libraryTranslationOrder = [{ language: "asc" as const }];

// The catalogue is small: match a compact name index in JS for consistent Unicode
// folding, without loading biographies or requiring a PostgreSQL extension.
export async function searchMathematicians(query: string, locale: string, where: Prisma.MathematicianWhereInput = { status: LibraryStatus.PUBLISHED }, similar = false) {
  const people = await prisma.mathematician.findMany({ where, select: {
    id: true, slug: true, name: true, aliases: true, lifespan: true, portraitUrl: true,
    translations: { select: { language: true, displayName: true, teaser: true } }
  } });
  return rankMathematicians(people, query, locale, similar);
}

export async function libraryFormOptions() {
  const locale = await getInterfaceLocale();
  const [mathematicians, references, concepts, problems] = await Promise.all([
    prisma.mathematician.findMany({
      where: { status: LibraryStatus.PUBLISHED },
      select: { id: true, name: true, translations: { select: { language: true, displayName: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.libraryReference.findMany({
      where: { status: LibraryStatus.PUBLISHED },
      select: { id: true, canonicalTitle: true },
      orderBy: { canonicalTitle: "asc" }
    }),
    prisma.concept.findMany({
      where: { canAppearInConceptBrowser: true },
      select: { id: true, title: true },
      orderBy: { title: "asc" }
    }),
    prisma.problem.findMany({
      where: { listed: true, status: "PUBLISHED" },
      select: { id: true, title: true },
      orderBy: { title: "asc" }
    })
  ]);
  return { mathematicians: rankMathematicians(mathematicians, "", locale).map(person => ({ id: person.id, name: mathematicianName(person, locale) })), references, concepts, problems };
}
