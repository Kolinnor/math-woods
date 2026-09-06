"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { imageUploadNetworkError, imageUploadResponseError } from "@/lib/image-upload-errors";

type UploadResponse = { image?: { publicUrl?: string }; error?: string };

export function LibraryImageFields({
  locale,
  portrait = false,
  values = {}
}: {
  locale: "en" | "fr";
  portrait?: boolean;
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

  const fields = (
      <div>
        <div className="library-form-grid">
          <label><span>{portrait ? "Portrait" : (fr ? "URL de l’image" : "Image URL")}</span><input name="imageUrl" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder={portrait ? (fr ? "Lien de l’image ou téléversement ci-dessous" : "Image URL or upload below") : undefined} /></label>
          {portrait && <label><span>{fr ? "Source du portrait" : "Portrait source"}</span><input name="imageCredit" maxLength={240} defaultValue={values.imageCredit ?? ""} placeholder={fr ? "Auteur, collection ou lien vers la source" : "Creator, collection or source URL"} /></label>}
          {!portrait && <>
          <label><span>{fr ? "Description de l’image" : "Image description"}</span><input name="imageAlt" defaultValue={values.imageAlt ?? ""} /></label>
          <label><span>{fr ? "Crédit" : "Credit"}</span><input name="imageCredit" defaultValue={values.imageCredit ?? ""} /></label>
          <label><span>{fr ? "Lien du crédit" : "Credit URL"}</span><input name="imageCreditUrl" type="url" defaultValue={values.imageCreditUrl ?? ""} /></label>
          <label><span>{fr ? "Licence" : "License"}</span><input name="imageLicense" defaultValue={values.imageLicense ?? ""} /></label>
          </>}
        </div>
        <input ref={inputRef} type="file" accept="image/avif,image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <div className="library-image-upload-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{busy ? (fr ? "Téléversement…" : "Uploading…") : portrait ? (fr ? "Téléverser un portrait" : "Upload a portrait") : (fr ? "Téléverser une image" : "Upload an image")}</button>
          {imageUrl && <button type="button" className="secondary" onClick={() => setImageUrl("")}><X size={16} />{fr ? "Retirer" : "Remove"}</button>}
        </div>
        {message && <p role="status" className="muted text-sm">{message}</p>}
        {imageUrl && <div className="library-image-upload-preview"><img src={imageUrl} alt="" /></div>}
        {portrait && <details className="library-form-section"><summary>{fr ? "Précisions sur le portrait" : "Portrait details"}</summary><div className="library-form-grid">
          <label><span>{fr ? "Description du portrait" : "Portrait description"}</span><input name="imageAlt" defaultValue={values.imageAlt ?? ""} /></label>
          <label><span>{fr ? "Lien de la source" : "Source URL"}</span><input name="imageCreditUrl" type="url" defaultValue={values.imageCreditUrl ?? ""} /></label>
          <label><span>{fr ? "Licence" : "License"}</span><input name="imageLicense" defaultValue={values.imageLicense ?? ""} /></label>
        </div></details>}
      </div>
  );
  return portrait ? <div className="library-portrait-fields">{fields}</div> : <details className="library-form-section"><summary>{fr ? "Image et crédit" : "Image and credit"}</summary>{fields}</details>;
}
