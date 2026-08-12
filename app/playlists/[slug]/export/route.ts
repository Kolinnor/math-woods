import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!EXPLORATIONS_ENABLED) notFound();

  const { slug } = await params;
  return NextResponse.redirect(new URL(`/explorations/${slug}/export`, request.url));
}
