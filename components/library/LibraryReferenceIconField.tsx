"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";

type UploadResponse = { image?: { publicUrl?: string }; error?: string };

export function LibraryReferenceIconField({ locale, title, initialUrl, initialSize = 40 }: { locale: "en" | "fr"; title: string; initialUrl?: string | null; initialSize?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [iconUrl, setIconUrl] = useState(initialUrl ?? "");
  const [iconSize, setIconSize] = useState(Math.min(288, Math.max(24, initialSize)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fr = locale === "fr";

  async function upload(file: File) {
    setBusy(true);
    setMessage(fr ? "Téléversement…" : "Uploading…");
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/images/upload", { method: "POST", body: formData });
      const result = await response.json().catch(() => null) as UploadResponse | null;
      if (!response.ok) throw new Error(imageUploadResponseError(response.status, result));
      if (!result?.image?.publicUrl) throw new Error("The upload service did not return an image URL.");
      setIconUrl(result.image.publicUrl);
      setMessage(fr ? "Pictogramme téléversé." : "Pictogram uploaded.");
    } catch (error) {
      setMessage(imageUploadNetworkError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="library-reference-icon-field">
      <label><span>{fr ? "URL du pictogramme" : "Pictogram URL"}</span><input name="iconUrl" value={iconUrl} onChange={(event) => setIconUrl(event.target.value)} /></label>
      <input ref={inputRef} type="file" accept="image/avif,image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{busy ? (fr ? "Téléversement…" : "Uploading…") : (fr ? "Téléverser" : "Upload")}</button>
      <label><span>{fr ? `Taille du pictogramme : ${iconSize} px` : `Pictogram size: ${iconSize}px`}</span><input name="iconSize" type="range" min="24" max="288" step="2" value={iconSize} onChange={(event) => setIconSize(Number(event.target.value))} /></label>
      {message && <p role="status" className="muted text-sm">{message}</p>}
      <div className="library-reference-icon-preview"><span>{fr ? "Aperçu" : "Preview"}</span>{iconUrl && <img src={iconUrl} alt="" style={{ width: iconSize, height: iconSize }} />}<strong>{title || (fr ? "Titre de la référence" : "Reference title")}</strong></div>
    </div>
  );
}
