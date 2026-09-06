"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function clearAcknowledgedCitationDraft() {
  try {
    const cookie = document.cookie.split("; ").find((item) => item.startsWith("mw-citation-saved="));
    if (!cookie) return;
    const receipt = JSON.parse(decodeURIComponent(cookie.slice("mw-citation-saved=".length)));
    if (typeof receipt.key !== "string" || !receipt.key.startsWith("mw-citations:")) return;
    const draft = JSON.parse(localStorage.getItem(receipt.key) ?? "null");
    if (draft?.token === receipt.token) localStorage.removeItem(receipt.key);
    document.cookie = "mw-citation-saved=; Max-Age=0; Path=/; SameSite=Lax";
  } catch { /* A disabled local store must not prevent editing. */ }
}

export function CitationDraftReceipt() {
  const pathname = usePathname();
  useEffect(clearAcknowledgedCitationDraft, [pathname]);
  return null;
}
