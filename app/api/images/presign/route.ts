import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildImageObjectKey,
  createPresignedImageUpload,
  getImageStorageConfig,
  validateImageUploadInput
} from "@/lib/image-storage";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

const MAX_REQUEST_BODY_BYTES = 8_000;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headerStore = await headers();
  const contentLength = Number(headerStore.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Request body is too large." }, { status: 413 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isVerifiedContributor(user)) {
    return NextResponse.json({ ok: false, error: "Email verification is required before uploading images." }, { status: 403 });
  }

  try {
    await assertRateLimit(`image-upload:${user.id}`, 30, 10 * 60_000);
  } catch {
    return NextResponse.json({ ok: false, error: "Too many upload requests. Please wait a moment." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const config = getImageStorageConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  }

  try {
    const upload = validateImageUploadInput(body);
    const key = buildImageObjectKey({ userId: user.id, filename: upload.filename, contentType: upload.contentType });
    return NextResponse.json({
      ok: true,
      upload: createPresignedImageUpload(config, key, upload.contentType)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid image upload request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
