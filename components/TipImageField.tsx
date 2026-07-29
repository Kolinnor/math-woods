"use client";

import { ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import {
  DEFAULT_TIP_IMAGE_POSITION,
  DEFAULT_TIP_IMAGE_URL,
  tipImageObjectPosition
} from "@/lib/tip-images";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type UploadResponse = {
  error?: string;
  image?: {
    publicUrl?: string;
  };
};

type TipImageFieldProps = {
  initialImageUrl: string | null;
  initialPositionX: number;
  initialPositionY: number;
};

export function TipImageField({
  initialImageUrl,
  initialPositionX,
  initialPositionY
}: TipImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
  const [positionX, setPositionX] = useState(initialPositionX);
  const [positionY, setPositionY] = useState(initialPositionY);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveImageUrl = imageUrl.trim() || DEFAULT_TIP_IMAGE_URL;
  const objectPosition = tipImageObjectPosition(positionX, positionY);

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
      <div className="tip-image-previews">
        {!previewFailed ? (
          <>
            <figure>
              <figcaption>Desktop · 220 × 220 px</figcaption>
              <div className="tip-image-preview tip-image-preview-desktop">
                <img
                  key={`desktop-${effectiveImageUrl}`}
                  src={effectiveImageUrl}
                  alt=""
                  style={{ objectPosition }}
                  onLoad={() => setPreviewFailed(false)}
                  onError={() => setPreviewFailed(true)}
                />
              </div>
            </figure>
            <figure>
              <figcaption>Mobile · full width (16:7)</figcaption>
              <div className="tip-image-preview tip-image-preview-mobile">
                <img
                  key={`mobile-${effectiveImageUrl}`}
                  src={effectiveImageUrl}
                  alt=""
                  style={{ objectPosition }}
                  onLoad={() => setPreviewFailed(false)}
                  onError={() => setPreviewFailed(true)}
                />
              </div>
            </figure>
          </>
        ) : (
          <div className="tip-image-preview tip-image-preview-desktop">
            <p>Preview unavailable. Check the image URL.</p>
          </div>
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
        <fieldset className="tip-image-crop-controls">
          <legend>Crop position</legend>
          <label>
            <span>
              Horizontal focus
              <output>{positionX}%</output>
            </span>
            <input
              name="imagePositionX"
              type="range"
              min="0"
              max="100"
              value={positionX}
              onChange={(event) => setPositionX(Number(event.target.value))}
            />
          </label>
          <label>
            <span>
              Vertical focus
              <output>{positionY}%</output>
            </span>
            <input
              name="imagePositionY"
              type="range"
              min="0"
              max="100"
              value={positionY}
              onChange={(event) => setPositionY(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={positionX === DEFAULT_TIP_IMAGE_POSITION && positionY === DEFAULT_TIP_IMAGE_POSITION}
            onClick={() => {
              setPositionX(DEFAULT_TIP_IMAGE_POSITION);
              setPositionY(DEFAULT_TIP_IMAGE_POSITION);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Center crop
          </button>
        </fieldset>
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
              setPositionX(DEFAULT_TIP_IMAGE_POSITION);
              setPositionY(DEFAULT_TIP_IMAGE_POSITION);
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
