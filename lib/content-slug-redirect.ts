import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AUTH_RETURN_TO_HEADER } from "@/lib/auth-return";

export function renamedContentHref(type: "concept" | "problem", oldSlug: string, newSlug: string, requestPath: string) {
  const prefix = `/${type}s/${encodeURIComponent(oldSlug)}`;
  const path = requestPath.startsWith(`${prefix}/`) || requestPath.startsWith(`${prefix}?`) || requestPath === prefix
    ? requestPath : prefix;
  return `/${type}s/${encodeURIComponent(newSlug)}${path.slice(prefix.length)}`;
}

export async function redirectHistoricalContentSlug(type: "concept" | "problem", slug: string, requestUrl?: string) {
  const target = type === "concept"
    ? (await prisma.conceptRedirect.findUnique({
        where: { sourceSlug: slug, isRename: true }, select: { targetConcept: { select: { slug: true } } }
      }))?.targetConcept
    : (await prisma.problemRedirect.findUnique({
        where: { sourceSlug: slug }, select: { targetProblem: { select: { slug: true } } }
      }))?.targetProblem;
  if (!target || target.slug === slug) return;
  const url = requestUrl ? new URL(requestUrl) : null;
  const path = url ? `${url.pathname}${url.search}` : (await headers()).get(AUTH_RETURN_TO_HEADER) ?? "";
  // A title can be restored later: a permanently cached redirect could then loop.
  redirect(renamedContentHref(type, slug, target.slug, path) as Route);
}
