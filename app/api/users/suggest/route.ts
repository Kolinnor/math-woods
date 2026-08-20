import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rankSearchMatches } from "@/lib/search-ranking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ users: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const matches = await prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      deletedAt: null,
      OR: [
        { profileSlug: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      profileSlug: true,
      displayName: true,
      avatarBackground: true,
      avatarUrl: true
    },
    orderBy: { profileSlug: "asc" },
    take: 100
  });

  const users = rankSearchMatches(
    matches.map((user) => ({
      ...user,
      title: user.displayName?.trim() || user.profileSlug,
      slug: user.profileSlug
    })),
    query
  ).slice(0, 20);

  return NextResponse.json({
    users: users.map((user) => ({
      name: user.title,
      profileSlug: user.profileSlug,
      avatarBackground: user.avatarBackground,
      avatarUrl: user.avatarUrl
    }))
  });
}
