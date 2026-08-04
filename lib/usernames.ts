export function normalizeUsernameLookup(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function usernameLookupFilter(value: string) {
  return {
    equals: normalizeUsernameLookup(value),
    mode: "insensitive" as const
  };
}
