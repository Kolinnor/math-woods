import { LibraryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PermissionUser } from "@/lib/permissions";

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

export async function libraryFormOptions() {
  const [mathematicians, references, concepts, problems] = await Promise.all([
    prisma.mathematician.findMany({
      where: { status: LibraryStatus.PUBLISHED },
      select: { id: true, name: true },
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
  return { mathematicians, references, concepts, problems };
}
