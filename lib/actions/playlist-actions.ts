"use server";

import { PlaylistNodeKind, TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureSlug } from "@/lib/slug";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

async function requirePlaylistEditor(playlistId: number) {
  const user = await requireUser();
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, slug: true, authorId: true }
  });

  if (!playlist) throw new Error("Playlist not found.");
  if (playlist.authorId !== user.id && user.role !== "MODERATOR" && user.role !== "ADMIN") {
    throw new Error("Only the playlist creator can edit this playlist.");
  }

  return { user, playlist };
}

export async function createPlaylistAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const descriptionMarkdown = String(formData.get("descriptionMarkdown") ?? "").trim();

  if (!title) throw new Error("Title is required.");

  const playlist = await prisma.playlist.create({
    data: {
      slug: await uniqueSlug("playlist", title),
      title,
      descriptionMarkdown,
      descriptionHtml: await renderMarkdownContent(descriptionMarkdown),
      authorId: user.id
    }
  });

  revalidatePath("/playlists");
  redirect(`/playlists/${playlist.slug}`);
}

export async function addProblemToPlaylistAction(playlistId: number, formData: FormData) {
  await requirePlaylistEditor(playlistId);
  const problemSlug = ensureSlug(String(formData.get("problemSlug") ?? ""));
  const problem = await prisma.problem.findUnique({ where: { slug: problemSlug } });

  if (!problem) throw new Error("Problem not found.");

  const last = await prisma.playlistItem.findFirst({
    where: { playlistId },
    orderBy: { position: "desc" }
  });

  await prisma.playlistItem.upsert({
    where: {
      playlistId_problemId: {
        playlistId,
        problemId: problem.id
      }
    },
    update: {},
    create: {
      playlistId,
      problemId: problem.id,
      position: (last?.position ?? 0) + 1,
      noteMarkdown: String(formData.get("noteMarkdown") ?? "").trim() || null
    }
  });

  revalidatePath("/playlists");
}

export async function votePlaylistAction(playlistId: number) {
  const user = await requireUser();

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.PLAYLIST,
        targetId: playlistId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.PLAYLIST,
      targetId: playlistId,
      voteType: VoteType.UP
    }
  });

  revalidatePath("/playlists");
}

export async function togglePlaylistFollowAction(playlistId: number, playlistSlug: string) {
  const user = await requireUser();
  const key = { userId: user.id, playlistId };
  const existing = await prisma.playlistFollow.findUnique({
    where: { userId_playlistId: key }
  });

  if (existing) {
    await prisma.playlistFollow.delete({ where: { userId_playlistId: key } });
  } else {
    await prisma.playlistFollow.create({ data: key });
  }

  revalidatePath(`/playlists/${playlistSlug}`);
  revalidatePath("/playlists");
}

export async function addPlaylistNodeAction(playlistId: number, playlistSlug: string, formData: FormData) {
  await requirePlaylistEditor(playlistId);
  const rawKind = String(formData.get("kind") ?? "NOTE");
  const kind = rawKind in PlaylistNodeKind ? (rawKind as PlaylistNodeKind) : PlaylistNodeKind.NOTE;
  const title = String(formData.get("title") ?? "").trim();
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  const wantsStart = formData.get("isStart") === "on";
  const [last, existingCount] = await Promise.all([
    prisma.playlistNode.findFirst({
      where: { playlistId },
      orderBy: { position: "desc" }
    }),
    prisma.playlistNode.count({ where: { playlistId } })
  ]);

  const problemSlug = ensureSlug(String(formData.get("problemSlug") ?? ""));
  const conceptSlug = ensureSlug(String(formData.get("conceptSlug") ?? ""));
  const problem =
    kind === PlaylistNodeKind.PROBLEM && problemSlug
      ? await prisma.problem.findUnique({ where: { slug: problemSlug } })
      : null;
  const concept =
    kind === PlaylistNodeKind.CONCEPT && conceptSlug
      ? await prisma.concept.findUnique({ where: { slug: conceptSlug } })
      : null;

  if (kind === PlaylistNodeKind.PROBLEM && !problem) throw new Error("Problem not found.");
  if (kind === PlaylistNodeKind.CONCEPT && !concept) throw new Error("Concept not found.");
  if (kind === PlaylistNodeKind.NOTE && !title) throw new Error("Notes need a title.");

  const isStart = wantsStart || existingCount === 0;
  if (isStart) {
    await prisma.playlistNode.updateMany({
      where: { playlistId },
      data: { isStart: false }
    });
  }

  await prisma.playlistNode.create({
    data: {
      playlistId,
      kind,
      problemId: problem?.id ?? null,
      conceptId: concept?.id ?? null,
      title: title || problem?.title || concept?.title || "Untitled step",
      bodyMarkdown: bodyMarkdown || null,
      bodyHtml: bodyMarkdown ? await renderMarkdownContent(bodyMarkdown) : null,
      position: (last?.position ?? 0) + 1,
      isStart
    }
  });

  revalidatePath(`/playlists/${playlistSlug}`);
}

export async function addPlaylistChoiceAction(playlistId: number, playlistSlug: string, formData: FormData) {
  await requirePlaylistEditor(playlistId);
  const fromNodeId = Number(formData.get("fromNodeId"));
  const toNodeId = Number(formData.get("toNodeId"));
  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(fromNodeId) || !Number.isInteger(toNodeId)) throw new Error("Invalid circuit step.");
  if (!label) throw new Error("Choice label is required.");
  if (fromNodeId === toNodeId) throw new Error("A choice must point to another step.");

  const nodes = await prisma.playlistNode.findMany({
    where: { playlistId, id: { in: [fromNodeId, toNodeId] } },
    select: { id: true }
  });
  if (nodes.length !== 2) throw new Error("Both steps must belong to this playlist.");

  const last = await prisma.playlistChoice.findFirst({
    where: { fromNodeId },
    orderBy: { position: "desc" }
  });

  await prisma.playlistChoice.create({
    data: {
      fromNodeId,
      toNodeId,
      label,
      note: note || null,
      position: (last?.position ?? 0) + 1
    }
  });

  revalidatePath(`/playlists/${playlistSlug}`);
}
