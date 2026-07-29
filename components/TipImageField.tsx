"use client";

import { ImagePlus, RotateCcw } from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  DEFAULT_TIP_IMAGE_POSITION,
  DEFAULT_TIP_IMAGE_URL,
  tipImageObjectPosition
} from "@/lib/tip-images";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KEYBOARD_POSITION_STEP = 3;
const KEYBOARD_POSITION_MOVEMENT: Partial<Record<string, readonly [number, number]>> = {
  ArrowDown: [0, -KEYBOARD_POSITION_STEP],
  ArrowLeft: [KEYBOARD_POSITION_STEP, 0],
  ArrowRight: [-KEYBOARD_POSITION_STEP, 0],
  ArrowUp: [0, KEYBOARD_POSITION_STEP]
};

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
  const dragRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveImageUrl = imageUrl.trim() || DEFAULT_TIP_IMAGE_URL;
  const objectPosition = tipImageObjectPosition(positionX, positionY);

  function clampPosition(position: number) {
    return Math.max(0, Math.min(100, Math.round(position)));
  }

  function startPositioning(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      positionX,
      positionY,
      width: bounds.width,
      height: bounds.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function movePosition(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPositionX(clampPosition(drag.positionX - ((event.clientX - drag.pointerX) / drag.width) * 100));
    setPositionY(clampPosition(drag.positionY - ((event.clientY - drag.pointerY) / drag.height) * 100));
  }

  function stopPositioning(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  function movePositionWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const movement = KEYBOARD_POSITION_MOVEMENT[event.key];
    if (!movement) return;
    event.preventDefault();
    setPositionX((current) => clampPosition(current + movement[0]));
    setPositionY((current) => clampPosition(current + movement[1]));
  }

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
          <figure>
            <figcaption>Desktop and mobile · square</figcaption>
            <div
              className={dragging
                ? "tip-image-preview tip-image-preview-square dragging"
                : "tip-image-preview tip-image-preview-square"}
              role="application"
              tabIndex={0}
              aria-label="Drag or use the arrow keys to reposition the image inside the square crop."
              onKeyDown={movePositionWithKeyboard}
              onPointerDown={startPositioning}
              onPointerMove={movePosition}
              onPointerUp={stopPositioning}
              onPointerCancel={stopPositioning}
            >
              <img
                key={effectiveImageUrl}
                src={effectiveImageUrl}
                alt=""
                draggable={false}
                style={{ objectPosition }}
                onLoad={() => setPreviewFailed(false)}
                onError={() => setPreviewFailed(true)}
              />
              <span className="tip-image-crop-frame" aria-hidden="true" />
            </div>
          </figure>
        ) : (
          <div className="tip-image-preview tip-image-preview-square">
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
          <legend>Crop</legend>
          <p>Drag or touch the image to position it inside the square.</p>
          <input name="imagePositionX" type="hidden" value={positionX} />
          <input name="imagePositionY" type="hidden" value={positionY} />
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
            Center image
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
