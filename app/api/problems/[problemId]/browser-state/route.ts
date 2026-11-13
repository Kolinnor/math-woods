import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ProblemVerificationMode } from "@prisma/client";
import {
  markProblemSolvedAction,
  startAttemptAction,
  toggleProblemFavoriteAction,
  unmarkProblemAttemptAction,
  unmarkProblemSolvedAction
} from "@/lib/actions/problem-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LIKE_PROMPT_COOKIE } from "@/lib/problem-like-prompt";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const OPERATIONS = new Set(["solve", "unsolve", "attempt", "unattempt", "favorite"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) {
    return NextResponse.json({ error: "Email verification required." }, { status: 403 });
  }

  const { problemId: problemIdParam } = await params;
  const problemId = Number(problemIdParam);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  try {
    const body = await request.json() as { operation?: unknown };
    const operation = typeof body.operation === "string" ? body.operation : "";
    if (!OPERATIONS.has(operation)) {
      return NextResponse.json({ error: "Unknown problem operation." }, { status: 400 });
    }

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, authorId: true, slug: true, verificationMode: true, isConjecture: true }
    });
    if (!problem) return NextResponse.json({ error: "Problem not found." }, { status: 404 });

    if (operation === "solve" && problem.isConjecture) {
      return NextResponse.json(
        { error: "Conjectures cannot be marked as solved." },
        { status: 409 }
      );
    }

    if (
      operation === "solve" &&
      problem.authorId !== user.id &&
      problem.verificationMode !== ProblemVerificationMode.NONE
    ) {
      return NextResponse.json(
        { error: "This problem must be verified from its page." },
        { status: 409 }
      );
    }

    if (operation === "solve") await markProblemSolvedAction(problem.id, problem.slug);
    if (operation === "unsolve") await unmarkProblemSolvedAction(problem.id, problem.slug);
    if (operation === "attempt") await startAttemptAction(problem.id, problem.slug);
    if (operation === "unattempt") await unmarkProblemAttemptAction(problem.id, problem.slug);
    if (operation === "favorite") await toggleProblemFavoriteAction(problem.id, problem.slug);

    // The solve action queues the like invitation as a cookie for the problem page;
    // this client shows it inline instead, so hand it over and clear the cookie.
    let likePrompt = false;
    if (operation === "solve") {
      const cookieStore = await cookies();
      likePrompt = Boolean(cookieStore.get(LIKE_PROMPT_COOKIE)?.value);
      cookieStore.delete(LIKE_PROMPT_COOKIE);
    }

    return NextResponse.json({ ok: true, likePrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Problem state could not be updated.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Too many requests") ? 429 : 400 }
    );
  }
}
