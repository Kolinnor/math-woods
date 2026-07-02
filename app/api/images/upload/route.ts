import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildImageObjectKey,
  createPresignedImageUpload,
  getImageStorageConfig,
  IMAGE_UPLOAD_MAX_BYTES,
  validateImageUploadInput
} from "@/lib/image-storage";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

const MAX_UPLOAD_BODY_BYTES = IMAGE_UPLOAD_MAX_BYTES + 16_000;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Image upload is too large." }, { status: 413 });
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

  const config = getImageStorageConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload body." }, { status: 400 });
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ ok: false, error: "Image file is required." }, { status: 400 });
  }

  try {
    const upload = validateImageUploadInput({
      filename: image.name,
      contentType: image.type,
      sizeBytes: image.size
    });
    const key = buildImageObjectKey({ userId: user.id, filename: upload.filename, contentType: upload.contentType });
    const presigned = createPresignedImageUpload(config, key, upload.contentType);
    const response = await fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: Buffer.from(await image.arrayBuffer())
    });

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Image storage rejected the upload." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      image: {
        key: presigned.key,
        publicUrl: presigned.publicUrl
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid image upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
