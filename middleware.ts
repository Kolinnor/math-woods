import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_RETURN_TO_HEADER, requestReturnToPath } from "@/lib/auth-return";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    AUTH_RETURN_TO_HEADER,
    requestReturnToPath(request.nextUrl.pathname, request.nextUrl.search)
  );

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
