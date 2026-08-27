"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";

type UploadResponse = {
  image?: { publicUrl?: string };
  error?: string;
};

export function KnownProblemSourceIconField({
  initialValue,
  locale
}: {
  initialValue?: string | null;
  locale: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [iconUrl, setIconUrl] = useState(initialValue ?? "");
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
      const publicUrl = result?.image?.publicUrl;
      if (!publicUrl) throw new Error("The upload service did not return an image URL.");
      setIconUrl(publicUrl);
      setMessage(fr ? "Pictogramme téléversé. Enregistrez la source pour le conserver." : "Pictogram uploaded. Save the source to keep it.");
    } catch (error) {
      setMessage(imageUploadNetworkError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{fr ? "Pictogramme" : "Pictogram"}</span>
      <div className="flex flex-wrap items-center gap-3">
        {iconUrl && <img src={iconUrl} alt="" className="h-12 w-12 object-contain" />}
        <input
          name="iconUrl"
          value={iconUrl}
          maxLength={1200}
          placeholder="/icons/source.png"
          onChange={(event) => {
            setIconUrl(event.target.value);
            setMessage(null);
          }}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/avif,image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          {busy ? (fr ? "Téléversement…" : "Uploading…") : (fr ? "Téléverser" : "Upload")}
        </button>
      </div>
      <p className="muted text-sm">
        {fr ? "PNG, WebP, JPEG ou AVIF. Une image carrée et transparente fonctionne le mieux." : "PNG, WebP, JPEG, or AVIF. A square transparent image works best."}
      </p>
      {message && <p className="text-sm" role="status">{message}</p>}
    </div>
  );
}
