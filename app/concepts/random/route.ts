import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: path }
  });
}

export async function GET() {
  const concepts = await prisma.concept.findMany({
    where: { status: { not: "MISSING" } },
    select: { slug: true }
  });

  if (!concepts.length) {
    return redirectTo("/concepts");
  }
  const concept = concepts[Math.floor(Math.random() * concepts.length)];
  return redirectTo(`/concepts/${concept.slug}`);
}
