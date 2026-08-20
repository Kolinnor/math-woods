import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  defaultAvatarPath,
  parseAvatarBackground,
  parseDefaultAvatarPreset
} from "@/lib/avatar-presets";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildAvatarObjectKey,
  createPresignedImageDelete,
  createPresignedImageUpload,
  getImageStorageConfig,
  imageObjectKeyFromPublicUrl,
  IMAGE_UPLOAD_MAX_BYTES
} from "@/lib/image-storage";
import { assertRateLimit } from "@/lib/rate-limit";

const MAX_UPLOAD_BODY_BYTES = IMAGE_UPLOAD_MAX_BYTES + 16_000;
const AVATAR_SIZE = 512;
const ALLOWED_FORMATS = new Set(["avif", "jpeg", "png", "webp"]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    return NextResponse.json({ error: "Profile image must be smaller than 5 MB." }, { status: 413 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    await assertRateLimit(`avatar-upload:${user.id}`, 10, 60 * 60_000);
  } catch {
    return NextResponse.json({ error: "Too many profile image changes. Please try again later." }, { status: 429 });
  }

  const config = getImageStorageConfig();
  if (!config) return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload body." }, { status: 400 });
  }

  const avatar = formData.get("avatar");
  if (!(avatar instanceof File) || avatar.size <= 0 || avatar.size > IMAGE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "Choose a JPEG, PNG, WebP, or AVIF image smaller than 5 MB." }, { status: 400 });
  }

  try {
    const source = Buffer.from(await avatar.arrayBuffer());
    const image = sharp(source, { animated: false, limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, and AVIF images are supported." }, { status: 400 });
    }

    const output = await image
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();
    const key = buildAvatarObjectKey({ userId: user.id });
    const presigned = createPresignedImageUpload(config, key, "image/webp");
    const uploadBody = Uint8Array.from(output).buffer;
    const uploadResponse = await fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: uploadBody
    });

    if (!uploadResponse.ok) {
      return NextResponse.json({ error: "Image storage rejected the upload." }, { status: 502 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: presigned.publicUrl }
    });
    await deleteStoredAvatar(config, user.id, user.avatarUrl, true);
    revalidateAvatarSurfaces(user.profileSlug);
    return NextResponse.json({ avatarUrl: presigned.publicUrl });
  } catch {
    return NextResponse.json({ error: "This image could not be read. Try another file." }, { status: 400 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    await assertRateLimit(`avatar-upload:${user.id}`, 10, 60 * 60_000);
  } catch {
    return NextResponse.json({ error: "Too many profile image changes. Please try again later." }, { status: 429 });
  }

  const config = getImageStorageConfig();
  if (!config) return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  const deleted = await deleteStoredAvatar(config, user.id, user.avatarUrl);
  if (!deleted) return NextResponse.json({ error: "Profile image could not be removed from storage." }, { status: 502 });

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  revalidateAvatarSurfaces(user.profileSlug);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    await assertRateLimit(`avatar-background:${user.id}`, 30, 60 * 60_000);
  } catch {
    return NextResponse.json({ error: "Too many profile image changes. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { background?: unknown; preset?: unknown } | null;
  const avatarBackground = parseAvatarBackground(body?.background);
  if (!avatarBackground) {
    return NextResponse.json({ error: "Choose one of the available background colors." }, { status: 400 });
  }
  const avatarPreset = body?.preset === undefined ? null : parseDefaultAvatarPreset(body.preset);
  if (body?.preset !== undefined && !avatarPreset) {
    return NextResponse.json({ error: "Choose one of the available Math Woods avatars." }, { status: 400 });
  }
  const avatarUrl = avatarPreset ? defaultAvatarPath(avatarPreset) : user.avatarUrl;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarBackground,
      ...(avatarPreset ? { avatarUrl } : {})
    }
  });
  if (avatarPreset) {
    const config = getImageStorageConfig();
    if (config) await deleteStoredAvatar(config, user.id, user.avatarUrl, true);
  }
  revalidateAvatarSurfaces(user.profileSlug);
  return NextResponse.json({ avatarBackground, avatarUrl });
}

async function deleteStoredAvatar(
  config: NonNullable<ReturnType<typeof getImageStorageConfig>>,
  userId: number,
  avatarUrl: string | null,
  bestEffort = false
) {
  if (!avatarUrl) return true;
  const key = imageObjectKeyFromPublicUrl(config, avatarUrl);
  if (!key || !key.startsWith(`avatars/user-${userId}/`)) return true;

  try {
    const presigned = createPresignedImageDelete(config, key);
    const response = await fetch(presigned.url, { method: presigned.method });
    return response.ok || bestEffort;
  } catch {
    return bestEffort;
  }
}

function revalidateAvatarSurfaces(profileSlug: string) {
  revalidatePath(`/profile/${profileSlug}`);
  revalidatePath(`/profile/${profileSlug}/edit`);
  revalidatePath("/users");
  revalidatePath("/friends");
  revalidatePath("/notifications");
}
