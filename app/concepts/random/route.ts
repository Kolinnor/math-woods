import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const concepts = await prisma.concept.findMany({
    where: { status: { not: "MISSING" } },
    select: { slug: true }
  });

  if (!concepts.length) {
    return NextResponse.redirect(new URL("/concepts", request.url));
  }
  const concept = concepts[Math.floor(Math.random() * concepts.length)];
  return NextResponse.redirect(new URL(`/concepts/${concept.slug}`, request.url));
}
