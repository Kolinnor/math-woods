import { NextRequest, NextResponse } from "next/server";
import { beginOAuth, parseOAuthProvider, safeReturnTo } from "@/lib/oauth";
import { assertRateLimit } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const provider = parseOAuthProvider((await params).provider);
  if (!provider) return NextResponse.redirect(new URL("/login?oauthError=provider", request.url));
  const mode = request.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"), mode === "link" ? "/settings" : "/");
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await assertRateLimit(`oauth-start:${forwarded}`, 20, 10 * 60_000);
    const authorizationUrl = await beginOAuth(provider, { mode, returnTo });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("OAuth start failed", provider, error);
    const destination = mode === "link" ? "/settings?oauth=failed" : "/login?oauthError=unavailable";
    return NextResponse.redirect(new URL(destination, request.url));
  }
}
