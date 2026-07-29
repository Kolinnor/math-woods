"use client";

import { ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { DEFAULT_TIP_IMAGE_URL } from "@/lib/tip-images";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type UploadResponse = {
  error?: string;
  image?: {
    publicUrl?: string;
  };
};

export function TipImageField({ initialImageUrl }: { initialImageUrl: string | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveImageUrl = imageUrl.trim() || DEFAULT_TIP_IMAGE_URL;

  async function upload(file: File) {
    if (
      !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(file.type)
      || file.size <= 0
      || file.size > MAX_IMAGE_BYTES
    ) {
      setMessage("Choose an AVIF, JPEG, PNG, or WebP image smaller than 5 MB.");
      return;
    }

    setBusy(true);
    setMessage("Uploading image...");
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/images/upload", { method: "POST", body: formData });
      const result = await response.json().catch(() => null) as UploadResponse | null;
      const publicUrl = result?.image?.publicUrl;
      if (!response.ok || !publicUrl) throw new Error(result?.error || "Image upload failed.");

      setImageUrl(publicUrl);
      setPreviewFailed(false);
      setMessage("Image uploaded. Save the tip to keep it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="tip-image-editor">
      <div className="tip-image-preview">
        {!previewFailed ? (
          <img
            key={effectiveImageUrl}
            src={effectiveImageUrl}
            alt=""
            onLoad={() => setPreviewFailed(false)}
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <p>Preview unavailable. Check the image URL.</p>
        )}
      </div>
      <div className="tip-image-controls">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Image</span>
          <input
            name="imageUrl"
            value={imageUrl}
            maxLength={1200}
            placeholder={DEFAULT_TIP_IMAGE_URL}
            onChange={(event) => {
              setImageUrl(event.target.value);
              setPreviewFailed(false);
              setMessage(null);
            }}
          />
        </label>
        <p className="muted text-sm">
          Paste a secure image URL, use a local site path, or upload an image. Leave blank to use Oak Grove.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/avif,image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="tip-image-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={16} aria-hidden="true" />
            {busy ? "Uploading..." : "Upload image"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !imageUrl}
            onClick={() => {
              setImageUrl("");
              setPreviewFailed(false);
              setMessage("The default image will be used after saving.");
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Use default
          </button>
        </div>
        {message && <p className="tip-image-message" role="status">{message}</p>}
      </div>
    </section>
  );
}
