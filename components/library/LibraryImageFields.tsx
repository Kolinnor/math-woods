"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";

type UploadResponse = { image?: { publicUrl?: string }; error?: string };

export function LibraryImageFields({
  locale,
  values = {}
}: {
  locale: "en" | "fr";
  values?: { imageUrl?: string | null; imageAlt?: string | null; imageCredit?: string | null; imageCreditUrl?: string | null; imageLicense?: string | null };
}) {
  const fr = locale === "fr";
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(values.imageUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setImageUrl(result.image.publicUrl);
      setMessage(fr ? "Image téléversée." : "Image uploaded.");
    } catch (error) {
      setMessage(imageUploadNetworkError(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <details className="library-form-section">
      <summary>{fr ? "Image et crédit" : "Image and credit"}</summary>
      <div>
        <div className="library-form-grid">
          <label><span>{fr ? "URL de l’image" : "Image URL"}</span><input name="imageUrl" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
          <label><span>{fr ? "Description de l’image" : "Image description"}</span><input name="imageAlt" defaultValue={values.imageAlt ?? ""} /></label>
          <label><span>{fr ? "Crédit" : "Credit"}</span><input name="imageCredit" defaultValue={values.imageCredit ?? ""} /></label>
          <label><span>{fr ? "Lien du crédit" : "Credit URL"}</span><input name="imageCreditUrl" type="url" defaultValue={values.imageCreditUrl ?? ""} /></label>
          <label><span>{fr ? "Licence" : "License"}</span><input name="imageLicense" defaultValue={values.imageLicense ?? ""} /></label>
        </div>
        <input ref={inputRef} type="file" accept="image/avif,image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <div className="library-image-upload-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{busy ? (fr ? "Téléversement…" : "Uploading…") : (fr ? "Téléverser une image" : "Upload an image")}</button>
          {imageUrl && <button type="button" className="secondary" onClick={() => setImageUrl("")}><X size={16} />{fr ? "Retirer" : "Remove"}</button>}
        </div>
        {message && <p role="status" className="muted text-sm">{message}</p>}
        {imageUrl && <div className="library-image-upload-preview"><img src={imageUrl} alt="" /></div>}
      </div>
    </details>
  );
}
