import { developmentImageStorageEnabled, readDevelopmentImage } from "@/lib/development-image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (!developmentImageStorageEnabled(request.url)) return new Response(null, { status: 404 });
  const { filename } = await params;
  const image = await readDevelopmentImage(filename);
  if (!image) return new Response(null, { status: 404 });
  return new Response(Uint8Array.from(image.body), { headers: {
    "Content-Type": image.contentType,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff"
  } });
}
