import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canModerate } from "@/lib/roles";

export async function GET(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid hint." }, { status: 400 });

  const post = await prisma.discussionPost.findFirst({
    where: { id, type: "HINT", deletedAt: null },
    select: {
      authorId: true,
      bodyHtml: true,
      thread: {
        select: {
          problemId: true,
          problem: {
            select: { authorId: true }
          }
        }
      }
    }
  });

  if (!post) return NextResponse.json({ error: "Hint not found." }, { status: 404 });

  const canRevealWithoutAttempt =
    user.id === post.authorId || user.id === post.thread.problem.authorId || canModerate(user.role);

  if (!canRevealWithoutAttempt) {
    const attempt = await prisma.problemAttempt.findUnique({
      where: {
        userId_problemId: {
          userId: user.id,
          problemId: post.thread.problemId
        }
      },
      select: { id: true }
    });

    if (!attempt) {
      return NextResponse.json({ error: "This hint is not available yet." }, { status: 403 });
    }
  }

  return NextResponse.json({ html: post.bodyHtml });
}
