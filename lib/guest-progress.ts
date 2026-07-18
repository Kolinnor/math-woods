export const GUEST_PROGRESS_PROMPT_THRESHOLD = 3;

const RESERVED_CONTENT_SLUGS = new Set(["new", "random"]);

export function guestProgressContentKey(pathname: string, searchParams: URLSearchParams) {
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length === 2 &&
    (parts[0] === "problems" || parts[0] === "concepts") &&
    !RESERVED_CONTENT_SLUGS.has(parts[1])
  ) {
    return `${parts[0]}:${parts[1]}`;
  }

  if (parts.length === 3 && parts[0] === "explorations" && parts[2] === "start") {
    const page = searchParams.get("page")?.trim() || "start";
    return `exploration:${parts[1]}:${page}`;
  }

  return null;
}
