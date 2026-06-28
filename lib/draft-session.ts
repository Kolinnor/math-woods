import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

const DRAFT_SESSION_KEY = "draft";
const DRAFT_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsWithDraft(searchParams: SearchParams) {
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === DRAFT_SESSION_KEY || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) nextParams.append(key, item);
    } else {
      nextParams.set(key, value);
    }
  }

  nextParams.set(DRAFT_SESSION_KEY, randomUUID());
  return nextParams.toString();
}

export function requireDraftSession(pathname: string, searchParams: SearchParams) {
  const draftSession = firstParam(searchParams[DRAFT_SESSION_KEY]);

  if (draftSession && DRAFT_SESSION_PATTERN.test(draftSession)) {
    return draftSession;
  }

  const target = `${pathname}?${searchParamsWithDraft(searchParams)}` as Parameters<typeof redirect>[0];
  redirect(target);
}
