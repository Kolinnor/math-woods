import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookie, finishOAuthCallback, oauthAppUrl, parseOAuthProvider } from "@/lib/oauth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const provider = parseOAuthProvider((await params).provider);
  if (!provider) return NextResponse.redirect(oauthAppUrl("/login?oauthError=provider"));
  try {
    const destination = await finishOAuthCallback(provider, request.nextUrl);
    return NextResponse.redirect(oauthAppUrl(destination));
  } catch (error) {
    console.error("OAuth callback failed", provider, error);
    await clearOAuthCookie();
    return NextResponse.redirect(oauthAppUrl("/login?oauthError=failed"));
  }
}
