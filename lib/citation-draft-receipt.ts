import { cookies } from "next/headers";
import { EDITOR_DRAFT_COOKIE, parseEditorDraftReceipt } from "@/lib/editor-draft-receipts";

export async function acknowledgeCitationDraft(formData: FormData) {
  // All callers run this only after a successful content save or proposal.
  const editorReceipts = formData.getAll("editorDraftReceipt").slice(0, 8).flatMap(value => {
    try {
      const receipt = typeof value === "string" && value.length < 400 ? parseEditorDraftReceipt(JSON.parse(value)) : null;
      return receipt ? [receipt] : [];
    } catch { return []; }
  });
  if (editorReceipts.length) {
    (await cookies()).set(EDITOR_DRAFT_COOKIE, JSON.stringify(editorReceipts), {
      path: "/", sameSite: "lax", maxAge: 600, httpOnly: false
    });
  }
  const key = String(formData.get("citationDraftKey") ?? "");
  const token = String(formData.get("citationDraftToken") ?? "");
  if (!/^mw-citations:[a-zA-Z0-9:_-]{1,160}$/.test(key) || !/^[a-zA-Z0-9-]{1,100}$/.test(token)) return;
  (await cookies()).set("mw-citation-saved", JSON.stringify({ key, token }), {
    path: "/", sameSite: "lax", maxAge: 600, httpOnly: false
  });
}
