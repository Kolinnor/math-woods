import { safeReturnTo } from "./oauth-utils.ts";

export const AUTH_RETURN_TO_HEADER = "x-math-woods-return-to";

export function loginHrefForReturnTo(value: string | null | undefined) {
  const returnTo = safeReturnTo(value);
  return returnTo === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function requestReturnToPath(pathname: string, search: string) {
  const searchParams = new URLSearchParams(search);
  searchParams.delete("_rsc");
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
