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
import { objectStorageUploadError } from "@/lib/image-upload-errors";
import { processContentImage } from "@/lib/content-images";

const MAX_UPLOAD_BODY_BYTES = IMAGE_UPLOAD_MAX_BYTES + 16_000;
const TIP_IMAGE_MAX_DIMENSION = 960;

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

  let config: ReturnType<typeof getImageStorageConfig>;
  try {
    config = getImageStorageConfig();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Image storage configuration is invalid. Check the endpoint and public image URL." },
      { status: 503 }
    );
  }
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

  let upload: ReturnType<typeof validateImageUploadInput>;
  try {
    upload = validateImageUploadInput({
      filename: image.name,
      contentType: image.type,
      sizeBytes: image.size
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid image upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  let processedImage: Awaited<ReturnType<typeof processContentImage>>;
  try {
    processedImage = await processContentImage(
      image,
      formData.get("purpose") === "tip"
        ? { maxDimension: TIP_IMAGE_MAX_DIMENSION }
        : undefined
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The server could not process this image.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const key = buildImageObjectKey({
    userId: user.id,
    filename: upload.filename,
    contentType: processedImage.contentType
  });
  let presigned: ReturnType<typeof createPresignedImageUpload>;
  try {
    presigned = createPresignedImageUpload(config, key, processedImage.contentType);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Math Woods could not prepare the Object Storage request. Check the endpoint, region, and public image URL." },
      { status: 503 }
    );
  }
  let response: Response;
  try {
    response = await fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: Uint8Array.from(processedImage.body).buffer
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Math Woods could not connect to Object Storage. Check the storage endpoint and network access." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    return NextResponse.json({ ok: false, error: objectStorageUploadError(response.status, responseBody) }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    image: {
      key: presigned.key,
      publicUrl: presigned.publicUrl
    }
  });
}
