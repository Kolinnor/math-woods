"use server";

import { PlaylistNodeKind, TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { canDeletePlaylist, canEditPlaylist } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

async function requirePlaylistEditor(playlistId: number, requireVerified = false) {
  const user = requireVerified ? await requireVerifiedUser() : await requireUser();
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, slug: true, authorId: true }
  });

  if (!playlist) throw new Error("Playlist not found.");
  if (!canEditPlaylist(user, playlist)) {
    throw new Error("Only the playlist creator can edit this playlist.");
  }

  return { user, playlist };
}

export async function createPlaylistAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`playlist:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const descriptionMarkdown = boundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.markdown,
    "Playlist description"
  );

  const playlist = await prisma.playlist.create({
    data: {
      slug: await uniqueSlug("playlist", title),
      language,
      title,
      descriptionMarkdown,
      descriptionHtml: await renderMarkdownContent(descriptionMarkdown),
      authorId: user.id
    }
  });

  revalidatePath("/playlists");
  redirect(`/playlists/${playlist.slug}`);
}

export async function deletePlaylistAction(playlistId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`playlist:delete:${user.id}`, 10, 60_000);

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, slug: true, authorId: true }
  });
  if (!playlist) throw new Error("Playlist not found.");
  if (!canDeletePlaylist(user, playlist)) {
    throw new Error("You cannot delete this playlist.");
  }

  await prisma.playlist.delete({
    where: { id: playlist.id }
  });

  revalidatePath("/");
  revalidatePath("/playlists");
  revalidatePath(`/playlists/${playlist.slug}`);
  revalidatePath(`/playlists/${playlist.slug}/start`);
  revalidatePath(`/playlists/${playlist.slug}/edit`);
  redirect("/playlists");
}

export async function addProblemToPlaylistAction(playlistId: number, formData: FormData) {
  const { user, playlist } = await requirePlaylistEditor(playlistId, true);
  await assertRateLimit(`playlist:item:${user.id}`, 30, 60_000);
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
      noteMarkdown: boundedText(formData.get("noteMarkdown"), CONTENT_LIMITS.longNote, "Playlist item note") || null
    }
  });

  revalidatePath("/playlists");
  revalidatePath(`/playlists/${playlist.slug}`);
  revalidatePath(`/playlists/${playlist.slug}/start`);
  revalidatePath(`/playlists/${playlist.slug}/edit`);
}

export async function votePlaylistAction(playlistId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { slug: true }
  });
  const key = {
    userId: user.id,
    targetType: TargetType.PLAYLIST,
    targetId: playlistId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
  }

  revalidatePath("/playlists");
  if (playlist) revalidatePath(`/playlists/${playlist.slug}`);
}

export async function togglePlaylistFollowAction(playlistId: number, playlistSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`playlist-follow:${user.id}`, 60, 60_000);
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
  const { user } = await requirePlaylistEditor(playlistId, true);
  await assertRateLimit(`playlist:node:${user.id}`, 30, 60_000);
  const rawKind = String(formData.get("kind") ?? "NOTE");
  const kind = rawKind in PlaylistNodeKind ? (rawKind as PlaylistNodeKind) : PlaylistNodeKind.NOTE;
  const title = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Step title");
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Step note");
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
  revalidatePath(`/playlists/${playlistSlug}/start`);
  revalidatePath(`/playlists/${playlistSlug}/edit`);
}

export async function addPlaylistChoiceAction(playlistId: number, playlistSlug: string, formData: FormData) {
  const { user } = await requirePlaylistEditor(playlistId, true);
  await assertRateLimit(`playlist:choice:${user.id}`, 60, 60_000);
  const fromNodeId = Number(formData.get("fromNodeId"));
  const toNodeId = Number(formData.get("toNodeId"));
  const label = boundedText(formData.get("label"), CONTENT_LIMITS.shortText, "Choice label");
  const note = boundedText(formData.get("note"), CONTENT_LIMITS.longNote, "Choice note");

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
  revalidatePath(`/playlists/${playlistSlug}/start`);
  revalidatePath(`/playlists/${playlistSlug}/edit`);
}
