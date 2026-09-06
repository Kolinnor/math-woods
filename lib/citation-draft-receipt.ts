import { cookies } from "next/headers";

export async function acknowledgeCitationDraft(formData: FormData) {
  const key = String(formData.get("citationDraftKey") ?? "");
  const token = String(formData.get("citationDraftToken") ?? "");
  if (!/^mw-citations:[a-zA-Z0-9:_-]{1,160}$/.test(key) || !/^[a-zA-Z0-9-]{1,100}$/.test(token)) return;
  (await cookies()).set("mw-citation-saved", JSON.stringify({ key, token }), {
    path: "/", sameSite: "lax", maxAge: 600, httpOnly: false
  });
}
