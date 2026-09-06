export const EDITOR_DRAFT_COOKIE = "mw-editor-saved";
export type EditorDraftReceipt = { key: string; token: string };

export function parseEditorDraftReceipt(value: unknown): EditorDraftReceipt | null {
  if (!value || typeof value !== "object") return null;
  const { key, token } = value as Partial<EditorDraftReceipt>;
  return typeof key === "string" && key.length <= 160 && /^math-woods-(?:markdown|text-field)-draft:(?:concept|problem):\d+:[a-z-]{1,50}$/.test(key)
    && typeof token === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(token) ? { key, token } : null;
}

// Called before the browser serializes the form. No content is put in cookies.
export function markEditorDraftSubmission(form: HTMLFormElement, key: string, value: string) {
  try {
    for (const input of form.querySelectorAll<HTMLInputElement>('input[name="editorDraftReceipt"]')) {
      if (input.dataset.draftKey === key) input.remove();
    }
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!draft || draft.value !== value) return;
    const receipt = parseEditorDraftReceipt({ key, token: crypto.randomUUID() });
    if (!receipt) return;
    localStorage.setItem(key, JSON.stringify({ ...draft, token: receipt.token }));
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "editorDraftReceipt";
    input.dataset.draftKey = key;
    input.value = JSON.stringify(receipt);
    form.appendChild(input);
  } catch { /* Unavailable storage must never block submission. */ }
}

export function clearAcknowledgedEditorDrafts() {
  try {
    const cookie = document.cookie.split(/;\s*/).find(item => item.startsWith(`${EDITOR_DRAFT_COOKIE}=`));
    if (!cookie) return;
    const receipts: unknown = JSON.parse(decodeURIComponent(cookie.slice(EDITOR_DRAFT_COOKIE.length + 1)));
    if (!Array.isArray(receipts)) return;
    for (const value of receipts.slice(0, 8)) {
      const receipt = parseEditorDraftReceipt(value);
      if (!receipt) continue;
      const draft = JSON.parse(localStorage.getItem(receipt.key) ?? "null");
      // Edits made after submission have a different token (or no token).
      if (draft?.token === receipt.token) localStorage.removeItem(receipt.key);
    }
    document.cookie = `${EDITOR_DRAFT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch { /* Preserve drafts if the receipt cannot be read. */ }
}
