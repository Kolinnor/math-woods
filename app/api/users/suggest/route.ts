import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rankSearchMatches } from "@/lib/search-ranking";
import { displayNameForUser } from "@/lib/user-display";

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
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarBackground: true,
      avatarUrl: true
    },
    orderBy: { username: "asc" },
    take: 100
  });

  const users = rankSearchMatches(
    matches.map((user) => ({
      ...user,
      title: displayNameForUser(user),
      slug: user.username
    })),
    query
  ).slice(0, 20);

  return NextResponse.json({
    users: users.map((user) => ({
      name: user.title,
      username: user.username,
      avatarBackground: user.avatarBackground,
      avatarUrl: user.avatarUrl
    }))
  });
}
