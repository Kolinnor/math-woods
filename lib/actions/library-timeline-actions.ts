"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasTrustedPrivileges } from "@/lib/permissions";

/**
 * Puts an entry on the timeline of the library home page, or takes it off. The flag is written
 * without touching `updatedAt`, so that a form open on the same entry can still be saved.
 */
export async function setTimelineFeaturedAction(entity: "mathematician" | "milestone", id: number, featured: boolean) {
  const user = await requireAdmin();
  if (!hasTrustedPrivileges(user.role)) throw new Error("You cannot choose the entries of the timeline.");
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid entry.");
  const rows = entity === "mathematician"
    ? await prisma.$queryRaw<{ slug: string }[]>`UPDATE "Mathematician" SET "featuredOnTimeline" = ${featured} WHERE "id" = ${id} RETURNING "slug"`
    : await prisma.$queryRaw<{ slug: string }[]>`UPDATE "HistoryMilestone" SET "featuredOnTimeline" = ${featured} WHERE "id" = ${id} RETURNING "slug"`;
  const slug = rows[0]?.slug;
  if (!slug) throw new Error("This entry no longer exists.");
  const section = entity === "mathematician" ? "mathematicians" : "history";
  revalidatePath("/library");
  revalidatePath("/library/history");
  revalidatePath(`/library/${section}/${slug}`);
  revalidatePath(`/library/${section}/${slug}/edit`);
}
