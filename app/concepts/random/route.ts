import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pickRandomDifferent } from "@/lib/random-content";
import { getPreferredContentLanguage } from "@/lib/server-language";

const LAST_RANDOM_CONCEPT_COOKIE = "mw_last_random_concept";

function redirectTo(path: string, request: NextRequest, selectedSlug?: string) {
  const response = new NextResponse(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Location: path
    }
  });
  if (selectedSlug) {
    response.cookies.set(LAST_RANDOM_CONCEPT_COOKIE, selectedSlug, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:"
    });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const language = await getPreferredContentLanguage();
  const concepts = await prisma.concept.findMany({
    where: { status: { not: "MISSING" }, language },
    select: { slug: true }
  });

  if (!concepts.length) {
    return redirectTo("/concepts", request);
  }
  const previousSlug = request.cookies.get(LAST_RANDOM_CONCEPT_COOKIE)?.value;
  const concept = pickRandomDifferent(concepts, concepts.find((item) => item.slug === previousSlug));
  if (!concept) return redirectTo("/concepts", request);
  return redirectTo(`/concepts/${concept.slug}`, request, concept.slug);
}
