"use server";

import { PostType, SourceType, TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { discussionIsUnlocked, unlockDate } from "@/lib/attempts";
import { prisma } from "@/lib/db";
import { parseMathDomain } from "@/lib/domains";
import { syncInternalLinks } from "@/lib/internal-links";
import { parseContentLicense } from "@/lib/licenses";
import { parseProblemDifficulty, tagsWithConjecture } from "@/lib/problems";
import { parseContributorQualityStatus } from "@/lib/quality";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { syncProblemTags } from "@/lib/tags";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createProblemAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domain = parseMathDomain(formData.get("domain"));
  const origin = String(formData.get("origin") ?? "").trim() || "Unknown";
  const originChapter = String(formData.get("originChapter") ?? "").trim() || null;
  const originPage = String(formData.get("originPage") ?? "").trim() || null;
  const originNote = String(formData.get("originNote") ?? "").trim() || null;
  const license = parseContentLicense(formData.get("license"));
  const listed = formData.get("listed") === "on";
  const addToPlaylistSlug = ensureSlug(String(formData.get("addToPlaylistSlug") ?? ""), "");
  const qualityStatus = parseContributorQualityStatus(formData.get("qualityStatus"), user.role);
  const tags = tagsWithConjecture(String(formData.get("tags") ?? ""), formData.get("conjecture"));
  const proofMarkdown = String(formData.get("proofMarkdown") ?? "").trim();

  if (!title || !bodyMarkdown) throw new Error("Title and statement are required.");

  const slug = await uniqueSlug("problem", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problem.create({
      data: {
        slug,
        title,
        bodyMarkdown,
        bodyHtml,
        difficulty,
        domain,
        origin,
        originChapter,
        originPage,
        originNote,
        license,
        listed,
        qualityStatus,
        authorId: user.id,
        thread: { create: {} }
      }
    });
    if (addToPlaylistSlug) {
      const playlist = await tx.playlist.findUnique({
        where: { slug: addToPlaylistSlug },
        select: { id: true, authorId: true }
      });
      if (playlist && (playlist.authorId === user.id || user.role === "MODERATOR" || user.role === "ADMIN")) {
        const last = await tx.playlistItem.findFirst({
          where: { playlistId: playlist.id },
          orderBy: { position: "desc" }
        });
        await tx.playlistItem.create({
          data: {
            playlistId: playlist.id,
            problemId: created.id,
            position: (last?.position ?? 0) + 1
          }
        });
      }
    }
    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx);
    await syncProblemTags(created.id, tags, tx);
    if (proofMarkdown) {
      await tx.problemProof.create({
        data: {
          problemId: created.id,
          authorId: user.id,
          bodyMarkdown: proofMarkdown,
          bodyHtml: await renderMarkdownContent(proofMarkdown)
        }
      });
    }
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: created.id,
        markdown: bodyMarkdown,
        editedById: user.id,
        editSummary: "Problem created"
      }
    });
    return created;
  });

  revalidatePath("/");
  redirect(`/problems/${problem.slug}`);
}

export async function updateProblemAction(problemId: number, formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domain = parseMathDomain(formData.get("domain"));
  const origin = String(formData.get("origin") ?? "").trim() || "Unknown";
  const originChapter = String(formData.get("originChapter") ?? "").trim() || null;
  const originPage = String(formData.get("originPage") ?? "").trim() || null;
  const originNote = String(formData.get("originNote") ?? "").trim() || null;
  const license = parseContentLicense(formData.get("license"));
  const listed = formData.get("listed") === "on";
  const qualityStatus = parseContributorQualityStatus(formData.get("qualityStatus"), user.role);
  const tags = tagsWithConjecture(String(formData.get("tags") ?? ""), formData.get("conjecture"));
  const editSummary = String(formData.get("editSummary") ?? "").trim() || "Problem edited";

  if (!title || !bodyMarkdown) throw new Error("Title and statement are required.");

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const problem = await prisma.$transaction(async (tx) => {
    const updated = await tx.problem.update({
      where: { id: problemId },
      data: {
        title,
        bodyMarkdown,
        bodyHtml,
        difficulty,
        domain,
        origin,
        originChapter,
        originPage,
        originNote,
        license,
        listed,
        qualityStatus
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, updated.id, bodyMarkdown, tx);
    await syncProblemTags(updated.id, tags, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: updated.id,
        markdown: bodyMarkdown,
        editedById: user.id,
        editSummary
      }
    });

    return updated;
  });

  revalidatePath("/");
  revalidatePath(`/problems/${problem.slug}`);
  redirect(`/problems/${problem.slug}`);
}

export async function rollbackProblemRevisionAction(problemId: number, revisionId: number) {
  const user = await requireUser();
  const revision = await prisma.pageRevision.findFirst({
    where: {
      id: revisionId,
      pageType: SourceType.PROBLEM,
      pageId: problemId
    }
  });

  if (!revision) throw new Error("Revision not found.");

  const problem = await prisma.$transaction(async (tx) => {
    const current = await tx.problem.update({
      where: { id: problemId },
      data: {
        bodyMarkdown: revision.markdown,
        bodyHtml: await renderMarkdownContent(revision.markdown)
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, problemId, revision.markdown, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: problemId,
        markdown: revision.markdown,
        editedById: user.id,
        editSummary: `Rolled back to revision ${revision.id}`
      }
    });

    return current;
  });

  revalidatePath(`/problems/${problem.slug}`);
  redirect(`/problems/${problem.slug}`);
}

export async function startAttemptAction(problemId: number) {
  const user = await requireUser();
  const now = new Date();

  await prisma.problemAttempt.upsert({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    update: {},
    create: {
      userId: user.id,
      problemId,
      startedAt: now,
      discussionUnlockAt: unlockDate(now)
    }
  });

  revalidatePath("/problems");
}

export async function updatePrivateNotesAction(problemId: number, formData: FormData) {
  const user = await requireUser();
  const privateNotesMarkdown = String(formData.get("privateNotesMarkdown") ?? "");
  const status = String(formData.get("status") ?? "STARTED") as
    | "STARTED"
    | "BLOCKED"
    | "SOLVED"
    | "REVIEW_LATER";

  await prisma.problemAttempt.update({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    data: { privateNotesMarkdown, status }
  });

  revalidatePath("/problems");
}

export async function markProblemSolvedAction(problemId: number, problemSlug: string) {
  const user = await requireUser();
  const now = new Date();

  await prisma.problemAttempt.upsert({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    update: { status: "SOLVED" },
    create: {
      userId: user.id,
      problemId,
      startedAt: now,
      discussionUnlockAt: unlockDate(now),
      status: "SOLVED"
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
}

export async function toggleProblemFavoriteAction(problemId: number, problemSlug: string) {
  const user = await requireUser();
  const key = { userId: user.id, problemId };
  const existing = await prisma.problemFavorite.findUnique({
    where: { userId_problemId: key }
  });

  if (existing) {
    await prisma.problemFavorite.delete({ where: { userId_problemId: key } });
  } else {
    await prisma.problemFavorite.create({ data: key });
  }

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/profile/${user.username}`);
}

export async function createDiscussionPostAction(threadId: number, problemId: number, formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`post:${user.id}`, 12, 60_000);
  const attempt = await prisma.problemAttempt.findUnique({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    }
  });

  if (!attempt || !discussionIsUnlocked(attempt.discussionUnlockAt)) {
    throw new Error("The discussion is still locked for this user.");
  }

  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "COMMENT").toUpperCase();
  const type = Object.values(PostType).includes(typeInput as PostType) ? (typeInput as PostType) : PostType.COMMENT;
  if (!bodyMarkdown) throw new Error("Empty message.");

  await prisma.discussionPost.create({
    data: {
      threadId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      type
    }
  });

  revalidatePath("/problems");
}

export async function votePostAction(postId: number, problemSlug: string) {
  const user = await requireUser();

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.POST,
        targetId: postId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.POST,
      targetId: postId,
      voteType: VoteType.UP
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
}

export async function voteProblemAction(problemId: number) {
  const user = await requireUser();

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.PROBLEM,
        targetId: problemId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.PROBLEM,
      targetId: problemId,
      voteType: VoteType.UP
    }
  });

  revalidatePath("/problems");
}
