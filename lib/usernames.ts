import type { Route } from "next";

export function normalizeUsernameLookup(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function usernameLookupFilter(value: string) {
  return {
    equals: normalizeUsernameLookup(value),
    mode: "insensitive" as const
  };
}

export function publicProfileLookupWhere(value: string) {
  const filter = usernameLookupFilter(value);
  return {
    OR: [
      { profileSlug: filter },
      { username: filter }
    ]
  };
}

export function profilePath(user: { profileSlug: string }, suffix = ""): Route {
  return `/profile/${encodeURIComponent(user.profileSlug)}${suffix}` as Route;
}
