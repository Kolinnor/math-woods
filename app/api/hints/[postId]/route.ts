import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewArchivedProblem } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";

export async function GET(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const user = await getCurrentUser();
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid hint." }, { status: 400 });

  const post = await prisma.discussionPost.findFirst({
    where: { id, type: "HINT", deletedAt: null },
    select: {
      bodyHtml: true,
      thread: {
        select: {
          problem: {
            select: { authorId: true, qualityStatus: true, status: true }
          }
        }
      }
    }
  });

  if (!post) return NextResponse.json({ error: "Hint not found." }, { status: 404 });
  if (post.thread.problem.status === "ARCHIVED" && !canViewArchivedProblem(user, post.thread.problem)) {
    return NextResponse.json({ error: "Hint not found." }, { status: 404 });
  }
  if (!canViewProblem(user, post.thread.problem)) {
    return NextResponse.json({ error: "Hint not found." }, { status: 404 });
  }

  return NextResponse.json({ html: post.bodyHtml });
}
