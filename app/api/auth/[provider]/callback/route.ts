import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookie, finishOAuthCallback, parseOAuthProvider } from "@/lib/oauth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const provider = parseOAuthProvider((await params).provider);
  if (!provider) return NextResponse.redirect(new URL("/login?oauthError=provider", request.url));
  try {
    const destination = await finishOAuthCallback(provider, request.nextUrl);
    return NextResponse.redirect(new URL(destination, request.url));
  } catch (error) {
    console.error("OAuth callback failed", provider, error);
    await clearOAuthCookie();
    return NextResponse.redirect(new URL("/login?oauthError=failed", request.url));
  }
}
